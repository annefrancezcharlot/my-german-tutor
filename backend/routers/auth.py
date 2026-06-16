from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from uuid import UUID

import models
import schemas
from auth import CurrentUser, get_current_user, get_supabase_client
from database import get_db
from rate_limits import (
    AUTH_REFRESH_PER_MINUTE,
    AUTH_SIGN_IN_PER_MINUTE,
    AUTH_SIGN_UP_PER_HOUR,
    HOUR,
    MINUTE,
    require_ip_rate_limit,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_error_detail(exc: Exception, fallback: str) -> str:
    message = getattr(exc, "message", None) or str(exc)
    return message if message else fallback


def _default_username(user: CurrentUser) -> str:
    name = user.metadata.get("username") or user.metadata.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()

    if user.email and "@" in user.email:
        return user.email.split("@", 1)[0]

    return f"user-{str(user.id)[:8]}"


def _unique_username(db: Session, username: str, user_id) -> str:
    existing = (
        db.query(models.User)
        .filter(models.User.username == username, models.User.id != user_id)
        .first()
    )
    if not existing:
        return username

    return f"{username}-{str(user_id)[:8]}"


def _validate_level(level: str) -> str:
    if level not in ("B1", "B2", "C1"):
        raise HTTPException(status_code=400, detail="Invalid level")
    return level


def _validate_german_variant(german_variant: str) -> str:
    if german_variant not in ("de-DE", "de-CH", "de-AT"):
        raise HTTPException(status_code=400, detail="Invalid German dialect")
    return german_variant


def _get_or_create_profile(
    db: Session,
    user: CurrentUser,
    username: str | None = None,
    level: str = "B2",
    german_variant: str = "de-DE",
) -> models.User:
    profile = db.query(models.User).filter(models.User.id == user.id).first()
    if profile:
        return profile

    username = _unique_username(db, username or _default_username(user), user.id)
    profile = models.User(
        id=user.id,
        username=username,
        level=_validate_level(level),
        german_variant=_validate_german_variant(german_variant),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _current_user_from_supabase_user(user) -> CurrentUser:
    return CurrentUser(
        id=UUID(str(user.id)),
        email=getattr(user, "email", None),
        metadata=getattr(user, "user_metadata", None) or {},
        raw=user,
    )


def _session_response(
    auth_response,
    db: Session,
    profile_data: schemas.AuthCredentials | None = None,
) -> schemas.AuthSessionResponse:
    session = auth_response.session
    user = auth_response.user

    if not session:
        raise HTTPException(
            status_code=400,
            detail="Confirm your email address to finish creating your account.",
        )

    profile = _get_or_create_profile(
        db,
        _current_user_from_supabase_user(user),
        username=profile_data.username if profile_data else None,
        level=profile_data.level if profile_data else "B2",
        german_variant=profile_data.german_variant if profile_data else "de-DE",
    )
    return schemas.AuthSessionResponse(
        access_token=session.access_token,
        refresh_token=getattr(session, "refresh_token", None),
        expires_at=getattr(session, "expires_at", None),
        token_type=getattr(session, "token_type", None) or "bearer",
        profile=profile,
    )


@router.post("/sign-in", response_model=schemas.AuthSessionResponse)
def sign_in(
    data: schemas.AuthCredentials,
    request: Request,
    db: Session = Depends(get_db),
):
    require_ip_rate_limit(
        request,
        "auth:sign-in:ip",
        AUTH_SIGN_IN_PER_MINUTE * 4,
        MINUTE,
    )
    require_ip_rate_limit(
        request,
        "auth:sign-in:email",
        AUTH_SIGN_IN_PER_MINUTE,
        MINUTE,
        extra_identity=data.email,
    )
    try:
        response = get_supabase_client().auth.sign_in_with_password(
            {"email": data.email, "password": data.password}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail=_auth_error_detail(exc, "Invalid email or password"),
        )

    return _session_response(response, db)

@router.post("/sign-up")
def sign_up():
    raise HTTPException(status_code=403, detail="Sign-up is currently invite-only")


@router.post("/refresh", response_model=schemas.AuthSessionResponse)
def refresh_session(
    data: schemas.AuthRefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    require_ip_rate_limit(request, "auth:refresh", AUTH_REFRESH_PER_MINUTE, MINUTE)
    try:
        response = get_supabase_client().auth.refresh_session(data.refresh_token)
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail=_auth_error_detail(exc, "Could not refresh session"),
        )

    return _session_response(response, db)


@router.get("/me", response_model=schemas.AuthMeResponse)
def get_me(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(models.User).filter(models.User.id == current_user.id).first()
    return schemas.AuthMeResponse(
        id=current_user.id,
        email=current_user.email,
        profile=profile,
    )


@router.post("/profile", response_model=schemas.UserResponse)
def create_or_get_profile(
    data: schemas.AuthProfileCreate | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(models.User).filter(models.User.id == current_user.id).first()
    if profile:
        return profile

    requested_username = data.username if data and data.username else _default_username(current_user)
    username = _unique_username(db, requested_username, current_user.id)
    level = _validate_level(data.level if data else "B2")
    german_variant = _validate_german_variant(data.german_variant if data else "de-DE")

    profile = models.User(
        id=current_user.id,
        username=username,
        level=level,
        german_variant=german_variant,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
