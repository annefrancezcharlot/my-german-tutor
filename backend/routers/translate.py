from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

from auth import CurrentUser, get_current_user
from rate_limits import MINUTE, TRANSLATE_PER_MINUTE, require_user_rate_limit
from services.claude_service import translate_text

router = APIRouter(prefix="/translate", tags=["translate"], dependencies=[Depends(get_current_user)])


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1200)
    source_language: str = "auto"
    target_language: str = "auto"


class TranslateResponse(BaseModel):
    source_language: Optional[str] = None
    target_language: Optional[str] = None
    translation: str
    alternatives: List[str] = []
    notes: str = ""


@router.post("", response_model=TranslateResponse)
def translate(
    request: TranslateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(current_user, "translate", TRANSLATE_PER_MINUTE, MINUTE)

    try:
        return translate_text(
            text=request.text,
            source_language=request.source_language,
            target_language=request.target_language,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Translation failed: {exc}",
        ) from exc
