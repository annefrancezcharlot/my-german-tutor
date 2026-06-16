import os
import sys
import tempfile
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

from fastapi.testclient import TestClient
import pytest

import auth
import database
import models
import rate_limits
from main import app


USER_ID = UUID("33333333-3333-4333-8333-333333333333")


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
    assert ended.json()["summary"] == "Good practice session."


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
                    "front": "die Wohnung",
                    "back": "apartment",
                    "example": "Ich suche eine Wohnung.",
                    "tags": ["housing"],
                }
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
