from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import models
import schemas
from auth import CurrentUser, get_current_user
from database import get_db
from services.claude_service import (
    generate_opening_message,
    generate_session_summary,
    get_chat_response,
)
from services.scoring import calculate_accuracy_score
from rate_limits import (
    CHAT_MESSAGE_PER_DAY,
    CHAT_MESSAGE_PER_MINUTE,
    CHAT_OPENING_PER_DAY,
    CHAT_OPENING_PER_MINUTE,
    MINUTE,
    SESSION_SUMMARY_PER_DAY,
    require_user_daily_limit,
    require_user_rate_limit,
)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/session/{session_id}/opening", response_model=schemas.ChatOpeningResponse)
def create_opening_message(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(current_user, "chat:opening", CHAT_OPENING_PER_MINUTE, MINUTE)
    require_user_daily_limit(current_user, "chat:opening", CHAT_OPENING_PER_DAY)

    session = db.query(models.ConversationSession).filter(
        models.ConversationSession.id == session_id,
        models.ConversationSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    existing_user_message = db.query(models.Message.id).filter(
        models.Message.session_id == session.id,
        models.Message.role == "user",
    ).first()
    if existing_user_message:
        raise HTTPException(status_code=400, detail="Conversation already started")

    existing_opening = db.query(models.Message).filter(
        models.Message.session_id == session.id,
        models.Message.role == "assistant",
    ).order_by(models.Message.timestamp.asc()).first()
    if existing_opening:
        return schemas.ChatOpeningResponse(
            session_id=session.id,
            reply=existing_opening.content,
        )

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    reply = generate_opening_message(session.topic, user.level)
    assistant_msg = models.Message(
        session_id=session.id,
        role="assistant",
        content=reply,
    )
    db.add(assistant_msg)
    db.commit()

    return schemas.ChatOpeningResponse(
        session_id=session.id,
        reply=reply,
    )


@router.post("/message", response_model=schemas.ChatResponse)
def send_message(
    request: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(current_user, "chat:message", CHAT_MESSAGE_PER_MINUTE, MINUTE)
    require_user_daily_limit(current_user, "chat:message", CHAT_MESSAGE_PER_DAY)

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Create a DB session only when the learner sends the first message.
    if request.session_id is None:
        if not request.topic or not request.topic_category:
            raise HTTPException(status_code=400, detail="Topic is required for a new session")
        session = models.ConversationSession(
            user_id=current_user.id,
            topic=request.topic,
            topic_category=request.topic_category,
        )
        db.add(session)
        db.flush()
    else:
        session = db.query(models.ConversationSession).filter(
            models.ConversationSession.id == request.session_id,
            models.ConversationSession.user_id == current_user.id,
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

    # Build conversation history for Claude
    history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

    # Get Claude response
    claude_data = get_chat_response(
        user_message=request.message,
        conversation_history=history,
        topic=session.topic,
        level=user.level,
    )

    # Save user message
    user_msg = models.Message(
        session_id=session.id,
        role="user",
        content=request.message,
        corrected_content=claude_data.get("corrected_user_message"),
        has_errors=bool(claude_data.get("has_errors")),
    )
    db.add(user_msg)

    # Save assistant reply
    assistant_msg = models.Message(
        session_id=session.id,
        role="assistant",
        content=claude_data.get("reply", ""),
    )
    db.add(assistant_msg)

    # Persist errors
    corrections = claude_data.get("corrections", [])
    for err in corrections:
        error_record = models.ErrorRecord(
            user_id=current_user.id,
            session_id=session.id,
            category=err.get("category", "other"),
            subcategory=err.get("subcategory"),
            severity=err.get("severity", "medium"),
            original_text=err.get("original", ""),
            corrected_text=err.get("corrected", ""),
            explanation=err.get("explanation", ""),
            context=request.message,
        )
        db.add(error_record)

    previous_user_messages = (
        db.query(models.Message.content)
        .filter(
            models.Message.session_id == session.id,
            models.Message.role == "user",
        )
        .all()
    )
    previous_errors = (
        db.query(models.ErrorRecord.severity)
        .filter(models.ErrorRecord.session_id == session.id)
        .all()
    )
    score_data = calculate_accuracy_score(
        user_texts=[m.content for m in previous_user_messages] + [request.message],
        errors=[{"severity": err.severity} for err in previous_errors] + corrections,
    )

    # Update session stats
    session.message_count = (session.message_count or 0) + 2
    session.error_count = (session.error_count or 0) + len(corrections)

    db.commit()

    return schemas.ChatResponse(
        session_id=session.id,
        reply=claude_data.get("reply", ""),
        corrections=[schemas.ErrorDetail(**e) for e in corrections],
        corrected_user_message=claude_data.get("corrected_user_message"),
        has_errors=claude_data.get("has_errors", False),
        session_score=score_data["score"],
    )


@router.post("/session/{session_id}/end")
def end_session(
    session_id: int,
    save_category: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_daily_limit(current_user, "chat:session-summary", SESSION_SUMMARY_PER_DAY)

    from datetime import datetime, timezone

    session = db.query(models.ConversationSession).filter(
        models.ConversationSession.id == session_id,
        models.ConversationSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = db.query(models.Message).filter(
        models.Message.session_id == session_id
    ).all()
    errors = db.query(models.ErrorRecord).filter(
        models.ErrorRecord.session_id == session_id
    ).all()

    user = db.query(models.User).filter(models.User.id == current_user.id).first()

    if not any(m.role == "user" for m in messages):
        db.delete(session)
        db.commit()
        return {
            "message": "Empty session discarded",
            "summary": None,
            "score": None,
            "error_count": 0,
        }

    learner_messages = [{"role": m.role, "content": m.content} for m in messages if m.role == "user"]
    err_dicts = [
        {"category": e.category, "original": e.original_text,
         "corrected": e.corrected_text, "severity": e.severity}
        for e in errors
    ]
    user_texts = [m.content for m in messages if m.role == "user"]

    assessment = generate_session_summary(
        messages=learner_messages,
        errors=err_dicts,
        topic=session.topic,
        level=user.level,
    )

    score_data = calculate_accuracy_score(
        user_texts=user_texts,
        errors=[{"severity": e.severity} for e in errors],
    )
    error_count = len(errors)

    session.ended_at = datetime.now(timezone.utc)
    session.summary = assessment.get("summary")
    session.estimated_level = assessment.get("estimated_level")
    session.accuracy_score = score_data["score"]
    session.score = score_data["score"]
    if save_category and save_category.strip():
        session.topic_category = save_category.strip()

    db.commit()

    return {
        "message": "Session ended",
        "summary": session.summary,
        "estimated_level": session.estimated_level,
        "score": session.score,
        "error_count": error_count,
    }
