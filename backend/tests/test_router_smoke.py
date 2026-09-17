import os
import sys
import tempfile
import json
import httpx
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

os.environ.setdefault(
    "DATABASE_URL",
    f"sqlite:///{Path(tempfile.gettempdir()) / 'german_learning_router_smoke_tests.db'}",
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.exc import SQLAlchemyError

import auth
import database
import models
import rate_limits
import services.claude_service as claude_service
import services.exercise_engine as exercise_engine
from routers.chat import (
    _build_realtime_instructions,
    _build_realtime_transcription,
    _build_realtime_turn_detection,
)
from routers.flashcards import (
    FlashcardExtendRequest,
    FlashcardGenerateRequest,
    _save_generated_flashcard_set,
    _validate_and_order_supplied_term_cards,
)
from main import app


USER_ID = UUID("33333333-3333-4333-8333-333333333333")


def test_realtime_prompt_uses_topic_and_natural_turn_taking():
    instructions = _build_realtime_instructions("Wohnungssuche in Zürich", "B2")

    assert "<topic>Wohnungssuche in Zürich</topic>" in instructions
    assert "CEFR level B2" in instructions
    assert "one short sentence per turn" in instructions
    assert "no more than 20 spoken words" in instructions
    assert "Do not ask a question in every turn" in instructions
    assert "Ask at most one short question" in instructions
    assert "stop speaking and wait" in instructions
    assert "not an interviewer" in instructions


def test_realtime_vad_uses_balanced_turn_timing():
    turn_detection = _build_realtime_turn_detection()

    assert turn_detection == {
        "type": "semantic_vad",
        "eagerness": "medium",
        "create_response": True,
        "interrupt_response": True,
    }


def test_realtime_transcription_preserves_learner_wording():
    transcription = _build_realtime_transcription("Wohnungssuche in Zürich")

    assert transcription["model"] == "gpt-4o-transcribe"
    assert transcription["language"] == "de"
    assert "<topic>Wohnungssuche in Zürich</topic>" in transcription["prompt"]
    assert "verbatim German transcript" in transcription["prompt"]
    assert "grammatical mistakes" in transcription["prompt"]
    assert "Do not correct" in transcription["prompt"]
    assert "paraphrase" in transcription["prompt"]


@pytest.fixture(autouse=True)
def clean_database():
    rate_limits._buckets.clear()
    models.Base.metadata.drop_all(bind=database.engine)
    models.Base.metadata.create_all(bind=database.engine)
    yield
    models.Base.metadata.drop_all(bind=database.engine)
    rate_limits._buckets.clear()


@pytest.fixture
def current_user_holder():
    return {"user": _current_user(USER_ID)}


@pytest.fixture
def client(current_user_holder):
    def override_get_current_user():
        return current_user_holder["user"]

    def override_get_db():
        db = database.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[auth.get_current_user] = override_get_current_user
    app.dependency_overrides[database.get_db] = override_get_db

    yield TestClient(app)

    app.dependency_overrides.clear()


@pytest.fixture
def db_session():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def user(db_session):
    user = models.User(id=USER_ID, username="smoke-user", level="B2", german_variant="de-DE")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def seeded_session(db_session, user):
    session = models.ConversationSession(
        user_id=user.id,
        topic="Wohnungssuche",
        topic_category="Daily life",
        message_count=2,
    )
    db_session.add(session)
    db_session.flush()
    message = models.Message(
        session_id=session.id,
        role="user",
        content="Ich suche eine Wohnung.",
    )
    db_session.add(message)
    db_session.commit()
    db_session.refresh(session)
    db_session.refresh(message)
    return session


def _current_user(user_id: UUID):
    return auth.CurrentUser(
        id=user_id,
        email="smoke@example.test",
        metadata={},
        raw=SimpleNamespace(id=str(user_id)),
    )


def _fake_auth_response(user_id: UUID = USER_ID):
    return SimpleNamespace(
        session=SimpleNamespace(
            access_token="test-access-token",
            refresh_token="test-refresh-token",
            expires_at=4_102_444_800,
            token_type="bearer",
        ),
        user=SimpleNamespace(
            id=str(user_id),
            email="smoke@example.test",
            user_metadata={"username": "smoke-user"},
        ),
    )


def test_flashcard_cloze_is_stored_for_later_attempts(
    db_session,
    user,
    monkeypatch,
):
    flashcard_set = models.FlashcardSet(
        id="contacts-b2",
        user_id=user.id,
        topic="Kontakte",
        level="B2",
        title="Kontakte pflegen",
        description="",
    )
    flashcard_set.cards.extend([
        models.FlashcardCard(
            card_id="kontakt-aufnehmen",
            position=1,
            front="den Kontakt zu jemandem aufnehmen",
            back="to contact someone",
            example="Sie nahm Kontakt zu ihm auf.",
            case_examples={},
            tense_examples={},
            tags=[],
        ),
        models.FlashcardCard(
            card_id="kontakt-abbrechen",
            position=2,
            front="den Kontakt abbrechen",
            back="to break off contact",
            example="Sie brach den Kontakt ab.",
            case_examples={},
            tense_examples={},
            tags=[],
        ),
    ])
    db_session.add(flashcard_set)
    db_session.commit()

    def fake_generate(**kwargs):
        assert len(kwargs["cards"]) == 2
        return {
            "title": "Kontakt halten",
            "source_text": (
                "Nach dem Treffen möchte Lea den Kontakt zu ihrer Kollegin [1]. "
                "Schließlich muss sie den Kontakt leider [2]."
            ),
            "word_bank": ["aufnehmen", "abbrechen"],
            "gaps": [
                {
                    "id": 1,
                    "card_id": "kontakt-aufnehmen",
                    "source_term": "den Kontakt zu jemandem aufnehmen",
                    "answer": "aufnehmen",
                    "accepted_answers": ["aufnehmen"],
                    "hint": "eine Verbindung beginnen",
                },
                {
                    "id": 2,
                    "card_id": "kontakt-abbrechen",
                    "source_term": "den Kontakt abbrechen",
                    "answer": "abbrechen",
                    "accepted_answers": ["abbrechen"],
                    "hint": "eine Verbindung beenden",
                },
            ],
        }

    monkeypatch.setattr(exercise_engine, "generate_vocabulary_cloze", fake_generate)
    generated = exercise_engine.create_flashcard_vocabulary_cloze_exercises(
        db=db_session,
        user_id=user.id,
        flashcard_set=flashcard_set,
        count=2,
    )
    assert len(generated) == 1
    stored = db_session.query(models.Exercise).filter(models.Exercise.id == generated[0].id).one()
    assert stored.content["source_set_id"] == "contacts-b2"
    assert stored.content["source_text"].startswith("Nach dem Treffen")
    assert "ß" not in str(stored.content)
    assert stored.answer_key == {"1": ["aufnehmen"], "2": ["abbrechen"]}


def test_vocabulary_scoring_does_not_accept_last_word_of_a_phrase():
    exercise = SimpleNamespace(
        exercise_type="vocabulary_cloze",
        answer_key={"1": "den Kontakt zu jemandem aufnehmen"},
        content={},
    )

    result = exercise_engine.score_exercise(exercise, {"1": "aufnehmen"})

    assert result["score"] == 0


def test_flashcard_cloze_rejects_count_larger_than_set(db_session, user):
    flashcard_set = models.FlashcardSet(
        id="small-set",
        user_id=user.id,
        topic="Small",
        level="B2",
        title="Small set",
        description="",
    )
    flashcard_set.cards.append(models.FlashcardCard(
        card_id="only-card",
        position=1,
        front="ein Wort",
        back="a word",
        example="",
        case_examples={},
        tense_examples={},
        tags=[],
    ))

    with pytest.raises(ValueError, match="Requested 20 cards"):
        exercise_engine.create_flashcard_vocabulary_cloze_exercises(
            db=db_session,
            user_id=user.id,
            flashcard_set=flashcard_set,
            count=20,
        )


def _guided_fill_payload(category: str):
    sentences = []
    for item_id in range(1, 6):
        item = {
            "id": item_id,
            "text": f"Ihr ___ die Aufgabe {item_id}.",
        }
        if category == "case":
            item.update({
                "word": "die grosse Aufgabe",
                "case": "Akkusativ",
                "answer_scope": "full_phrase",
            })
        else:
            item.update({
                "verb": "lösen",
                "tense": "Präsens",
            })
        sentences.append(item)
    return {
        "exercise_type": "fill_blank",
        "title": "Große Übung",
        "instructions": "Füllt die Lücken aus.",
        "content": {"sentences": sentences},
        "answer_key": {str(item_id): "löst" for item_id in range(1, 6)},
    }


@pytest.mark.parametrize("category", ["verb_conjugation", "tense", "case"])
def test_guided_fill_validation_requires_metadata_and_enforces_swiss_spelling(category):
    validated = claude_service._validate_standard_exercise(
        _guided_fill_payload(category),
        exercise_type="fill_blank",
        error_category=category,
    )

    assert validated["title"] == "Grosse Übung"
    assert validated["answer_key"]["1"] == ["löst"]


def test_guided_verb_validation_rejects_missing_tense():
    payload = _guided_fill_payload("verb_conjugation")
    payload["content"]["sentences"][0].pop("tense")

    with pytest.raises(ValueError, match="verb item 1 needs tense"):
        claude_service._validate_standard_exercise(
            payload,
            exercise_type="fill_blank",
            error_category="verb_conjugation",
        )


def test_guided_verb_validation_cleans_nonessential_metadata_and_aliases():
    payload = _guided_fill_payload("verb_conjugation")
    item = payload["content"]["sentences"][0]
    item["infinitive"] = item.pop("verb")
    item["target_tense"] = item.pop("tense")
    item["person"] = "2. Person Plural"
    item["hint"] = "ihr"

    validated = claude_service._validate_standard_exercise(
        payload,
        exercise_type="fill_blank",
        error_category="verb_conjugation",
    )

    cleaned = validated["content"]["sentences"][0]
    assert cleaned["verb"] == "lösen"
    assert cleaned["tense"] == "Präsens"
    assert "person" not in cleaned
    assert "hint" not in cleaned


def test_compound_answer_check_is_limited_to_the_blank_clause():
    payload = _guided_fill_payload("tense")
    payload["content"]["sentences"][0].update({
        "text": "Er hat gesagt, dass ihr die Aufgabe ___.",
        "tense": "Perfekt",
    })
    payload["answer_key"]["1"] = ["habt gelöst"]

    validated = claude_service._validate_standard_exercise(
        payload,
        exercise_type="fill_blank",
        error_category="tense",
    )

    assert validated["answer_key"]["1"] == ["habt gelöst"]


def test_guided_verb_validation_rejects_visible_part_of_compound_answer():
    payload = _guided_fill_payload("tense")
    payload["content"]["sentences"][0]["text"] = "Ihr habt die Aufgabe bereits gelöst ___."
    payload["answer_key"]["1"] = ["habt gelöst"]

    with pytest.raises(ValueError, match="already contains part of its complete answer"):
        claude_service._validate_standard_exercise(
            payload,
            exercise_type="fill_blank",
            error_category="tense",
        )


def test_guided_verb_validation_accepts_only_the_missing_compound_part():
    payload = _guided_fill_payload("tense")
    payload["content"]["sentences"][0].update({
        "text": "Ihr habt die Aufgabe bereits ___.",
        "tense": "Perfekt",
    })
    payload["answer_key"]["1"] = ["gelöst"]

    validated = claude_service._validate_standard_exercise(
        payload,
        exercise_type="fill_blank",
        error_category="tense",
    )

    assert validated["answer_key"]["1"] == ["gelöst"]


@pytest.mark.parametrize(
    "focus",
    [
        "Zustandspassiv vs. Vorgangspassiv",
        "Zustands-Passiv",
        "Vorgangspassiv im Präsens",
        "state versus process passive",
    ],
)
def test_passive_contrast_focus_is_routed_separately(focus):
    assert exercise_engine._is_passive_contrast_focus(focus) is True


def test_passive_contrast_prompt_does_not_expose_auxiliary_as_metadata():
    prompt = claude_service._build_exercise_prompt(
        error_category="tense",
        subcategories=["Zustandspassiv und Vorgangspassiv"],
        exercise_type="multiple_choice",
        difficulty="B2",
        example_errors=[],
        exercise_variant="passive_contrast",
    )

    assert "past participle remains visible" in prompt
    assert "do not show sein or werden as a hint" in prompt
    assert "exactly one ___ for the finite auxiliary" in prompt


def test_passive_contrast_generation_uses_multiple_choice(db_session, user, monkeypatch):
    captured = {}

    def fake_generate_exercise(**kwargs):
        captured.update(kwargs)
        return {
            "exercise_type": "multiple_choice",
            "title": "Passiv",
            "instructions": "Wählt die passende Form.",
            "content": {"questions": []},
            "answer_key": {},
        }

    monkeypatch.setattr(exercise_engine, "generate_exercise", fake_generate_exercise)

    created = exercise_engine.create_exercises_for_user(
        db=db_session,
        user_id=user.id,
        user_level="B2",
        focus_categories=["tense"],
        exercise_topic="Zustandspassiv versus Vorgangspassiv",
        count=1,
    )

    assert len(created) == 1
    assert captured["exercise_type"] == "multiple_choice"
    assert captured["exercise_variant"] == "passive_contrast"
    assert captured["context_inspiration"]


def test_exercise_contexts_include_personal_conversation_topics(db_session, user):
    db_session.add_all([
        models.ConversationSession(
            user_id=user.id,
            topic="Wohnungssuche in Zürich",
            topic_category="Daily life",
        ),
        models.ConversationSession(
            user_id=user.id,
            topic="Ein Vorstellungsgespräch",
            topic_category="Work",
        ),
    ])
    db_session.commit()

    topics = exercise_engine.get_exercise_context_topics(db_session, user.id, limit=5)

    assert "Wohnungssuche in Zürich" in topics
    assert "Ein Vorstellungsgespräch" in topics
    assert len(topics) == 5


def test_exercise_prompt_uses_context_and_recent_sentences():
    prompt = claude_service._build_exercise_prompt(
        error_category="verb_conjugation",
        subcategories=["Konjunktiv II"],
        exercise_type="fill_blank",
        difficulty="B2",
        example_errors=[],
        context_inspiration="Wohnungssuche in Zürich",
        avoid_sentences=["Ich löse die Aufgabe."],
    )

    assert "Wohnungssuche in Zürich" in prompt
    assert "Do not repeat or closely paraphrase" in prompt
    assert "Ich löse die Aufgabe." in prompt
    assert "Vary people, actions, vocabulary" in prompt


def test_generated_exercise_gets_separate_grammar_review(monkeypatch):
    generated = _guided_fill_payload("verb_conjugation")
    generated["content"]["sentences"][0].update({
        "text": "An deiner Stelle ___ ich früher nach Hause gegangen.",
        "verb": "werden",
        "tense": "Konjunktiv II Präsens",
    })
    generated["answer_key"]["1"] = ["würde"]
    reviewed = json.loads(json.dumps(generated))
    reviewed["content"]["sentences"][0].update({
        "verb": "gehen",
        "tense": "Konjunktiv II Vergangenheit",
    })
    reviewed["answer_key"]["1"] = ["wäre"]

    calls = []
    responses = iter((generated, reviewed))

    def fake_create(**kwargs):
        calls.append(kwargs)
        payload = next(responses)
        return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(payload, ensure_ascii=False))])

    monkeypatch.setattr(claude_service.client.messages, "create", fake_create)

    result = claude_service.generate_exercise(
        error_category="verb_conjugation",
        subcategories=["Konjunktiv II"],
        exercise_type="fill_blank",
        difficulty="B2",
        example_errors=[],
    )

    assert len(calls) == 2
    assert calls[1]["system"] == claude_service.EXERCISE_REVIEW_SYSTEM_PROMPT
    assert "würde requires an infinitive" in calls[1]["messages"][0]["content"]
    assert result["answer_key"]["1"] == ["wäre"]
    assert result["content"]["sentences"][0]["verb"] == "gehen"


def test_reduced_exercise_mapping():
    assert exercise_engine.CATEGORY_EXERCISE_MAP["case"] == ["fill_blank"]
    assert exercise_engine.CATEGORY_EXERCISE_MAP["verb_conjugation"] == ["fill_blank"]
    assert exercise_engine.CATEGORY_EXERCISE_MAP["tense"] == ["fill_blank"]
    assert exercise_engine.CATEGORY_EXERCISE_MAP["preposition"] == ["multiple_choice"]
    assert exercise_engine.CATEGORY_EXERCISE_MAP["word_order"] == ["correction"]
    for removed in ("spelling", "punctuation", "style", "other"):
        assert removed not in exercise_engine.CATEGORY_EXERCISE_MAP
    assert "translation" not in exercise_engine.EXERCISE_TYPES


def test_distinct_categories_group_tense_with_verb_conjugation():
    selected = exercise_engine._distinct_category_items(
        [
            {"category": "verb_conjugation", "count": 5},
            {"category": "tense", "count": 4},
            {"category": "case", "count": 3},
            {"category": "preposition", "count": 2},
        ],
        limit=3,
    )

    assert [item["category"] for item in selected] == [
        "verb_conjugation",
        "case",
        "preposition",
    ]


def test_automatic_generation_uses_three_distinct_categories(db_session, user, monkeypatch):
    generated_categories = []
    monkeypatch.setattr(
        exercise_engine,
        "get_weak_categories",
        lambda *args, **kwargs: [
            {"category": "verb_conjugation", "count": 5},
            {"category": "tense", "count": 4},
            {"category": "case", "count": 3},
            {"category": "preposition", "count": 2},
        ],
    )
    monkeypatch.setattr(exercise_engine, "get_subcategories", lambda *args, **kwargs: [])
    monkeypatch.setattr(exercise_engine, "get_example_errors", lambda *args, **kwargs: [])

    def fake_generate_exercise(**kwargs):
        generated_categories.append(kwargs["error_category"])
        return {
            "exercise_type": kwargs["exercise_type"],
            "title": "Übung im Kontext",
            "instructions": "Bearbeitet die Aufgaben.",
            "content": {},
            "answer_key": {},
        }

    monkeypatch.setattr(exercise_engine, "generate_exercise", fake_generate_exercise)

    created = exercise_engine.create_exercises_for_user(
        db=db_session,
        user_id=user.id,
        user_level="B2",
        count=3,
    )

    assert len(created) == 3
    assert generated_categories == ["verb_conjugation", "case", "preposition"]


def test_generation_creates_one_exercise_per_selected_category(db_session, user, monkeypatch):
    generated_categories = []
    monkeypatch.setattr(exercise_engine, "get_subcategories", lambda *args, **kwargs: [])
    monkeypatch.setattr(exercise_engine, "get_example_errors", lambda *args, **kwargs: [])

    def fake_generate_exercise(**kwargs):
        generated_categories.append(kwargs["error_category"])
        return {
            "exercise_type": kwargs["exercise_type"],
            "title": "Übung im Kontext",
            "instructions": "Bearbeitet die Aufgaben.",
            "content": {},
            "answer_key": {},
        }

    monkeypatch.setattr(exercise_engine, "generate_exercise", fake_generate_exercise)

    created = exercise_engine.create_exercises_for_user(
        db=db_session,
        user_id=user.id,
        user_level="B2",
        focus_categories=["case", "preposition"],
        count=10,
    )

    assert len(created) == 2
    assert generated_categories == ["case", "preposition"]


def test_multiple_choice_validation_requires_four_labelled_options():
    questions = [
        {
            "id": item_id,
            "question": f"Ich warte ___ den Bus {item_id}.",
            "options": ["A) auf", "B) an", "C) mit", "D) von"],
        }
        for item_id in range(1, 6)
    ]
    payload = {
        "exercise_type": "multiple_choice",
        "title": "Präpositionen",
        "instructions": "Wählt die passende Präposition.",
        "content": {"questions": questions},
        "answer_key": {str(item_id): "A" for item_id in range(1, 6)},
    }

    validated = claude_service._validate_standard_exercise(
        payload,
        exercise_type="multiple_choice",
        error_category="preposition",
    )
    assert validated["answer_key"]["1"] == "A"

    revealing_title = json.loads(json.dumps(payload))
    revealing_title["title"] = "Die Präposition auf"
    with pytest.raises(ValueError, match="title must not reveal a declared answer"):
        claude_service._validate_standard_exercise(
            revealing_title,
            exercise_type="multiple_choice",
            error_category="preposition",
        )

    payload["content"]["questions"][0]["options"][3] = "E) bei"
    with pytest.raises(ValueError, match="labelled A through D"):
        claude_service._validate_standard_exercise(
            payload,
            exercise_type="multiple_choice",
            error_category="preposition",
        )

    payload["content"]["questions"][0]["options"] = ["A) auf", "B) auf", "C) mit", "D) von"]
    with pytest.raises(ValueError, match="options must be unique"):
        claude_service._validate_standard_exercise(
            payload,
            exercise_type="multiple_choice",
            error_category="preposition",
        )


def test_fill_title_must_not_reveal_the_answer():
    payload = _guided_fill_payload("verb_conjugation")
    payload["title"] = "Setzt löst ein"

    with pytest.raises(ValueError, match="title must not reveal a declared answer"):
        claude_service._validate_standard_exercise(
            payload,
            exercise_type="fill_blank",
            error_category="verb_conjugation",
        )


def test_exercise_list_hides_removed_historical_formats(db_session, user):
    from routers.exercises import get_user_exercises

    exercises = [
        models.Exercise(
            user_id=user.id,
            error_category=category,
            exercise_type=exercise_type,
            title=f"{category} exercise",
            instructions="Instructions",
            content={"sentences": []},
            answer_key={},
            difficulty="B2",
        )
        for category, exercise_type in [
            ("case", "fill_blank"),
            ("spelling", "correction"),
            ("punctuation", "correction"),
            ("style", "correction"),
            ("grammar", "translation"),
        ]
    ]
    db_session.add_all(exercises)
    db_session.commit()

    visible = get_user_exercises(
        db=db_session,
        current_user=_current_user(user.id),
    )

    assert len(visible) == 1
    assert visible[0].error_category == "case"
    assert visible[0].exercise_type == "fill_blank"


def test_correction_scoring_accepts_declared_variants():
    exercise = SimpleNamespace(
        exercise_type="correction",
        answer_key={"1": ["Heute gehe ich nach Hause.", "Ich gehe heute nach Hause."]},
        content={},
    )

    result = exercise_engine.score_exercise(
        exercise,
        {"1": "Ich gehe heute nach Hause"},
    )

    assert result["score"] == 100


@pytest.mark.parametrize(
    ("card_count", "expected_batch_sizes"),
    [
        (12, [12]),
        (20, [10, 10]),
        (25, [9, 8, 8]),
    ],
)
def test_flashcard_cloze_balances_passage_sizes(
    db_session,
    user,
    monkeypatch,
    card_count,
    expected_batch_sizes,
):
    flashcard_set = models.FlashcardSet(
        id=f"batching-{card_count}",
        user_id=user.id,
        topic="Wortschatz",
        level="B2",
        title="Batching test",
        description="",
    )
    for index in range(1, card_count + 1):
        flashcard_set.cards.append(models.FlashcardCard(
            card_id=f"card-{index}",
            position=index,
            front=f"Wort {index}",
            back=f"word {index}",
            example="",
            case_examples={},
            tense_examples={},
            tags=[],
        ))
    db_session.add(flashcard_set)
    db_session.commit()

    generated_batch_sizes = []

    def fake_generate(**kwargs):
        cards = kwargs["cards"]
        generated_batch_sizes.append(len(cards))
        return {
            "title": "Wortschatz",
            "source_text": " ".join(f"Satz [{index}]." for index in range(1, len(cards) + 1)),
            "word_bank": [f"Antwort {index}" for index in range(1, len(cards) + 1)],
            "gaps": [
                {
                    "id": index,
                    "card_id": card["id"],
                    "source_term": card["front"],
                    "answer": f"Antwort {index}",
                    "accepted_answers": [f"Antwort {index}"],
                    "hint": "Hinweis",
                }
                for index, card in enumerate(cards, start=1)
            ],
        }

    monkeypatch.setattr(exercise_engine, "generate_vocabulary_cloze", fake_generate)
    exercises = exercise_engine.create_flashcard_vocabulary_cloze_exercises(
        db=db_session,
        user_id=user.id,
        flashcard_set=flashcard_set,
        count=None,
    )

    assert generated_batch_sizes == expected_batch_sizes
    assert [len(exercise.content["gaps"]) for exercise in exercises] == expected_batch_sizes


def test_auth_router_sign_in_sign_up_refresh(client, monkeypatch):
    fake_auth = SimpleNamespace(
        sign_in_with_password=lambda payload: _fake_auth_response(),
        sign_up=lambda payload: _fake_auth_response(),
        refresh_session=lambda refresh_token: _fake_auth_response(),
    )
    monkeypatch.setattr("routers.auth.get_supabase_client", lambda: SimpleNamespace(auth=fake_auth))

    sign_in = client.post("/auth/sign-in", json={"email": "smoke@example.test", "password": "secret123"})
    assert sign_in.status_code == 200
    assert sign_in.json()["access_token"] == "test-access-token"

    sign_up = client.post(
        "/auth/sign-up",
        json={
            "email": "new@example.test",
            "password": "secret123",
            "username": "new-user",
            "level": "B2",
            "german_variant": "de-DE",
        },
    )
    assert sign_up.status_code == 200
    assert sign_up.json()["profile"]["username"] in {"smoke-user", "new-user"}

    refresh = client.post("/auth/refresh", json={"refresh_token": "test-refresh-token"})
    assert refresh.status_code == 200
    assert refresh.json()["token_type"] == "bearer"


def test_users_router_profile_flow(client, user):
    assert client.get("/users/me").status_code == 200

    updated = client.patch(
        "/users/me",
        json={"level": "C1", "german_variant": "de-CH"},
    )
    assert updated.status_code == 200
    assert updated.json()["level"] == "C1"

    level = client.patch("/users/me/level", params={"level": "B1"})
    assert level.status_code == 200


def test_sessions_router_basic_flow(client, user, seeded_session):
    assert client.get("/sessions/topics").status_code == 200

    created = client.post(
        "/sessions/",
        json={"topic": "Arbeit", "topic_category": "Work"},
    )
    assert created.status_code == 200
    assert created.json()["topic"] == "Arbeit"

    history = client.get("/sessions/me")
    assert history.status_code == 200

    messages = client.get(f"/sessions/{seeded_session.id}/messages")
    assert messages.status_code == 200
    assert messages.json()[0]["content"] == "Ich suche eine Wohnung."


def test_saved_free_topics_keep_custom_category_for_topic_cards(client, db_session, user):
    from datetime import datetime, timezone

    session = models.ConversationSession(
        user_id=user.id,
        topic="Urban gardening",
        topic_category="My interests",
        message_count=2,
        ended_at=datetime.now(timezone.utc),
    )
    db_session.add(session)
    db_session.commit()

    response = client.get("/sessions/free-conversation-topics")

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Urban gardening"
    assert response.json()[0]["category"] == "My interests"


def test_chat_router_with_mocked_llm(client, user, seeded_session, monkeypatch):
    monkeypatch.setattr("routers.chat.generate_opening_message", lambda topic, level: "Guten Tag!")
    monkeypatch.setattr(
        "routers.chat.get_chat_response",
        lambda **kwargs: {
            "reply": "Sehr gut.",
            "corrections": [],
            "corrected_user_message": None,
            "has_errors": False,
        },
    )
    monkeypatch.setattr(
        "routers.chat.generate_session_summary",
        lambda **kwargs: {"summary": "Good practice session.", "estimated_level": "B2"},
    )
    monkeypatch.setattr("routers.chat.finalize_session_review", lambda *args, **kwargs: None)

    empty_session = client.post(
        "/sessions/",
        json={"topic": "Reisen", "topic_category": "Travel"},
    ).json()

    opening = client.post(f"/chat/session/{empty_session['id']}/opening")
    assert opening.status_code == 200
    assert opening.json()["reply"] == "Guten Tag!"

    message = client.post(
        "/chat/message",
        json={
            "session_id": seeded_session.id,
            "message": "Hallo!",
            "conversation_history": [],
        },
    )
    assert message.status_code == 200
    assert message.json()["reply"] == "Sehr gut."

    ended = client.post(f"/chat/session/{seeded_session.id}/end")
    assert ended.status_code == 200
    assert ended.json()["review_status"] == "preparing"


def test_streamed_chat_persists_plain_conversation_without_live_feedback(
    client, user, seeded_session, monkeypatch,
):
    monkeypatch.setattr(
        "routers.chat.stream_chat_reply",
        lambda **kwargs: iter(["Sehr ", "gut."]),
    )

    with client.stream(
        "POST",
        "/chat/message/stream",
        json={"session_id": seeded_session.id, "message": "Heute geht es gut.", "conversation_history": []},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: delta" in body
    assert "Sehr gut." not in body  # deltas remain independently renderable SSE events
    db = database.SessionLocal()
    try:
        saved = db.query(models.Message).filter(
            models.Message.session_id == seeded_session.id,
        ).order_by(models.Message.id.asc()).all()
        assert saved[-2].role == "user"
        assert saved[-2].corrected_content is None
        assert saved[-1].content == "Sehr gut."
    finally:
        db.close()


def test_stream_reconnect_replays_without_duplicate_messages(client, db_session, user, seeded_session):
    learner = models.Message(session_id=seeded_session.id, role="user", content="Wie geht es?")
    db_session.add(learner)
    db_session.flush()
    assistant = models.Message(session_id=seeded_session.id, role="assistant", content="Sehr gut.")
    db_session.add(assistant)
    db_session.commit()

    with client.stream(
        "POST",
        "/chat/message/stream",
        json={
            "session_id": seeded_session.id,
            "resume_user_message_id": learner.id,
            "message": learner.content,
            "conversation_history": [],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "replayed" in body
    db_session.expire_all()
    assert db_session.query(models.Message).filter(models.Message.session_id == seeded_session.id).count() == 3


def test_realtime_transcript_sequence_is_idempotent(client, user):
    session = client.post(
        "/sessions/",
        json={"topic": "Reisen", "topic_category": "Travel"},
    ).json()
    payload = {"sequence": 0, "role": "user", "content": "Ich reise gern."}

    first = client.post(f"/chat/session/{session['id']}/transcript", json=payload)
    duplicate = client.post(f"/chat/session/{session['id']}/transcript", json=payload)
    conflict = client.post(
        f"/chat/session/{session['id']}/transcript",
        json={**payload, "content": "Anderer Text"},
    )

    assert first.status_code == 200
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True
    assert duplicate.json()["message_id"] == first.json()["message_id"]
    assert conflict.status_code == 409


def test_hidden_analysis_uses_existing_fields_and_context_marker(
    db_session, user, seeded_session, monkeypatch,
):
    from services.discussion_analysis import analyze_pending_messages, decode_error_context

    monkeypatch.setattr(
        "services.discussion_analysis.analyze_message_batch",
        lambda messages, level: [{
            "message_id": messages[0]["message_id"],
            "has_errors": True,
            "corrected_user_message": "Ich suche eine Wohnung.",
            "corrections": [{
                "category": "gender",
                "subcategory": "Akkusativ",
                "severity": "medium",
                "original": "ein Wohnung",
                "corrected": "eine Wohnung",
                "explanation": "Wohnung is feminine.",
            }],
        }],
    )

    assert analyze_pending_messages(seeded_session.id, user.id, force=True) == 1
    db_session.expire_all()
    message = db_session.query(models.Message).filter(models.Message.session_id == seeded_session.id).one()
    error = db_session.query(models.ErrorRecord).filter(models.ErrorRecord.session_id == seeded_session.id).one()
    linked_message_id, public_context = decode_error_context(error.context)
    assert message.corrected_content == "Ich suche eine Wohnung."
    assert message.has_errors is True
    assert linked_message_id == message.id
    assert public_context == message.content


def test_ready_review_returns_chronological_detail(client, db_session, user, seeded_session):
    from datetime import datetime, timezone
    from services.discussion_analysis import encode_error_context

    message = db_session.query(models.Message).filter(models.Message.session_id == seeded_session.id).one()
    message.corrected_content = "Ich suche eine Wohnung."
    message.has_errors = True
    seeded_session.ended_at = datetime.now(timezone.utc)
    seeded_session.summary = "Strong vocabulary. Prioritise article gender."
    seeded_session.score = 82
    seeded_session.estimated_level = "B2"
    db_session.add(models.ErrorRecord(
        user_id=user.id,
        session_id=seeded_session.id,
        category="gender",
        severity="medium",
        original_text="ein Wohnung",
        corrected_text="eine Wohnung",
        explanation="Wohnung is feminine.",
        context=encode_error_context(message.id, message.content),
    ))
    db_session.commit()

    response = client.get(f"/chat/session/{seeded_session.id}/review")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["mistakes"][0]["message_id"] == message.id
    assert response.json()["mistakes"][0]["corrections"][0]["explanation"] == "Wohnung is feminine."


def test_errors_router_returns_user_dashboards(client, db_session, user, seeded_session):
    db_session.add(models.ErrorRecord(
        user_id=USER_ID,
        session_id=seeded_session.id,
        category="grammar",
        severity="medium",
        original_text="ein Wohnung",
        corrected_text="eine Wohnung",
        explanation="Wohnung is feminine.",
        context="Ich suche ein Wohnung.",
    ))
    db_session.commit()

    assert client.get("/errors/me").status_code == 200
    assert client.get("/errors/me/stats").status_code == 200
    assert client.get("/errors/me/timeline").status_code == 200
    assert client.get("/errors/me/exercise-timeline").status_code == 200
    assert client.get("/errors/me/activity-timeline").status_code == 200


def test_exercises_router_with_mocked_engine(client, db_session, user, monkeypatch):
    def fake_create_exercises_for_user(db, user_id, user_level, focus_categories, exercise_topic, count):
        exercise = models.Exercise(
            user_id=user_id,
            error_category="grammar",
            exercise_type="fill_blank",
            title="Article practice",
            instructions="Fill in the article.",
            content={"sentence": "Ich suche ___ Wohnung."},
            answer_key={"answer": "eine"},
            difficulty=user_level,
        )
        db.add(exercise)
        db.commit()
        db.refresh(exercise)
        return [exercise]

    monkeypatch.setattr("routers.exercises.create_exercises_for_user", fake_create_exercises_for_user)
    monkeypatch.setattr(
        "routers.exercises.score_exercise",
        lambda exercise, answers: {
            "score": 100,
            "feedback": ["Correct."],
            "correct_answers": exercise.answer_key,
            "item_results": [],
        },
    )

    generated = client.post("/exercises/generate", json={"count": 1})
    assert generated.status_code == 200
    exercise_id = generated.json()[0]["id"]

    submitted = client.post(f"/exercises/{exercise_id}/submit", json={"answers": {"answer": "eine"}})
    assert submitted.status_code == 200
    assert submitted.json()["score"] == 100


def test_teacher_router_with_mocked_llm(client, user, monkeypatch):
    monkeypatch.setattr(
        "routers.teacher.generate_teacher_rule",
        lambda **kwargs: {
            "category": "grammar",
            "title": "Article rule",
            "short_answer": "Use feminine article for Wohnung.",
            "explanation": "Wohnung is feminine.",
            "examples": [],
            "related_terms": [],
        },
    )

    created = client.post(
        "/teacher/ask",
        json={"question": "Why eine Wohnung?"},
    )
    assert created.status_code == 200
    assert created.json()["title"] == "Article rule"

    listed = client.get("/teacher/rules/me")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_flashcards_router_with_mocked_generation(client, user, monkeypatch):
    monkeypatch.setattr(
        "routers.flashcards.generate_flashcard_set",
        lambda **kwargs: {
            "topic": "Housing",
            "title": "Housing Words",
            "description": "Housing vocabulary",
            "cards": [
                {
                    "front": front,
                    "back": back,
                    "example": example,
                    "tags": ["housing"],
                }
                for front, back, example in (
                    ("die Wohnung", "apartment", "Ich suche eine Wohnung."),
                    ("der Mietvertrag", "rental agreement", "Ich unterschreibe den Mietvertrag."),
                    ("die Nebenkosten", "additional costs", "Die Nebenkosten sind hoch."),
                )
            ],
        },
    )

    generated = client.post(
        "/flashcards/sets/generate",
        json={"topic": "Housing", "count": 3},
    )
    assert generated.status_code == 200
    set_id = generated.json()["id"]

    assert client.get("/flashcards/sets").status_code == 200
    assert client.get(f"/flashcards/sets/{set_id}").status_code == 200
    assert client.get(f"/flashcards/study-session/{set_id}").status_code == 200
    assert client.get(f"/flashcards/progress/{set_id}").status_code == 200

    saved = client.post(
        "/flashcards/progress/session",
        json={
            "set_id": set_id,
            "reviews": [{"card_id": "die_wohnung", "status": "good"}],
        },
    )
    assert saved.status_code == 200


def test_flashcards_reject_partial_topic_generation(client, user, monkeypatch):
    monkeypatch.setattr(
        "routers.flashcards.generate_flashcard_set",
        lambda **kwargs: {
            "topic": "Housing",
            "title": "Housing Words",
            "cards": [{"front": "die Wohnung", "back": "apartment"}],
        },
    )

    generated = client.post(
        "/flashcards/sets/generate",
        json={"topic": "Housing", "count": 3},
    )

    assert generated.status_code == 502
    assert generated.json()["detail"] == (
        "Claude returned 1 of the 3 requested usable flashcards"
    )


def test_flashcards_generate_from_supplied_terms_with_french_backs(client, user, monkeypatch):
    captured = {}

    def fake_generation(**kwargs):
        captured.update(kwargs)
        return {
            "topic": "Meine Wörter",
            "title": "Meine Wörter",
            "description": "Vom Lernenden ausgewählte Wörter",
            "cards": [
                {"source_id": "term_001", "front": "die Wohnung", "back": "l'appartement", "tags": ["noun"]},
                {"source_id": "term_002", "front": "sich erinnern an", "back": "se souvenir de", "tags": ["verb"]},
            ],
        }

    monkeypatch.setattr("routers.flashcards.generate_flashcard_set", fake_generation)
    generated = client.post(
        "/flashcards/sets/generate",
        json={
            "topic": "Meine Auswahl",
            "terms": ["Wohnung", "sich erinnern an"],
            "translation_language": "fr",
        },
    )

    assert generated.status_code == 200
    assert generated.json()["translation_language"] == "fr"
    assert captured["supplied_terms"] == ["Wohnung", "sich erinnern an"]
    assert captured["count"] == 2
    assert captured["translation_language"] == "fr"

    saved = client.get(f"/flashcards/sets/{generated.json()['id']}")
    assert saved.status_code == 200
    assert saved.json()["translation_language"] == "fr"
    assert saved.json()["cards"][0]["back"] == "l'appartement"
    assert saved.json()["cards"][0]["tags"] == ["noun"]


def test_flashcard_source_ids_track_normalized_terms_and_restore_order():
    prompt = claude_service._build_flashcard_prompt(
        "Meine Wörter",
        "Meine Wörter",
        "B2",
        2,
        supplied_terms=["Eierstöcke", "errinern"],
    )
    assert '"source_id": "term_001", "source_term": "Eierstöcke"' in prompt
    assert '"source_id": "term_002", "source_term": "errinern"' in prompt

    ordered = _validate_and_order_supplied_term_cards(
        [
            {"source_id": "term_002", "front": "sich erinnern an"},
            {"source_id": "term_001", "front": "der Eierstock"},
        ],
        ["Eierstöcke", "errinern"],
    )
    assert [card["front"] for card in ordered] == ["der Eierstock", "sich erinnern an"]

    with pytest.raises(Exception) as exc_info:
        _validate_and_order_supplied_term_cards(
            [
                {"source_id": "term_001", "front": "der Eierstock"},
                {"source_id": "term_001", "front": "das Ei"},
            ],
            ["Eierstöcke", "errinern"],
        )
    assert "missing: errinern" in exc_info.value.detail
    assert "duplicated: Eierstöcke" in exc_info.value.detail


def test_flashcard_generation_reports_truncated_claude_response(monkeypatch, caplog):
    response = SimpleNamespace(
        id="msg_truncated_test",
        stop_reason="max_tokens",
        usage=SimpleNamespace(input_tokens=250, output_tokens=6000),
        content=[SimpleNamespace(type="text", text='{"cards": [')],
    )
    monkeypatch.setattr(
        claude_service,
        "client",
        SimpleNamespace(messages=SimpleNamespace(create=lambda **kwargs: response)),
    )

    with caplog.at_level("INFO"), pytest.raises(
        claude_service.FlashcardGenerationTruncatedError
    ):
        claude_service.generate_flashcard_set(
            topic="Meine Wörter",
            count=1,
            supplied_terms=["Eierstöcke"],
        )

    assert "message_id=msg_truncated_test" in caplog.text
    assert "stop_reason=max_tokens" in caplog.text
    assert "output_tokens=6000" in caplog.text


def test_supplied_flashcard_terms_are_generated_in_stable_batches(monkeypatch):
    responses = []
    for start, terms in ((1, [f"Wort {index}" for index in range(1, 9)]), (9, ["Wort 9"])):
        cards = {
            f"term_{local_index:03d}": {
                "front": term,
                "back": f"meaning {start + local_index - 1}",
            }
            for local_index, term in enumerate(terms, start=1)
        }
        responses.append(SimpleNamespace(
            id=f"msg_batch_{start}",
            stop_reason="end_turn",
            usage=SimpleNamespace(input_tokens=200, output_tokens=500),
            content=[SimpleNamespace(type="text", text=json.dumps({"cards": cards}))],
        ))

    calls = []

    def create_message(**kwargs):
        calls.append(kwargs)
        return responses[len(calls) - 1]

    monkeypatch.setattr(
        claude_service,
        "client",
        SimpleNamespace(messages=SimpleNamespace(create=create_message)),
    )

    generated = claude_service.generate_flashcard_set(
        topic="Meine Wörter",
        count=9,
        supplied_terms=[f"Wort {index}" for index in range(1, 10)],
    )

    assert len(calls) == 2
    assert [card["source_id"] for card in generated["cards"]] == [
        f"term_{index:03d}" for index in range(1, 10)
    ]
    assert '"term_001": {' in calls[1]["messages"][0]["content"]
    cards_schema = calls[0]["output_config"]["format"]["schema"]["properties"]["cards"]
    assert calls[0]["output_config"]["format"]["type"] == "json_schema"
    assert cards_schema["required"] == [f"term_{index:03d}" for index in range(1, 9)]
    assert set(cards_schema["properties"]) == set(cards_schema["required"])
    assert {
        tuple(reference.items())
        for reference in cards_schema["properties"].values()
    } == {(('$ref', '#/$defs/card'),)}
    assert cards_schema["additionalProperties"] is False


def test_flashcard_generation_reads_text_block_after_other_content(monkeypatch):
    response = SimpleNamespace(
        id="msg_text_after_other_content",
        stop_reason="end_turn",
        usage=SimpleNamespace(input_tokens=100, output_tokens=100),
        content=[
            SimpleNamespace(type="thinking", thinking="internal reasoning"),
            SimpleNamespace(
                type="text",
                text=json.dumps({
                    "cards": [{
                        "front": "das Haus",
                        "back": "house",
                        "case_examples": [
                            {"label": "Akkusativ", "text": "Ich sehe das Haus."},
                        ],
                    }],
                }),
            ),
        ],
    )
    monkeypatch.setattr(
        claude_service,
        "client",
        SimpleNamespace(messages=SimpleNamespace(create=lambda **kwargs: response)),
    )

    generated = claude_service.generate_flashcard_set(topic="Wohnen", count=1)

    assert generated["cards"][0]["front"] == "das Haus"
    assert generated["cards"][0]["case_examples"] == {
        "Akkusativ": "Ich sehe das Haus.",
    }


def test_flashcard_generation_rejects_response_without_text(monkeypatch, caplog):
    response = SimpleNamespace(
        id="msg_without_text",
        stop_reason="end_turn",
        usage=SimpleNamespace(input_tokens=100, output_tokens=0),
        content=[SimpleNamespace(type="thinking", thinking="internal reasoning")],
    )
    monkeypatch.setattr(
        claude_service,
        "client",
        SimpleNamespace(messages=SimpleNamespace(create=lambda **kwargs: response)),
    )

    with caplog.at_level("WARNING"), pytest.raises(
        claude_service.FlashcardGenerationEmptyResponseError
    ):
        claude_service.generate_flashcard_set(topic="Wohnen", count=1)

    assert "message_id=msg_without_text" in caplog.text
    assert "content_types=['thinking']" in caplog.text


def test_flashcard_generation_logs_provider_request_failure(monkeypatch, caplog):
    response = httpx.Response(
        400,
        headers={"request-id": "req_schema_test"},
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
    )
    provider_error = claude_service.anthropic.BadRequestError(
        "schema was rejected",
        response=response,
        body={"error": {"type": "invalid_request_error"}},
    )

    def reject_request(**kwargs):
        raise provider_error

    monkeypatch.setattr(
        claude_service,
        "client",
        SimpleNamespace(messages=SimpleNamespace(create=reject_request)),
    )

    with caplog.at_level("ERROR"), pytest.raises(
        claude_service.FlashcardProviderError
    ) as exc_info:
        claude_service.generate_flashcard_set(
            topic="Meine Wörter",
            count=1,
            supplied_terms=["Haus"],
        )

    assert exc_info.value.http_status == 502
    assert "rejected the flashcard request" in exc_info.value.public_detail
    assert "provider_status=400" in caplog.text
    assert "request_id=req_schema_test" in caplog.text
    assert "error=schema was rejected" in caplog.text


def test_large_theme_generation_uses_expanded_output_limit_and_timeout(monkeypatch):
    captured = {}
    response = SimpleNamespace(
        id="msg_large_theme",
        stop_reason="end_turn",
        usage=SimpleNamespace(input_tokens=200, output_tokens=100),
        content=[SimpleNamespace(
            type="text",
            text=json.dumps({"cards": [{"front": "das Haus", "back": "house"}]}),
        )],
    )

    def create_message(**kwargs):
        captured.update(kwargs)
        return response

    monkeypatch.setattr(
        claude_service,
        "client",
        SimpleNamespace(messages=SimpleNamespace(create=create_message)),
    )

    claude_service.generate_flashcard_set(topic="Wohnen", count=30)

    assert captured["max_tokens"] == 13500
    assert captured["timeout"] == 120


def test_flashcard_timeout_identifies_the_failed_batch(monkeypatch):
    timeout_error = claude_service.anthropic.APITimeoutError(
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
    )

    def time_out(**kwargs):
        raise timeout_error

    monkeypatch.setattr(
        claude_service,
        "client",
        SimpleNamespace(messages=SimpleNamespace(create=time_out)),
    )

    with pytest.raises(claude_service.FlashcardProviderError) as exc_info:
        claude_service.generate_flashcard_set(
            topic="Meine Wörter",
            count=9,
            supplied_terms=[f"Wort {index}" for index in range(1, 10)],
        )

    assert exc_info.value.http_status == 503
    assert "batch 1 of 2" in exc_info.value.public_detail


def test_flashcard_requests_deduplicate_terms_case_insensitively():
    generated = FlashcardGenerateRequest(terms=["Haus", " haus ", "HAUS", "Wohnung"])
    extended = FlashcardExtendRequest(terms=["Baum", "BAUM", "Blume"])

    assert generated.terms == ["Haus", "Wohnung"]
    assert extended.terms == ["Baum", "Blume"]


def test_flashcard_database_failure_rolls_back_and_returns_clear_error():
    class FailingSession:
        def __init__(self):
            self.rolled_back = False

        def add(self, item):
            pass

        def commit(self):
            raise SQLAlchemyError("write failed")

        def refresh(self, item):
            raise AssertionError("refresh must not run after a failed commit")

        def rollback(self):
            self.rolled_back = True

    failing_db = FailingSession()
    item = SimpleNamespace(id="generated_test", cards=[])

    with pytest.raises(HTTPException) as exc_info:
        _save_generated_flashcard_set(
            failing_db,
            item,
            error_detail="Flashcards were generated, but the set could not be saved.",
        )

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Flashcards were generated, but the set could not be saved."
    assert failing_db.rolled_back is True


def test_personal_flashcard_set_management(client, db_session, user, monkeypatch):
    def fake_generation(**kwargs):
        supplied_terms = kwargs.get("supplied_terms")
        terms = supplied_terms or [
            kwargs["topic"],
            *[
                f"{kwargs['topic']} {index}"
                for index in range(2, kwargs["count"] + 1)
            ],
        ]
        return {
            "topic": kwargs["topic"],
            "title": f"{kwargs['topic']} cards",
            "description": "Generated cards",
            "cards": [
                {
                    **({"source_id": f"term_{index:03d}"} if supplied_terms else {}),
                    "front": f"die {term}",
                    "back": f"the {term}",
                    "example": f"Das ist die {term}.",
                    "tags": ["noun"],
                }
                for index, term in enumerate(terms, start=1)
            ],
        }

    monkeypatch.setattr("routers.flashcards.generate_flashcard_set", fake_generation)
    first = client.post(
        "/flashcards/sets/generate",
        json={"topic": "Home", "count": 3, "translation_language": "en"},
    ).json()
    second = client.post(
        "/flashcards/sets/generate",
        json={"topic": "Travel", "count": 3, "translation_language": "en"},
    ).json()

    extended = client.post(
        f"/flashcards/sets/{first['id']}/extend",
        json={"terms": ["Küche", "Lampe"]},
    )
    assert extended.status_code == 200
    assert len(extended.json()["cards"]) == 3
    assert extended.json()["is_editable"] is True
    assert extended.json()["added_count"] == 2
    assert extended.json()["skipped_count"] == 0

    partially_extended = client.post(
        f"/flashcards/sets/{first['id']}/extend",
        json={"terms": ["Home", "Fenster"]},
    )
    assert partially_extended.status_code == 200
    assert partially_extended.json()["added_count"] == 1
    assert partially_extended.json()["skipped_count"] == 1
    assert len(partially_extended.json()["cards"]) == 4

    card = extended.json()["cards"][0]
    edited = client.put(
        f"/flashcards/sets/{first['id']}/cards/{card['id']}",
        json={
            "front": "das Zuhause",
            "back": "home",
            "example": "Ich bin zu Hause.",
            "tags": ["noun"],
        },
    )
    assert edited.status_code == 200
    assert edited.json()["front"] == "das Zuhause"

    removed_card = extended.json()["cards"][1]
    assert client.delete(
        f"/flashcards/sets/{first['id']}/cards/{removed_card['id']}"
    ).status_code == 204

    merged = client.post(
        "/flashcards/sets/merge",
        json={"set_ids": [first["id"], second["id"]], "title": "Combined vocabulary"},
    )
    assert merged.status_code == 200
    assert merged.json()["title"] == "Combined vocabulary"
    assert merged.json()["is_editable"] is True
    assert len(merged.json()["cards"]) == 4

    assert client.delete(f"/flashcards/sets/{first['id']}").status_code == 204
    assert client.get(f"/flashcards/sets/{first['id']}").status_code == 404

    shared = models.FlashcardSet(
        id="shared-basics",
        user_id=None,
        topic="Basics",
        level="B2",
        title="Shared Basics",
        description="Shared vocabulary",
    )
    shared.cards.append(models.FlashcardCard(
        card_id="hallo",
        position=1,
        front="hallo",
        back="hello",
        tags=[],
    ))
    db_session.add(shared)
    db_session.commit()
    extended_shared = client.post(
        "/flashcards/sets/shared-basics/extend",
        json={"terms": ["Abschied"]},
    )
    assert extended_shared.status_code == 200
    assert extended_shared.json()["id"] != "shared-basics"
    assert extended_shared.json()["is_editable"] is True
    assert extended_shared.json()["added_count"] == 1
    assert extended_shared.json()["skipped_count"] == 0
    assert len(extended_shared.json()["cards"]) == 2
    assert len(client.get("/flashcards/sets/shared-basics").json()["cards"]) == 1


def test_resources_translate_and_audio_routers_with_mocked_providers(client, user, monkeypatch):
    monkeypatch.setattr(
        "routers.resources.generate_resource_questions",
        lambda **kwargs: {"questions": [{"id": 1, "question": "Was ist das Thema?", "type": "comprehension"}]},
    )
    monkeypatch.setattr(
        "routers.translate.translate_text",
        lambda **kwargs: {
            "source_language": "de",
            "target_language": "en",
            "translation": "Hello",
            "alternatives": [],
            "notes": "",
        },
    )
    monkeypatch.setattr("routers.audio.transcribe_audio", lambda file_obj: "Hallo")
    monkeypatch.setattr("routers.audio.synthesize_speech", lambda **kwargs: b"fake-mp3")

    resources = client.get("/resources")
    assert resources.status_code == 200
    resource_items = resources.json()
    if resource_items:
        resource_id = resource_items[0]["id"]
        assert client.get(f"/resources/{resource_id}").status_code == 200
        questions = client.post(f"/resources/{resource_id}/questions", json={"level": "B2", "question_count": 1})
        assert questions.status_code == 200

    translated = client.post("/translate", json={"text": "Hallo", "target_language": "en"})
    assert translated.status_code == 200
    assert translated.json()["translation"] == "Hello"

    audio_file = {"file": ("recording.webm", b"fake audio bytes", "audio/webm")}
    transcribed = client.post("/audio/transcribe", files=audio_file)
    assert transcribed.status_code == 200
    assert transcribed.json()["text"] == "Hallo"

    captured_prompt = {}

    def transcribe_flashcards(file_obj, prompt=None):
        captured_prompt["prompt"] = prompt
        return "die Wohnung, sich erinnern an"

    monkeypatch.setattr("routers.audio.transcribe_audio", transcribe_flashcards)
    flashcard_transcription = client.post(
        "/audio/transcribe",
        data={"purpose": "flashcards"},
        files=audio_file,
    )
    assert flashcard_transcription.status_code == 200
    assert flashcard_transcription.json()["text"] == "die Wohnung, sich erinnern an"
    assert "separated by commas" in captured_prompt["prompt"]
    monkeypatch.setattr("routers.audio.transcribe_audio", lambda file_obj: "Hallo")

    speech = client.post("/audio/speech", json={"text": "Hallo"})
    assert speech.status_code == 200
    assert speech.headers["content-type"].startswith("audio/mpeg")

    pronunciation = client.post(
        "/audio/pronunciation-feedback",
        data={"expected_text": "Hallo"},
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )
    assert pronunciation.status_code == 200
    assert pronunciation.json()["transcribed_text"] == "Hallo"


def test_optional_suggestions_saved_without_errors(client, db_session, user, seeded_session, monkeypatch):
    from services.discussion_analysis import analyze_pending_messages, finalize_session_review
    message = db_session.query(models.Message).filter(models.Message.session_id == seeded_session.id).one()
    message.content = "Was war genau laut?"
    db_session.commit()
    suggestion = {"original": message.content, "corrected": "Was war genau so laut?",
                  "explanation": "Optional emphasis; Was is already the subject."}
    monkeypatch.setattr("services.discussion_analysis.analyze_message_batch", lambda messages, level: [{
        "message_id": message.id, "has_errors": False, "corrected_user_message": message.content,
        "corrections": [], "suggestions": [suggestion],
    }])
    assert analyze_pending_messages(seeded_session.id, user.id, force=True) == 1
    def summary(**kwargs):
        assert kwargs["errors"] == []
        return {"summary": "Correct question.", "estimated_level": "B2"}
    monkeypatch.setattr("services.discussion_analysis.generate_session_summary", summary)
    finalize_session_review(seeded_session.id, user.id)
    db_session.expire_all()
    assert message.has_errors is False
    assert seeded_session.error_count == 0
    assert seeded_session.score == 100
    assert db_session.query(models.ErrorRecord).count() == 0
    response = client.get(f"/chat/session/{seeded_session.id}/review")
    assert response.status_code == 200
    detail = response.json()["mistakes"][0]
    assert detail["corrected"] == message.content
    assert detail["corrections"] == []
    assert detail["suggestions"] == [suggestion]


def test_save_reuses_category_and_groups_legacy_names(client, db_session, user, seeded_session, monkeypatch):
    from datetime import datetime, timezone
    existing = models.ConversationSession(
        user_id=user.id, topic='First roleplay', topic_category='PH SRK',
        message_count=2, ended_at=datetime.now(timezone.utc),
    )
    legacy = models.ConversationSession(
        user_id=user.id, topic='Second roleplay', topic_category=' ph  srk ',
        message_count=2, ended_at=datetime.now(timezone.utc),
    )
    duplicate = models.ConversationSession(
        user_id=user.id, topic=' FIRST roleplay ', topic_category='ph srk',
        message_count=2, ended_at=datetime.now(timezone.utc),
    )
    db_session.add_all([existing, legacy, duplicate])
    db_session.commit()
    monkeypatch.setattr('routers.chat.finalize_session_review', lambda *args: None)
    response = client.post(f'/chat/session/{seeded_session.id}/end', params={'save_category': ' Ph   Srk '})
    assert response.status_code == 200
    db_session.refresh(seeded_session)
    assert seeded_session.topic_category == 'PH SRK'
    items = client.get('/sessions/free-conversation-topics').json()
    assert {item['category'] for item in items} == {'PH SRK'}
    assert len([item for item in items if item['title'].casefold() == 'first roleplay']) == 1
    assert any(item['title'] == 'Second roleplay' for item in items)


def test_category_normalizes_new_and_predefined_names(db_session, user):
    from services.topic_categories import resolve_category
    assert resolve_category(db_session, user.id, '  New   Topic ') == 'New Topic'
    assert resolve_category(db_session, user.id, ' sOcIeTy ') == 'Society'


def test_incomplete_review_can_recover(client, db_session, user, seeded_session, monkeypatch):
    from datetime import datetime, timezone
    from services.discussion_analysis import finalize_session_review
    seeded_session.ended_at = datetime.now(timezone.utc)
    seeded_session.summary = 'Old summary with missing score and level'
    db_session.commit()
    monkeypatch.setattr('services.discussion_analysis.analyze_pending_messages', lambda *args, **kwargs: None)
    def fail(**kwargs):
        raise ValueError('Assessment unavailable')
    monkeypatch.setattr('services.discussion_analysis.generate_session_summary', fail)
    finalize_session_review(seeded_session.id, user.id)
    response = client.get(f'/chat/session/{seeded_session.id}/review')
    assert response.json()['status'] == 'failed'
    monkeypatch.setattr('services.discussion_analysis.generate_session_summary', lambda **kwargs: {
        'summary': 'Completed assessment', 'estimated_level': 'B2',
    })
    finalize_session_review(seeded_session.id, user.id)
    db_session.expire_all()
    assert seeded_session.score is not None
    assert seeded_session.estimated_level == 'B2'
    assert seeded_session.summary == 'Completed assessment'
    assert seeded_session.review_error is None
    assert client.get(f'/chat/session/{seeded_session.id}/review').json()['status'] == 'ready'
