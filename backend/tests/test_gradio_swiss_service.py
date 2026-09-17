import json
import os
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

from services import gradio_swiss_service as service


class FakeResponse:
    def __init__(self, payload=None, lines=None):
        self.payload = payload or {}
        self.lines = lines or []

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload

    def iter_lines(self):
        return iter(self.lines)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None


def test_queued_prediction_returns_completed_job_output(monkeypatch):
    captured = {}

    class FakeClient:
        def __init__(self, **kwargs):
            captured["timeout"] = kwargs["timeout"]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def post(self, url, json):
            captured["join_url"] = url
            captured["join_payload"] = json
            return FakeResponse({"event_id": "event-123"})

        def stream(self, method, url, params):
            captured["stream"] = (method, url, params)
            completed = {
                "msg": "process_completed",
                "event_id": "event-123",
                "success": True,
                "output": {"data": [{"url": "https://example.test/audio.wav"}]},
            }
            return FakeResponse(lines=["data: " + json.dumps(completed)])

    monkeypatch.setattr(service.httpx, "Client", FakeClient)

    result = service._predict_queued(
        "https://example.test/tts",
        1,
        "Grüezi",
        "Basel",
    )

    assert result == {"data": [{"url": "https://example.test/audio.wav"}]}
    assert captured["join_url"] == "https://example.test/tts/queue/join"
    assert captured["join_payload"]["data"] == ["Grüezi", "Basel"]
    assert captured["join_payload"]["fn_index"] == 1
    assert captured["stream"] == (
        "GET",
        "https://example.test/tts/queue/data",
        {"session_hash": captured["join_payload"]["session_hash"]},
    )
