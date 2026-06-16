from fastapi import APIRouter, Depends, HTTPException
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
import json

from auth import CurrentUser, get_current_user
from rate_limits import HOUR, RESOURCE_QUESTIONS_PER_HOUR, require_user_rate_limit
from services.claude_service import generate_resource_questions

router = APIRouter(prefix="/resources", tags=["resources"], dependencies=[Depends(get_current_user)])

RESOURCES_PATH = Path(__file__).resolve().parents[1] / "content" / "resources.json"


class ResourceQuestionRequest(BaseModel):
    level: str = "B2"
    question_count: int = Field(default=5, ge=1, le=10)


def _load_library() -> Dict[str, Any]:
    if not RESOURCES_PATH.exists():
        return {"version": 1, "items": []}

    try:
        with RESOURCES_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Invalid resources JSON: {exc}",
        ) from exc

    items = data.get("items")
    if not isinstance(items, list):
        raise HTTPException(
            status_code=500,
            detail="resources.json must contain an items list",
        )

    return data


def _find_resource(resource_id: str) -> Optional[Dict[str, Any]]:
    for item in _load_library()["items"]:
        if isinstance(item, dict) and item.get("id") == resource_id:
            return item
    return None


@router.get("")
def list_resources(
    resource_type: Optional[str] = None,
    topic: Optional[str] = None,
):
    items = [
        item for item in _load_library()["items"]
        if isinstance(item, dict)
    ]

    if resource_type:
        items = [
            item for item in items
            if str(item.get("type", "")).lower() == resource_type.lower()
        ]

    if topic:
        items = [
            item for item in items
            if str(item.get("topic", "")).lower() == topic.lower()
        ]

    return items


@router.get("/{resource_id}")
def get_resource(resource_id: str):
    resource = _find_resource(resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return resource


@router.post("/{resource_id}/questions")
def create_resource_questions(
    resource_id: str,
    request: ResourceQuestionRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(
        current_user,
        "resources:questions",
        RESOURCE_QUESTIONS_PER_HOUR,
        HOUR,
    )

    resource = _find_resource(resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    try:
        return generate_resource_questions(
            resource=resource,
            level=request.level,
            question_count=request.question_count,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not generate questions for this resource: {exc}",
        ) from exc
