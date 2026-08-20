from difflib import SequenceMatcher
from io import BytesIO
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth import CurrentUser, get_current_user
from rate_limits import (
    AUDIO_SPEECH_PER_HOUR,
    AUDIO_TRANSCRIBE_PER_HOUR,
    HOUR,
    PRONUNCIATION_FEEDBACK_PER_HOUR,
    require_user_rate_limit,
)
from services.audio_service import stream_speech, transcribe_audio

router = APIRouter(prefix="/audio", tags=["audio"], dependencies=[Depends(get_current_user)])

MAX_AUDIO_BYTES = 20 * 1024 * 1024
ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "video/webm",
}


class TranscriptionResponse(BaseModel):
    text: str


class SpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=3000)
    voice: str = Field(default="cedar", min_length=1, max_length=40)
    style: str = Field(default="clear standard German", min_length=1, max_length=240)
    model: str = Field(default="gpt-4o-mini-tts", min_length=1, max_length=120)
    dialect: str | None = Field(default=None, max_length=40)


class PronunciationFeedbackResponse(BaseModel):
    expected_text: str
    transcribed_text: str
    score: int
    feedback: str
    practice_tip: str


async def _read_audio_upload(file: UploadFile) -> BytesIO:
    content_type = file.content_type.split(";", 1)[0].strip().lower() if file.content_type else ""
    if content_type and content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Audio file is empty")
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file is too large")

    buffer = BytesIO(content)
    buffer.name = file.filename or "recording.webm"
    return buffer


def _normalize_for_comparison(value: str) -> str:
    return " ".join(value.casefold().strip().split())


def _score_pronunciation(expected_text: str, transcribed_text: str) -> int:
    expected = _normalize_for_comparison(expected_text)
    transcribed = _normalize_for_comparison(transcribed_text)
    if not expected or not transcribed:
        return 0

    ratio = SequenceMatcher(None, expected, transcribed).ratio()
    return max(0, min(100, round(ratio * 100)))


def _build_pronunciation_feedback(score: int, expected_text: str, transcribed_text: str) -> tuple[str, str]:
    if not transcribed_text.strip():
        return (
            "I could not detect a clear German phrase in the recording.",
            f"Say it once slowly, then once naturally: {expected_text}",
        )

    if score >= 90:
        return (
            "Very close. The spoken phrase was recognized almost exactly.",
            "Repeat it at a natural speed while keeping the vowels clear.",
        )
    if score >= 70:
        return (
            "Mostly understandable, but one or two sounds or syllables may be unclear.",
            f"Break it into short chunks, then connect them again: {expected_text}",
        )
    if score >= 45:
        return (
            "Partly recognized, but the phrase differs noticeably from the target.",
            "Practice slowly first and pay attention to word endings and stressed syllables.",
        )

    return (
        "The recording was not recognized as the expected phrase.",
        f"Listen to the target audio, then repeat only this phrase: {expected_text}",
    )


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    file: UploadFile = File(...),
    purpose: Optional[Literal["conversation", "flashcards"]] = Form(default="conversation"),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(current_user, "audio:transcribe", AUDIO_TRANSCRIBE_PER_HOUR, HOUR)

    audio_file = await _read_audio_upload(file)

    try:
        prompt = None
        if purpose == "flashcards":
            prompt = (
                "The speaker is dictating a list of German words or expressions for flashcards. "
                "Transcribe the terms exactly in German, separated by commas. Do not translate, "
                "correct, explain, or add words."
            )
        text = transcribe_audio(audio_file, prompt=prompt) if prompt else transcribe_audio(audio_file)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {exc}") from exc

    return TranscriptionResponse(text=text)


@router.post("/speech")
def speech(
    request: SpeechRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(current_user, "audio:speech", AUDIO_SPEECH_PER_HOUR, HOUR)

    return StreamingResponse(
        stream_speech(
            text=request.text,
            voice=request.voice,
            style=request.style,
            model=request.model,
            dialect=request.dialect,
        ),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": 'inline; filename="speech.mp3"',
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/pronunciation-feedback", response_model=PronunciationFeedbackResponse)
async def pronunciation_feedback(
    expected_text: str = Form(..., min_length=1, max_length=500),
    file: UploadFile = File(...),
    target_text: Optional[str] = Form(default=None, max_length=500),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(
        current_user,
        "audio:pronunciation-feedback",
        PRONUNCIATION_FEEDBACK_PER_HOUR,
        HOUR,
    )

    phrase = target_text or expected_text
    audio_file = await _read_audio_upload(file)

    try:
        transcribed_text = transcribe_audio(audio_file)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Pronunciation transcription failed: {exc}") from exc

    score = _score_pronunciation(phrase, transcribed_text)
    feedback, practice_tip = _build_pronunciation_feedback(score, phrase, transcribed_text)

    return PronunciationFeedbackResponse(
        expected_text=phrase,
        transcribed_text=transcribed_text,
        score=score,
        feedback=feedback,
        practice_tip=practice_tip,
    )
