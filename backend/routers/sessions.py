import logging
import json
import re
from fastapi import APIRouter, Depends, HTTPException
from pathlib import Path
from sqlalchemy.orm import Session
from typing import Any, Dict, List
import models
import schemas
from auth import CurrentUser, get_current_user
from database import get_db
from services.claude_service import rewrite_session_style
from rate_limits import STYLE_REWRITE_PER_DAY, require_user_daily_limit

router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = logging.getLogger(__name__)
SESSION_TOPICS_PATH = Path(__file__).resolve().parents[1] / "content" / "session_topics.json"
REWRITE_MODES = {
    "minimal",
    "natural",
    "casual",
    "elevated",
    "swiss_german",
}
SWISS_DIALECTS = {
    "Aargau",
    "Bern",
    "Basel",
    "Graubünden",
    "Luzern",
    "St. Gallen",
    "Valais",
    "Zürich",
}


def load_session_topics() -> List[Dict[str, Any]]:
    with SESSION_TOPICS_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _serialize_style_rewrite(rewrite: models.StyleRewrite) -> schemas.StyleRewriteItem:
    return schemas.StyleRewriteItem(
        id=rewrite.id,
        message_id=rewrite.message_id,
        original=rewrite.original,
        rewritten=rewrite.rewritten,
        style_notes=rewrite.style_notes,
        rewrite_mode=rewrite.rewrite_mode,
        created_at=rewrite.created_at,
        register=rewrite.style_register,
    )


def _clean_free_conversation_title(title: str) -> str:
    cleaned = re.sub(
        r"\s*:\s*(?:Free topic|Freies Thema)\.\s*(?:Let's talk about this topic|Lass uns ueber dieses Thema sprechen):\s*.*$",
        "",
        title,
        flags=re.IGNORECASE,
    ).strip()
    cleaned = re.sub(
        r"^(?:Free topic|Freies Thema)\.\s*(?:Let's talk about this topic|Lass uns ueber dieses Thema sprechen):\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned or title.strip()


@router.get("/topics")
def get_topics(_current_user: CurrentUser = Depends(get_current_user)):
    return load_session_topics()


@router.get("/free-conversation-topics")
def get_free_conversation_topics(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    predefined_titles = {topic.get("title") for topic in load_session_topics()}
    rows = (
        db.query(models.ConversationSession)
        .filter(
            models.ConversationSession.user_id == current_user.id,
            models.ConversationSession.message_count > 0,
            models.ConversationSession.ended_at.isnot(None),
        )
        .order_by(models.ConversationSession.started_at.desc())
        .limit(500)
        .all()
    )

    seen = set()
    topics = []
    for row in rows:
        title = _clean_free_conversation_title(row.topic.strip())
        if not title or title in predefined_titles or title in seen:
            continue

        seen.add(title)
        topics.append({
            "title": title,
            "category": row.topic_category or "Free discussions",
            "description": "Freies Gespraechsthema",
            "last_used_at": row.started_at,
        })
        if len(topics) >= limit:
            break

    return topics


@router.post("/", response_model=schemas.SessionResponse)
def create_session(
    data: schemas.SessionCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    session = models.ConversationSession(
        user_id=current_user.id,
        topic=data.topic,
        topic_category=data.topic_category,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/me", response_model=List[schemas.SessionResponse])
def get_user_sessions(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    return (
        db.query(models.ConversationSession)
        .filter(
            models.ConversationSession.user_id == current_user.id,
            models.ConversationSession.message_count > 0,
            models.ConversationSession.ended_at.isnot(None),
        )
        .order_by(models.ConversationSession.started_at.desc())
        .all()
    )


@router.delete("/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    session = db.query(models.ConversationSession).filter(
        models.ConversationSession.id == session_id,
        models.ConversationSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(session)
    db.commit()
    return {"message": "Session deleted"}


@router.get("/{session_id}/messages")
def get_session_messages(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    session = db.query(models.ConversationSession).filter(
        models.ConversationSession.id == session_id,
        models.ConversationSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = (
        db.query(models.Message)
        .filter(models.Message.session_id == session_id)
        .order_by(models.Message.timestamp.asc())
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "corrected_content": m.corrected_content,
            "has_errors": bool(m.has_errors),
            "timestamp": m.timestamp,
        }
        for m in messages
    ]


@router.get("/{session_id}/style-rewrites", response_model=schemas.StyleRewriteResponse)
def get_saved_style_rewrites(
    session_id: int,
    rewrite_mode: str = "natural",
    swiss_dialect: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if rewrite_mode not in REWRITE_MODES:
        raise HTTPException(status_code=400, detail="Invalid rewrite mode")
    if rewrite_mode == "swiss_german" and swiss_dialect and swiss_dialect not in SWISS_DIALECTS:
        raise HTTPException(status_code=400, detail="Invalid Swiss dialect")

    session = db.query(models.ConversationSession).filter(
        models.ConversationSession.id == session_id,
        models.ConversationSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    query = db.query(models.StyleRewrite).filter(
        models.StyleRewrite.session_id == session_id,
        models.StyleRewrite.user_id == current_user.id,
        models.StyleRewrite.rewrite_mode == rewrite_mode,
    )
    if rewrite_mode == "swiss_german" and swiss_dialect:
        query = query.filter(models.StyleRewrite.style_register == swiss_dialect)

    rewrites = query.order_by(models.StyleRewrite.message_id.asc(), models.StyleRewrite.id.asc()).all()
    return schemas.StyleRewriteResponse(
        session_id=session_id,
        rewrite_mode=rewrite_mode,
        rewrites=[_serialize_style_rewrite(rewrite) for rewrite in rewrites],
    )


@router.post("/{session_id}/style-rewrite", response_model=schemas.StyleRewriteResponse)
def style_rewrite_session(
    session_id: int,
    request: schemas.StyleRewriteRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_daily_limit(current_user, "sessions:style-rewrite", STYLE_REWRITE_PER_DAY)
    user_id = current_user.id

    rewrite_mode = request.rewrite_mode
    if rewrite_mode not in REWRITE_MODES:
        raise HTTPException(status_code=400, detail="Invalid rewrite mode")
    swiss_dialect = request.swiss_dialect
    if rewrite_mode == "swiss_german":
        swiss_dialect = swiss_dialect or "Bern"
        if swiss_dialect not in SWISS_DIALECTS:
            raise HTTPException(status_code=400, detail="Invalid Swiss dialect")
    else:
        swiss_dialect = None

    logger.info(
        "style_rewrite.request session_id=%s user_id=%s rewrite_mode=%s swiss_dialect=%s",
        session_id,
        user_id,
        rewrite_mode,
        swiss_dialect,
    )
    session = db.query(models.ConversationSession).filter(
        models.ConversationSession.id == session_id,
        models.ConversationSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    messages = (
        db.query(models.Message)
        .filter(
            models.Message.session_id == session_id,
            models.Message.role == "user",
        )
        .order_by(models.Message.timestamp.asc())
        .all()
    )
    if not messages:
        logger.info(
            "style_rewrite.no_messages session_id=%s user_id=%s",
            session_id,
            user_id,
        )
        return schemas.StyleRewriteResponse(
            session_id=session_id,
            rewrite_mode=rewrite_mode,
            rewrites=[],
        )

    learner_messages = [
        {
            "message_id": message.id,
            "original": message.corrected_content or message.content,
        }
        for message in messages
    ]
    total_chars = sum(len(message["original"]) for message in learner_messages)
    logger.info(
        "style_rewrite.loaded_messages session_id=%s user_id=%s message_count=%s total_chars=%s",
        session_id,
        user_id,
        len(learner_messages),
        total_chars,
    )

    try:
        data = rewrite_session_style(
            messages=learner_messages,
            topic=session.topic,
            level=user.level,
            rewrite_mode=rewrite_mode,
            swiss_dialect=swiss_dialect,
            session_id=session_id,
            user_id=user_id,
        )
    except Exception as exc:
        logger.exception(
            "style_rewrite.failed session_id=%s user_id=%s error_type=%s",
            session_id,
            user_id,
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="Style rewrite failed") from exc

    rewrite_count = len(data.get("rewrites", []))
    if rewrite_count:
        delete_query = db.query(models.StyleRewrite).filter(
            models.StyleRewrite.session_id == session_id,
            models.StyleRewrite.user_id == user_id,
            models.StyleRewrite.rewrite_mode == rewrite_mode,
        )
        if rewrite_mode == "swiss_german" and swiss_dialect:
            delete_query = delete_query.filter(models.StyleRewrite.style_register == swiss_dialect)
        delete_query.delete(synchronize_session=False)
        saved_rewrites = [
            models.StyleRewrite(
                user_id=user_id,
                session_id=session_id,
                message_id=item["message_id"],
                rewrite_mode=rewrite_mode,
                original=item["original"],
                rewritten=item["rewritten"],
                style_notes=item["style_notes"],
                style_register=item.get("register"),
            )
            for item in data.get("rewrites", [])
        ]
        db.add_all(saved_rewrites)
        db.commit()
        for rewrite in saved_rewrites:
            db.refresh(rewrite)
    else:
        saved_rewrites = []

    logger.info(
        "style_rewrite.response session_id=%s user_id=%s rewrite_mode=%s rewrite_count=%s",
        session_id,
        user_id,
        rewrite_mode,
        rewrite_count,
    )

    return schemas.StyleRewriteResponse(
        session_id=session_id,
        rewrite_mode=rewrite_mode,
        rewrites=[_serialize_style_rewrite(rewrite) for rewrite in saved_rewrites],
    )
