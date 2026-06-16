from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pathlib import Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
import json
import logging
import re
import unicodedata

import models
from auth import CurrentUser, get_current_user
from database import get_db
from services.claude_service import generate_flashcard_set
from rate_limits import FLASHCARD_GENERATE_PER_HOUR, HOUR, require_user_rate_limit

router = APIRouter(prefix="/flashcards", tags=["flashcards"])
logger = logging.getLogger(__name__)

FLASHCARD_SET_DIR = Path(__file__).resolve().parents[1] / "content" / "flashcard_sets"
ReviewStatus = Literal["again", "hard", "good", "easy"]
StudyMode = Literal["due", "due_new", "all"]
STATUS_PRIORITY = {
    "again": 0,
    "hard": 1,
    "new": 2,
    "good": 3,
    "easy": 4,
}


class SessionReviewItem(BaseModel):
    card_id: str
    status: ReviewStatus


class SessionReviewRequest(BaseModel):
    set_id: str
    reviews: List[SessionReviewItem] = Field(default_factory=list)


class FlashcardGenerateRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=120)
    precise_topic: Optional[str] = Field(default=None, max_length=240)
    count: int = Field(default=12, ge=3, le=30)


class FlashcardCardStatusResponse(BaseModel):
    card_id: str
    status: ReviewStatus
    session_id: int
    reviewed_at: Optional[datetime] = None


class FlashcardProgressResponse(BaseModel):
    user_id: UUID
    set_id: str
    latest_session_id: Optional[int] = None
    reviews: List[FlashcardCardStatusResponse] = Field(default_factory=list)


class FlashcardStudyCard(BaseModel):
    id: str
    front: str
    back: str
    example: Optional[str] = None
    case_examples: Dict[str, str] = Field(default_factory=dict)
    tense_examples: Dict[str, str] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    latest_status: Optional[str] = None
    due_at: Optional[datetime] = None
    interval_days: float = 0
    review_count: int = 0
    is_due: bool = False
    is_new: bool = False
    priority: int = 0


class FlashcardStudySummary(BaseModel):
    total: int
    due: int
    new: int
    not_due: int
    again: int
    hard: int
    good: int
    easy: int


class FlashcardStudySessionResponse(BaseModel):
    user_id: UUID
    set_id: str
    mode: StudyMode
    cards: List[FlashcardStudyCard]
    summary: FlashcardStudySummary


def _load_json_set(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Invalid flashcard JSON in {path.name}: {exc}",
        ) from exc

    required = ("id", "topic", "level", "title", "cards")
    missing = [field for field in required if field not in data]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Flashcard set {path.name} is missing: {', '.join(missing)}",
        )

    if not isinstance(data["cards"], list):
        raise HTTPException(
            status_code=500,
            detail=f"Flashcard set {path.name} must contain a list of cards",
        )

    return data


def _load_json_sets() -> List[Dict[str, Any]]:
    if not FLASHCARD_SET_DIR.exists():
        return []

    return [
        _load_json_set(path)
        for path in sorted(FLASHCARD_SET_DIR.glob("*.json"))
    ]


def _slugify(value: str, fallback: str = "flashcards") -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_value.lower()).strip("_")
    return slug[:60] or fallback


def _card_to_dict(card: models.FlashcardCard) -> Dict[str, Any]:
    return {
        "id": card.card_id,
        "front": card.front,
        "back": card.back,
        "example": card.example or "",
        "case_examples": card.case_examples if isinstance(card.case_examples, dict) else {},
        "tense_examples": card.tense_examples if isinstance(card.tense_examples, dict) else {},
        "tags": card.tags if isinstance(card.tags, list) else [],
    }


def _set_to_dict(item: models.FlashcardSet) -> Dict[str, Any]:
    return {
        "id": item.id,
        "topic": item.topic,
        "level": item.level,
        "title": item.title,
        "description": item.description or "",
        "cards": [_card_to_dict(card) for card in item.cards],
    }


def _visible_sets_query(db: Session, user_id: Optional[UUID]):
    query = db.query(models.FlashcardSet)
    if user_id is None:
        return query.filter(models.FlashcardSet.user_id.is_(None))
    return query.filter(
        (models.FlashcardSet.user_id == user_id)
        | (models.FlashcardSet.user_id.is_(None))
    )


def _unique_set_id(db: Session, topic: str, level: str, user_id: UUID) -> str:
    base = f"generated_{_slugify(topic)}_{_slugify(level.lower(), 'level')}"
    candidate = base
    suffix = 2
    while (
        db.query(models.FlashcardSet.id)
        .filter(models.FlashcardSet.id == candidate)
        .first()
        is not None
    ):
        candidate = f"{base}_{suffix}"
        suffix += 1
    return candidate


def _unique_card_id(front: str, used_ids: set[str], index: int) -> str:
    base = _slugify(front, f"card_{index}")
    candidate = base
    suffix = 2
    while candidate in used_ids:
        candidate = f"{base}_{suffix}"
        suffix += 1
    used_ids.add(candidate)
    return candidate


def _string_dict(value: Any) -> Dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key).strip(): str(item).strip()
        for key, item in value.items()
        if str(key).strip() and str(item).strip()
    }


def _normalize_generated_flashcard_set(
    data: Dict[str, Any],
    set_id: str,
    requested_topic: str,
    requested_level: str,
) -> Dict[str, Any]:
    cards = data.get("cards")
    if not isinstance(cards, list):
        raise HTTPException(status_code=502, detail="Generated flashcards had an invalid card list")

    used_card_ids: set[str] = set()
    normalized_cards = []
    for index, card in enumerate(cards, start=1):
        if not isinstance(card, dict):
            continue
        front = card.get("front")
        back = card.get("back")
        if not isinstance(front, str) or not front.strip():
            continue
        if not isinstance(back, str) or not back.strip():
            continue

        tags = card.get("tags")
        normalized_cards.append({
            "id": _unique_card_id(front, used_card_ids, index),
            "front": front.strip(),
            "back": back.strip(),
            "example": card.get("example").strip() if isinstance(card.get("example"), str) else "",
            "case_examples": _string_dict(card.get("case_examples")),
            "tense_examples": _string_dict(card.get("tense_examples")),
            "tags": [
                tag.strip()
                for tag in tags
                if isinstance(tag, str) and tag.strip()
            ][:8] if isinstance(tags, list) else [],
        })

    if not normalized_cards:
        raise HTTPException(status_code=502, detail="Generated flashcards did not contain usable cards")

    topic = data.get("topic")
    title = data.get("title")
    description = data.get("description")
    return {
        "id": set_id,
        "topic": topic.strip() if isinstance(topic, str) and topic.strip() else requested_topic,
        "level": requested_level,
        "title": title.strip() if isinstance(title, str) and title.strip() else f"{requested_topic} Wortschatz",
        "description": description.strip() if isinstance(description, str) else "",
        "cards": normalized_cards,
    }


def _find_set(
    db: Session,
    set_id: str,
    user_id: Optional[UUID] = None,
) -> Optional[models.FlashcardSet]:
    return (
        _visible_sets_query(db, user_id)
        .filter(models.FlashcardSet.id == set_id)
        .first()
    )


def _card_ids_for_set(db: Session, set_id: str, user_id: Optional[UUID] = None) -> set[str]:
    item = _find_set(db, set_id, user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    return {
        card.card_id
        for card in item.cards
        if isinstance(card.card_id, str)
    }


def _review_states_by_card(
    db: Session,
    user_id: UUID,
    set_id: str,
    card_ids: set[str],
) -> Dict[str, models.FlashcardReviewState]:
    if not card_ids:
        return {}

    rows = (
        db.query(models.FlashcardReviewState)
        .filter(
            models.FlashcardReviewState.user_id == user_id,
            models.FlashcardReviewState.set_id == set_id,
            models.FlashcardReviewState.card_id.in_(card_ids),
        )
        .all()
    )
    return {row.card_id: row for row in rows}


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _review_states_with_new_cards(
    db: Session,
    user_id: UUID,
    set_id: str,
    card_ids: set[str],
) -> Dict[str, models.FlashcardReviewState]:
    return _review_states_by_card(db, user_id, set_id, card_ids)


def _calculate_next_schedule(
    rating: ReviewStatus,
    previous_interval_days: float,
    previous_ease_factor: float,
    review_count: int,
    now: datetime,
) -> tuple[float, float, datetime]:
    if rating == "again":
        next_interval = 1.0
        next_ease = max(1.3, previous_ease_factor - 0.2)
    elif rating == "hard":
        next_interval = 1.0 if review_count == 0 else max(1.0, previous_interval_days * 1.2)
        next_ease = max(1.3, previous_ease_factor - 0.05)
    elif rating == "good":
        next_interval = 2.0 if review_count == 0 else max(2.0, previous_interval_days * previous_ease_factor)
        next_ease = previous_ease_factor
    else:
        next_interval = 4.0 if review_count == 0 else max(4.0, previous_interval_days * (previous_ease_factor + 0.7))
        next_ease = min(3.0, previous_ease_factor + 0.15)

    next_interval = round(next_interval, 2)
    next_due = now + timedelta(days=next_interval)
    return next_interval, next_ease, next_due


def _study_card_from_json(
    card: Dict[str, Any],
    state: Optional[models.FlashcardReviewState],
    now: datetime,
) -> FlashcardStudyCard:
    latest_status = state.status if state else None
    is_new = state is None or (state.review_count or 0) == 0
    due_at = _as_utc(state.due_at) if state else None
    is_due = is_new or due_at is None or due_at <= now
    status_for_priority = latest_status or "new"
    priority = STATUS_PRIORITY.get(status_for_priority, STATUS_PRIORITY["new"])
    if not is_due and not is_new:
        priority += 10

    return FlashcardStudyCard(
        id=card["id"],
        front=card["front"],
        back=card["back"],
        example=card.get("example"),
        case_examples=card.get("case_examples") if isinstance(card.get("case_examples"), dict) else {},
        tense_examples=card.get("tense_examples") if isinstance(card.get("tense_examples"), dict) else {},
        tags=card.get("tags") if isinstance(card.get("tags"), list) else [],
        latest_status=latest_status,
        due_at=due_at,
        interval_days=state.interval_days if state else 0,
        review_count=state.review_count if state else 0,
        is_due=is_due,
        is_new=is_new,
        priority=priority,
    )


def _build_study_session(
    db: Session,
    user_id: UUID,
    set_id: str,
    mode: StudyMode,
) -> FlashcardStudySessionResponse:
    item = _find_set(db, set_id, user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    card_ids = {
        card.card_id
        for card in item.cards
        if isinstance(card.card_id, str)
    }
    states = _review_states_with_new_cards(db, user_id, set_id, card_ids)
    now = datetime.now(timezone.utc)
    study_cards = [
        _study_card_from_json(_card_to_dict(card), states.get(card.card_id), now)
        for card in item.cards
        if isinstance(card.card_id, str)
    ]

    summary = FlashcardStudySummary(
        total=len(study_cards),
        due=sum(1 for card in study_cards if card.is_due and not card.is_new),
        new=sum(1 for card in study_cards if card.is_new),
        not_due=sum(1 for card in study_cards if not card.is_due and not card.is_new),
        again=sum(1 for card in study_cards if card.latest_status == "again"),
        hard=sum(1 for card in study_cards if card.latest_status == "hard"),
        good=sum(1 for card in study_cards if card.latest_status == "good"),
        easy=sum(1 for card in study_cards if card.latest_status == "easy"),
    )

    if mode == "due":
        queue_cards = [card for card in study_cards if card.is_due and not card.is_new]
    elif mode == "due_new":
        queue_cards = [card for card in study_cards if card.is_due]
    else:
        queue_cards = study_cards

    queue_cards.sort(key=lambda card: (card.priority, card.due_at or now, card.front.lower()))
    return FlashcardStudySessionResponse(
        user_id=user_id,
        set_id=set_id,
        mode=mode,
        cards=queue_cards,
        summary=summary,
    )


def _build_flashcard_progress(
    db: Session,
    user_id: UUID,
    set_id: str,
    card_ids: set[str],
) -> FlashcardProgressResponse:
    latest_event_id = (
        db.query(models.FlashcardReviewEvent.id)
        .filter(
            models.FlashcardReviewEvent.user_id == user_id,
            models.FlashcardReviewEvent.set_id == set_id,
        )
        .order_by(models.FlashcardReviewEvent.reviewed_at.desc(), models.FlashcardReviewEvent.id.desc())
        .limit(1)
        .scalar()
    )

    states = _review_states_with_new_cards(db, user_id, set_id, card_ids)
    latest_by_card = {
        card_id: FlashcardCardStatusResponse(
            card_id=card_id,
            status=state.status,
            session_id=latest_event_id or 0,
            reviewed_at=state.last_reviewed_at,
        )
        for card_id, state in states.items()
        if state.status in {"again", "hard", "good", "easy"}
    }

    return FlashcardProgressResponse(
        user_id=user_id,
        set_id=set_id,
        latest_session_id=latest_event_id,
        reviews=list(latest_by_card.values()),
    )


def _get_user_or_404(db: Session, user_id: UUID) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/sets")
def list_flashcard_sets(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    _get_user_or_404(db, current_user.id)

    sets = (
        _visible_sets_query(db, current_user.id)
        .order_by(models.FlashcardSet.created_at.desc(), models.FlashcardSet.title.asc())
        .all()
    )
    return [
        {
            "id": item["id"],
            "topic": item["topic"],
            "level": item["level"],
            "title": item["title"],
            "description": item.get("description", ""),
            "card_count": len(item["cards"]),
        }
        for item in (_set_to_dict(row) for row in sets)
    ]


@router.post("/sets/generate")
def generate_flashcard_set_file(
    request: FlashcardGenerateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(
        current_user,
        "flashcards:generate",
        FLASHCARD_GENERATE_PER_HOUR,
        HOUR,
    )

    user = _get_user_or_404(db, current_user.id)
    topic = request.topic.strip()
    precise_topic = request.precise_topic.strip() if request.precise_topic else None
    set_id = _unique_set_id(db, precise_topic or topic, user.level, current_user.id)

    try:
        generated = generate_flashcard_set(
            topic=topic,
            precise_topic=precise_topic,
            level=user.level,
            count=request.count,
        )
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="The LLM returned invalid flashcard JSON") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Flashcard generation failed") from exc

    item = _normalize_generated_flashcard_set(
        generated,
        set_id=set_id,
        requested_topic=topic,
        requested_level=user.level,
    )

    db_set = models.FlashcardSet(
        id=item["id"],
        user_id=current_user.id,
        topic=item["topic"],
        level=item["level"],
        title=item["title"],
        description=item["description"],
    )
    for position, card in enumerate(item["cards"], start=1):
        db_set.cards.append(models.FlashcardCard(
            card_id=card["id"],
            position=position,
            front=card["front"],
            back=card["back"],
            example=card.get("example") or "",
            case_examples=card.get("case_examples") or {},
            tense_examples=card.get("tense_examples") or {},
            tags=card.get("tags") or [],
        ))

    db.add(db_set)
    db.commit()
    db.refresh(db_set)

    return {
        "id": item["id"],
        "topic": item["topic"],
        "level": item["level"],
        "title": item["title"],
        "description": item["description"],
        "card_count": len(item["cards"]),
    }


@router.get("/sets/{set_id}")
def get_flashcard_set(
    set_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    _get_user_or_404(db, current_user.id)
    item = _find_set(db, set_id, current_user.id)
    if item:
        return _set_to_dict(item)

    raise HTTPException(status_code=404, detail="Flashcard set not found")


@router.get("/study-session/{set_id}", response_model=FlashcardStudySessionResponse)
def get_flashcard_study_session(
    set_id: str,
    mode: StudyMode = "due_new",
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    _get_user_or_404(db, current_user.id)
    return _build_study_session(db, current_user.id, set_id, mode)


@router.get("/progress/{set_id}", response_model=FlashcardProgressResponse)
def get_flashcard_progress(
    set_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    _get_user_or_404(db, current_user.id)
    card_ids = _card_ids_for_set(db, set_id, current_user.id)
    return _build_flashcard_progress(db, current_user.id, set_id, card_ids)


@router.post("/progress/session", response_model=FlashcardProgressResponse)
def save_flashcard_session(
    request: SessionReviewRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info(
        "flashcards.save_session.start user_id=%s set_id=%s review_count=%s",
        current_user.id,
        request.set_id,
        len(request.reviews),
    )
    _get_user_or_404(db, current_user.id)
    card_ids = _card_ids_for_set(db, request.set_id, current_user.id)

    for item in request.reviews:
        if item.card_id not in card_ids:
            raise HTTPException(status_code=400, detail="Card does not belong to this set")

    final_reviews = {
        item.card_id: item.status
        for item in request.reviews
    }
    states = _review_states_with_new_cards(db, current_user.id, request.set_id, card_ids)
    now = datetime.now(timezone.utc)

    for card_id, status in final_reviews.items():
        state = states.get(card_id)
        if not state:
            state = models.FlashcardReviewState(
                user_id=current_user.id,
                set_id=request.set_id,
                card_id=card_id,
                status="new",
                due_at=now,
                interval_days=0,
                ease_factor=2.3,
                review_count=0,
                lapse_count=0,
            )
            db.add(state)
            db.flush()
            states[card_id] = state

        previous_due_at = state.due_at
        previous_interval_days = state.interval_days or 0
        previous_ease_factor = state.ease_factor or 2.3
        next_interval_days, next_ease_factor, next_due_at = _calculate_next_schedule(
            rating=status,
            previous_interval_days=previous_interval_days,
            previous_ease_factor=previous_ease_factor,
            review_count=state.review_count or 0,
            now=now,
        )

        db.add(models.FlashcardReviewEvent(
            user_id=current_user.id,
            set_id=request.set_id,
            card_id=card_id,
            rating=status,
            reviewed_at=now,
            previous_due_at=previous_due_at,
            next_due_at=next_due_at,
            previous_interval_days=previous_interval_days,
            next_interval_days=next_interval_days,
            previous_ease_factor=previous_ease_factor,
            next_ease_factor=next_ease_factor,
        ))

        state.status = status
        state.due_at = next_due_at
        state.interval_days = next_interval_days
        state.ease_factor = next_ease_factor
        state.review_count = (state.review_count or 0) + 1
        state.lapse_count = (state.lapse_count or 0) + (1 if status == "again" else 0)
        state.last_reviewed_at = now

    db.commit()
    progress = _build_flashcard_progress(db, current_user.id, request.set_id, card_ids)
    logger.info(
        "flashcards.save_session.done user_id=%s set_id=%s review_count=%s",
        current_user.id,
        request.set_id,
        len(request.reviews),
    )
    return progress
