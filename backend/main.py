import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from database import engine
from logging_config import configure_logging
from routers import audio, auth, chat, sessions, errors, exercises, users, flashcards, resources, teacher, translate

configure_logging()

app = FastAPI(
    title="German Learning API",
    description="Advanced German conversational learning platform",
    version="1.0.0",
)

cors_allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(chat.router)
app.include_router(errors.router)
app.include_router(exercises.router)
app.include_router(flashcards.router)
app.include_router(resources.router)
app.include_router(teacher.router)
app.include_router(translate.router)
app.include_router(audio.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "German Learning API"}


@app.get("/health/db")
def database_health():
    with engine.connect() as connection:
        connection.execute(text("select 1"))
    return {"status": "ok", "dialect": engine.dialect.name}
