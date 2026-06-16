import hashlib
import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque

from fastapi import HTTPException, Request, status

from auth import CurrentUser


_lock = threading.Lock()
_buckets: dict[str, Deque[float]] = defaultdict(deque)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


RATE_LIMITS_ENABLED = os.getenv("RATE_LIMITS_ENABLED", "true").lower() != "false"

AUTH_SIGN_IN_PER_MINUTE = _env_int("RATE_LIMIT_AUTH_SIGN_IN_PER_MINUTE", 5)
AUTH_SIGN_UP_PER_HOUR = _env_int("RATE_LIMIT_AUTH_SIGN_UP_PER_HOUR", 5)
AUTH_REFRESH_PER_MINUTE = _env_int("RATE_LIMIT_AUTH_REFRESH_PER_MINUTE", 20)

CHAT_MESSAGE_PER_MINUTE = _env_int("RATE_LIMIT_CHAT_MESSAGE_PER_MINUTE", 20)
CHAT_MESSAGE_PER_DAY = _env_int("RATE_LIMIT_CHAT_MESSAGE_PER_DAY", 200)
CHAT_OPENING_PER_MINUTE = _env_int("RATE_LIMIT_CHAT_OPENING_PER_MINUTE", 10)
CHAT_OPENING_PER_DAY = _env_int("RATE_LIMIT_CHAT_OPENING_PER_DAY", 100)
SESSION_SUMMARY_PER_DAY = _env_int("RATE_LIMIT_SESSION_SUMMARY_PER_DAY", 100)
STYLE_REWRITE_PER_DAY = _env_int("RATE_LIMIT_STYLE_REWRITE_PER_DAY", 30)
EXERCISE_GENERATE_PER_HOUR = _env_int("RATE_LIMIT_EXERCISE_GENERATE_PER_HOUR", 10)
FLASHCARD_GENERATE_PER_HOUR = _env_int("RATE_LIMIT_FLASHCARD_GENERATE_PER_HOUR", 10)
TEACHER_ASK_PER_HOUR = _env_int("RATE_LIMIT_TEACHER_ASK_PER_HOUR", 20)
TRANSLATE_PER_MINUTE = _env_int("RATE_LIMIT_TRANSLATE_PER_MINUTE", 30)
RESOURCE_QUESTIONS_PER_HOUR = _env_int("RATE_LIMIT_RESOURCE_QUESTIONS_PER_HOUR", 20)
AUDIO_TRANSCRIBE_PER_HOUR = _env_int("RATE_LIMIT_AUDIO_TRANSCRIBE_PER_HOUR", 30)
AUDIO_SPEECH_PER_HOUR = _env_int("RATE_LIMIT_AUDIO_SPEECH_PER_HOUR", 60)
PRONUNCIATION_FEEDBACK_PER_HOUR = _env_int("RATE_LIMIT_PRONUNCIATION_FEEDBACK_PER_HOUR", 30)

MINUTE = 60
HOUR = 60 * MINUTE
DAY = 24 * HOUR


def _hash_identity(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()[:24]


def client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def require_rate_limit(scope: str, identity: str, limit: int, window_seconds: int) -> None:
    if not RATE_LIMITS_ENABLED or limit <= 0:
        return

    now = time.monotonic()
    bucket_key = f"{scope}:{_hash_identity(identity)}"
    cutoff = now - window_seconds

    with _lock:
        bucket = _buckets[bucket_key]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= limit:
            retry_after = max(1, int(bucket[0] + window_seconds - now))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)


def require_ip_rate_limit(
    request: Request,
    scope: str,
    limit: int,
    window_seconds: int,
    extra_identity: str | None = None,
) -> None:
    identity = client_ip(request)
    if extra_identity:
        identity = f"{identity}:{extra_identity}"
    require_rate_limit(scope, identity, limit, window_seconds)


def require_user_rate_limit(
    current_user: CurrentUser,
    scope: str,
    limit: int,
    window_seconds: int,
) -> None:
    require_rate_limit(scope, str(current_user.id), limit, window_seconds)


def require_user_daily_limit(current_user: CurrentUser, scope: str, limit: int) -> None:
    require_user_rate_limit(current_user, f"{scope}:daily", limit, DAY)
