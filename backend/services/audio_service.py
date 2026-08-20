import os
from openai import OpenAI
from pathlib import Path
from dotenv import load_dotenv
from services.gradio_swiss_service import synthesize_swiss_german_speech

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def transcribe_audio(file_obj):
    transcript = client.audio.transcriptions.create(
        model="gpt-4o-transcribe",
        file=file_obj,
        language="de",
    )
    return transcript.text

def synthesize_speech(
    text: str,
    voice: str = "cedar",
    style: str = "clear standard German",
    model: str = "gpt-4o-mini-tts",
    dialect: str | None = None,
):
    if model == "gradio_swiss_tts":
        return synthesize_swiss_german_speech(text, dialect=dialect)

    response = client.audio.speech.create(
        model=model,
        voice=voice,
        input=text,
        instructions=f"Speak in {style}. Use clear German pronunciation.",
        response_format="mp3",
    )
    return response.content


def stream_speech(
    text: str,
    voice: str = "cedar",
    style: str = "clear standard German",
    model: str = "gpt-4o-mini-tts",
    dialect: str | None = None,
):
    """Yield encoded audio as OpenAI produces it so playback can begin promptly."""
    if model == "gradio_swiss_tts":
        yield synthesize_swiss_german_speech(text, dialect=dialect)
        return

    with client.audio.speech.with_streaming_response.create(
        model=model,
        voice=voice,
        input=text,
        instructions=f"Speak in {style}. Use clear German pronunciation.",
        response_format="mp3",
    ) as response:
        for chunk in response.iter_bytes(chunk_size=4096):
            if chunk:
                yield chunk
