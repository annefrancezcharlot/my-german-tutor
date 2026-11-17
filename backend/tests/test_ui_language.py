import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.claude_service as claude_service
from routers.audio import _build_pronunciation_feedback
from ui_language import (
    UiLanguageMiddleware,
    get_ui_language,
    normalize_ui_language,
    reset_ui_language,
    set_ui_language,
)


def _language_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(UiLanguageMiddleware)

    @app.get("/lang")
    def lang():  # sync endpoint: runs in the threadpool, like most routers
        return {"lang": get_ui_language()}

    return app


def test_middleware_reads_header_and_defaults_to_english():
    client = TestClient(_language_app())

    assert client.get("/lang").json() == {"lang": "en"}
    assert client.get("/lang", headers={"X-UI-Language": "fr"}).json() == {"lang": "fr"}
    assert client.get("/lang", headers={"X-UI-Language": "fr-CH"}).json() == {"lang": "fr"}
    assert client.get("/lang", headers={"X-UI-Language": "xx"}).json() == {"lang": "en"}
    # The language must not leak into the next request.
    assert client.get("/lang").json() == {"lang": "en"}


def test_normalize_ui_language():
    assert normalize_ui_language("FR") == "fr"
    assert normalize_ui_language(None) == "en"
    assert normalize_ui_language("de") == "en"


def test_prompts_request_feedback_in_selected_language():
    token = set_ui_language("fr")
    try:
        conversation = claude_service._build_conversation_system_prompt("Reisen", "B2")
        analysis = claude_service._build_message_analysis_prompt([], "B2")
        teacher = claude_service._build_teacher_rule_prompt("dass oder das?", "B2")
        translation = claude_service._build_translation_prompt("Haus", "auto", "auto")
        style = claude_service._build_style_rewrite_prompt([], "Reisen", "B2", "natural")
    finally:
        reset_ui_language(token)

    assert "explanation in French" in conversation
    assert "French explanation of the actual error" in analysis
    assert "direct answer in French" in teacher
    assert "translate German text into French" in translation
    assert "Notes must be in French." in style

    english = claude_service._build_conversation_system_prompt("Reisen", "B2")
    assert "explanation in English" in english


def test_pronunciation_feedback_is_localized():
    token = set_ui_language("fr")
    try:
        feedback, tip = _build_pronunciation_feedback(95, "Hallo", "Hallo")
    finally:
        reset_ui_language(token)
    assert feedback.startswith("Très proche")

    feedback, _ = _build_pronunciation_feedback(95, "Hallo", "Hallo")
    assert feedback.startswith("Very close")
