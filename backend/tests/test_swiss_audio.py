import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/german_swiss_audio_tests.db")
os.environ.setdefault("OPENAI_API_KEY", "test-key")

from routers import audio as audio_router


def test_swiss_speech_returns_wav_after_generation(monkeypatch):
    monkeypatch.setattr(audio_router, "require_user_rate_limit", lambda *args: None)
    monkeypatch.setattr(audio_router, "synthesize_speech", lambda **kwargs: b"RIFFtest")

    response = audio_router.speech(
        audio_router.SpeechRequest(
            text="Grüezi",
            model="gradio_swiss_tts",
            dialect="Bern",
        ),
        current_user=SimpleNamespace(id="user-1"),
    )

    assert response.status_code == 200
    assert response.media_type == "audio/wav"
    assert response.body == b"RIFFtest"
    assert response.headers["content-disposition"] == 'inline; filename="speech.wav"'


def test_swiss_speech_reports_upstream_failure_before_streaming(monkeypatch, caplog):
    monkeypatch.setattr(audio_router, "require_user_rate_limit", lambda *args: None)
    error = RuntimeError("gateway timed out")
    error.response = SimpleNamespace(status_code=504)
    monkeypatch.setattr(
        audio_router,
        "synthesize_speech",
        lambda **kwargs: (_ for _ in ()).throw(error),
    )

    with pytest.raises(HTTPException) as exc_info:
        audio_router.speech(
            audio_router.SpeechRequest(
                text="Grüezi",
                model="gradio_swiss_tts",
                dialect="Bern",
            ),
            current_user=SimpleNamespace(id="user-1"),
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Swiss German audio service is temporarily unavailable."
    assert "audio.swiss_tts_failed" in caplog.text
    assert "provider_status=504" in caplog.text
