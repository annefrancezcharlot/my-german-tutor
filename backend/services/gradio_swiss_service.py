import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

_client_cache: dict[str, Any] = {}


def _get_gradio_client(space: str):
    try:
        from gradio_client import Client
    except ImportError as exc:
        raise RuntimeError("gradio_client is not installed") from exc

    if space not in _client_cache:
        _client_cache[space] = Client(space)
    return _client_cache[space]


def _predict_direct(space: str, fn_index: int, *args: Any) -> Any:
    response = httpx.post(
        f"{space.rstrip('/')}/api/predict",
        json={"data": list(args), "fn_index": fn_index},
        timeout=120,
    )
    response.raise_for_status()
    return response.json()


def _predict(space: str, api_name: Optional[str], *args: Any, fn_index: Optional[int] = None) -> Any:
    if fn_index is not None:
        return _predict_direct(space, fn_index, *args)

    client = _get_gradio_client(space)
    if api_name:
        return client.predict(*args, api_name=api_name)
    return client.predict(*args)


def _extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("text", "output", "translation", "result", "data"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return item.strip()
            text = _extract_text(item)
            if text:
                return text
    if isinstance(value, (list, tuple)):
        for item in value:
            text = _extract_text(item)
            if text:
                return text
    return str(value).strip()


def _extract_file_path(value: Any) -> Optional[str]:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("url", "path", "name", "file", "audio"):
            item = value.get(key)
            if isinstance(item, str) and item:
                return item
            nested = _extract_file_path(item)
            if nested:
                return nested
        for item in value.values():
            nested = _extract_file_path(item)
            if nested:
                return nested
    if isinstance(value, (list, tuple)):
        for item in value:
            path = _extract_file_path(item)
            if path:
                return path
    return None


def _extract_audio_bytes(value: Any) -> Optional[bytes]:
    if isinstance(value, bytes):
        return value
    if isinstance(value, dict):
        for item in value.values():
            audio_bytes = _extract_audio_bytes(item)
            if audio_bytes:
                return audio_bytes
    if isinstance(value, (list, tuple)):
        for item in value:
            audio_bytes = _extract_audio_bytes(item)
            if audio_bytes:
                return audio_bytes
    return None


def rewrite_messages_to_swiss_german(
    messages: List[Dict[str, Any]],
    dialect: Optional[str] = None,
) -> Dict[str, Any]:
    space = os.getenv("GRADIO_SWISS_TEXT_SPACE") or os.getenv("GRADIO_SWISS_TEXT_URL")
    api_name = os.getenv("GRADIO_SWISS_TEXT_API_NAME", "/translate_interface")
    fn_index = int(os.getenv("GRADIO_SWISS_TEXT_FN_INDEX", "0"))
    selected_dialect = dialect or os.getenv("GRADIO_SWISS_TEXT_DIALECT", "Bern")
    if not space:
        raise RuntimeError("GRADIO_SWISS_TEXT_SPACE must be set for Swiss German rewrites")

    rewrites = []
    for message in messages:
        original = str(message["original"])
        raw_result = _predict(space, api_name, original, selected_dialect, fn_index=fn_index)
        rewritten = _extract_text(raw_result)
        rewrites.append({
            "message_id": message["message_id"],
            "original": original,
            "rewritten": rewritten,
            "style_notes": "",
            "register": selected_dialect,
        })

    return {"rewrites": rewrites}


def synthesize_swiss_german_speech(text: str, dialect: Optional[str] = None) -> bytes:
    space = os.getenv("GRADIO_SWISS_TTS_SPACE") or os.getenv("GRADIO_SWISS_TTS_URL")
    api_name = os.getenv("GRADIO_SWISS_TTS_API_NAME", "/speech_interface")
    fn_index = int(os.getenv("GRADIO_SWISS_TTS_FN_INDEX", "1"))
    selected_dialect = dialect or os.getenv("GRADIO_SWISS_TTS_DIALECT", os.getenv("GRADIO_SWISS_TEXT_DIALECT", "Bern"))
    if not space:
        raise RuntimeError("GRADIO_SWISS_TTS_SPACE must be set for Swiss German speech")

    raw_result = _predict(space, api_name, text, selected_dialect, fn_index=fn_index)
    audio_bytes = _extract_audio_bytes(raw_result)
    if audio_bytes:
        return audio_bytes

    audio_path = _extract_file_path(raw_result)
    if not audio_path:
        raise RuntimeError("Gradio Swiss German TTS did not return an audio file")

    if audio_path.startswith(("http://", "https://")):
        response = httpx.get(audio_path, timeout=60)
        response.raise_for_status()
        return response.content

    with open(audio_path, "rb") as handle:
        return handle.read()
