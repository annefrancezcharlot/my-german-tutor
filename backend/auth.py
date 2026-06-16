import os
from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = None
supabase_admin = None
security = HTTPBearer()


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: Optional[str]
    metadata: dict[str, Any]
    raw: Any


def get_supabase_client():
    global supabase

    if supabase:
        return supabase

    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set",
        )

    supabase = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    return supabase


def get_supabase_admin_client():
    global supabase_admin

    if supabase_admin:
        return supabase_admin

    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Account deletion is not configured yet.",
        )

    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
    return supabase_admin


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    token = credentials.credentials

    try:
        response = get_supabase_client().auth.get_user(token)
        user = response.user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    try:
        user_id = UUID(str(user.id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )

    return CurrentUser(
        id=user_id,
        email=getattr(user, "email", None),
        metadata=getattr(user, "user_metadata", None) or {},
        raw=user,
    )


verify_token = get_current_user


def require_same_user(requested_user_id: UUID, current_user: CurrentUser) -> None:
    if requested_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot access another user's data",
        )
