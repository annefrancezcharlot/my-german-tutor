import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

os.environ.setdefault(
    "DATABASE_URL",
    f"sqlite:///{Path(tempfile.gettempdir()) / 'german_learning_ownership_tests.db'}",
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
import pytest

import auth
import database
import models
from main import app


USER_A_ID = UUID("11111111-1111-4111-8111-111111111111")
USER_B_ID = UUID("22222222-2222-4222-8222-222222222222")


@pytest.fixture
def current_user_holder():
    return {"user": _current_user(USER_A_ID)}


@pytest.fixture(autouse=True)
def clean_database():
    models.Base.metadata.drop_all(bind=database.engine)
    models.Base.metadata.create_all(bind=database.engine)
    yield
    models.Base.metadata.drop_all(bind=database.engine)


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

    test_client = TestClient(app)
    test_client.current_user_holder = current_user_holder
    yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def seeded_data():
    db = database.SessionLocal()
    try:
        user_a = models.User(id=USER_A_ID, username="user-a", level="B2")
        user_b = models.User(id=USER_B_ID, username="user-b", level="B2")
        db.add_all([user_a, user_b])
        db.flush()

        session = models.ConversationSession(
            user_id=USER_A_ID,
            topic="Wohnungssuche",
            topic_category="Daily life",
            message_count=2,
        )
        db.add(session)
        db.flush()

        message = models.Message(
            session_id=session.id,
            role="user",
            content="Ich suche eine Wohnung.",
        )
        db.add(message)
        db.flush()

        db.add(models.StyleRewrite(
            user_id=USER_A_ID,
            session_id=session.id,
            message_id=message.id,
            rewrite_mode="natural",
            original="Ich suche eine Wohnung.",
            rewritten="Ich bin auf Wohnungssuche.",
            style_notes="More natural phrasing.",
        ))

        db.add(models.ErrorRecord(
            user_id=USER_A_ID,
            session_id=session.id,
            category="grammar",
            severity="medium",
            original_text="Ich suche ein Wohnung.",
            corrected_text="Ich suche eine Wohnung.",
            explanation="Wohnung is feminine.",
            context="Ich suche ein Wohnung.",
        ))

        db.add(models.TeacherRule(
            user_id=USER_A_ID,
            question="Warum heisst es eine Wohnung?",
            category="gender",
            title="Gender of Wohnung",
            short_answer="Wohnung is feminine.",
            explanation="Nouns ending in -ung are usually feminine.",
            examples=[],
            related_terms=[],
        ))

        exercise = models.Exercise(
            user_id=USER_A_ID,
            error_category="grammar",
            exercise_type="fill_blank",
            title="Article practice",
            instructions="Fill in the article.",
            content={"sentence": "Ich suche ___ Wohnung."},
            answer_key={"answer": "eine"},
            difficulty="B2",
        )
        db.add(exercise)

        flashcard_set = models.FlashcardSet(
            id="user-a-housing-b2",
            user_id=USER_A_ID,
            topic="Housing",
            level="B2",
            title="Housing B2",
            description="Housing vocabulary",
        )
        flashcard_set.cards.append(models.FlashcardCard(
            card_id="wohnung",
            position=1,
            front="die Wohnung",
            back="apartment",
            example="Ich suche eine Wohnung.",
            case_examples={},
            tense_examples={},
            tags=[],
        ))
        db.add(flashcard_set)

        public_set = models.FlashcardSet(
            id="public-basics-b2",
            user_id=None,
            topic="Basics",
            level="B2",
            title="Public Basics",
            description="Global vocabulary",
        )
        public_set.cards.append(models.FlashcardCard(
            card_id="hallo",
            position=1,
            front="hallo",
            back="hello",
            example="Hallo zusammen.",
            case_examples={},
            tense_examples={},
            tags=[],
        ))
        db.add(public_set)

        db.commit()

        return {
            "session_id": session.id,
            "exercise_id": exercise.id,
            "flashcard_set_id": flashcard_set.id,
            "public_flashcard_set_id": public_set.id,
        }
    finally:
        db.close()


def _current_user(user_id: UUID):
    return auth.CurrentUser(
        id=user_id,
        email=f"{user_id}@example.test",
        metadata={},
        raw=SimpleNamespace(id=str(user_id)),
    )


def _act_as(client: TestClient, user_id: UUID):
    client.current_user_holder["user"] = _current_user(user_id)


def test_me_collection_routes_do_not_leak_another_users_data(client, seeded_data):
    _act_as(client, USER_B_ID)

    assert client.get("/users/me").json()["id"] == str(USER_B_ID)
    assert client.get("/sessions/me").json() == []
    assert client.get("/sessions/free-conversation-topics").json() == []
    assert client.get("/errors/me").json() == []
    assert client.get("/errors/me/stats").json() == []
    assert client.get("/errors/me/timeline").json() == []
    assert client.get("/errors/me/exercise-timeline").json() == []
    assert client.get("/errors/me/activity-timeline").json() == []
    assert client.get("/exercises/me").json() == []
    assert client.get("/teacher/rules/me").json() == []

    flashcard_sets = client.get("/flashcards/sets").json()
    assert {item["id"] for item in flashcard_sets} == {seeded_data["public_flashcard_set_id"]}


def test_session_messages_hide_another_users_session(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.get(f"/sessions/{seeded_data['session_id']}/messages")

    assert response.status_code == 404


def test_delete_session_hides_another_users_session(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.delete(f"/sessions/{seeded_data['session_id']}")

    assert response.status_code == 404


def test_style_rewrites_hide_another_users_session(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.get(f"/sessions/{seeded_data['session_id']}/style-rewrites")

    assert response.status_code == 404


def test_create_opening_message_hides_another_users_session(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.post(f"/chat/session/{seeded_data['session_id']}/opening")

    assert response.status_code == 404


def test_chat_message_hides_another_users_session(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.post(
        "/chat/message",
        json={
            "session_id": seeded_data["session_id"],
            "message": "Hallo",
            "conversation_history": [],
        },
    )

    assert response.status_code == 404


def test_end_session_hides_another_users_session(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.post(f"/chat/session/{seeded_data['session_id']}/end")

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "suffix", "payload"),
    [
        ("post", "realtime-credentials", None),
        ("post", "transcript", {"sequence": 0, "role": "user", "content": "Hallo"}),
        ("post", "realtime-usage", {"input_audio_tokens": 1}),
        ("get", "review", None),
        ("post", "review/retry", None),
    ],
)
def test_new_discussion_endpoints_enforce_session_ownership(
    client, seeded_data, method, suffix, payload,
):
    _act_as(client, USER_B_ID)
    url = f"/chat/session/{seeded_data['session_id']}/{suffix}"
    response = getattr(client, method)(url, json=payload) if payload is not None else getattr(client, method)(url)
    assert response.status_code == 404


def test_submit_exercise_hides_another_users_exercise(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.post(
        f"/exercises/{seeded_data['exercise_id']}/submit",
        json={"answers": {"answer": "eine"}},
    )

    assert response.status_code == 404


def test_flashcard_set_hides_another_users_set(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.get(f"/flashcards/sets/{seeded_data['flashcard_set_id']}")

    assert response.status_code == 404


def test_flashcard_study_session_hides_another_users_set(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.get(f"/flashcards/study-session/{seeded_data['flashcard_set_id']}")

    assert response.status_code == 404


def test_flashcard_progress_hides_another_users_set(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.get(f"/flashcards/progress/{seeded_data['flashcard_set_id']}")

    assert response.status_code == 404


def test_save_flashcard_session_hides_another_users_set(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.post(
        "/flashcards/progress/session",
        json={
            "set_id": seeded_data["flashcard_set_id"],
            "reviews": [{"card_id": "wohnung", "status": "good"}],
        },
    )

    assert response.status_code == 404


def test_public_flashcard_sets_remain_visible_to_other_users(client, seeded_data):
    _act_as(client, USER_B_ID)

    response = client.get(f"/flashcards/sets/{seeded_data['public_flashcard_set_id']}")

    assert response.status_code == 200
    assert response.json()["id"] == seeded_data["public_flashcard_set_id"]


def test_owner_can_access_seeded_resources(client, seeded_data):
    _act_as(client, USER_A_ID)

    assert client.get("/users/me").status_code == 200
    assert client.get(f"/sessions/{seeded_data['session_id']}/messages").status_code == 200
    assert client.get("/exercises/me").status_code == 200
    assert client.get(f"/flashcards/sets/{seeded_data['flashcard_set_id']}").status_code == 200
