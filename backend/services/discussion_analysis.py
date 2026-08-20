import logging
import re
import threading
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func

import models
from database import SessionLocal
from services.claude_service import analyze_message_batch, generate_session_summary
from services.scoring import calculate_accuracy_score

logger = logging.getLogger(__name__)

MESSAGE_CONTEXT_PREFIX = "[[discussion-message-id:"
_MESSAGE_CONTEXT_RE = re.compile(r"^\[\[discussion-message-id:(\d+)\]\]\s?(.*)$", re.DOTALL)
_locks_guard = threading.Lock()
_session_locks: dict[int, threading.Lock] = {}


def encode_error_context(message_id: int, public_context: str) -> str:
    return f"{MESSAGE_CONTEXT_PREFIX}{message_id}]] {public_context}"


def decode_error_context(context: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    if not context:
        return None, context
    match = _MESSAGE_CONTEXT_RE.match(context)
    if not match:
        return None, context
    return int(match.group(1)), match.group(2) or None


def public_error_context(context: Optional[str]) -> Optional[str]:
    return decode_error_context(context)[1]


def _session_lock(session_id: int) -> threading.Lock:
    with _locks_guard:
        return _session_locks.setdefault(session_id, threading.Lock())


def analyze_pending_messages(session_id: int, user_id: UUID, force: bool = False) -> int:
    """Analyse pending learner messages in atomic batches of at most three."""
    analysed = 0
    with _session_lock(session_id):
        while True:
            db = SessionLocal()
            try:
                session = db.query(models.ConversationSession).filter(
                    models.ConversationSession.id == session_id,
                    models.ConversationSession.user_id == user_id,
                ).with_for_update().first()
                if not session:
                    return analysed
                pending = db.query(models.Message).filter(
                    models.Message.session_id == session_id,
                    models.Message.role == "user",
                    models.Message.corrected_content.is_(None),
                ).order_by(models.Message.timestamp.asc(), models.Message.id.asc()).limit(3).all()
                if not pending or (len(pending) < 3 and not force):
                    return analysed

                user = db.query(models.User).filter(models.User.id == user_id).first()
                payload = [
                    {"message_id": message.id, "content": message.content}
                    for message in pending
                ]
                results = analyze_message_batch(payload, user.level if user else "C1")
                results_by_id = {item["message_id"]: item for item in results}
                if len(results_by_id) != len(pending):
                    raise ValueError("Analysis did not return every learner message")

                for message in pending:
                    result = results_by_id[message.id]
                    message.corrected_content = result["corrected_user_message"] or message.content
                    message.has_errors = bool(result["has_errors"])
                    for correction in result["corrections"]:
                        db.add(models.ErrorRecord(
                            user_id=user_id,
                            session_id=session_id,
                            category=correction.get("category", "other"),
                            subcategory=correction.get("subcategory"),
                            severity=correction.get("severity", "medium"),
                            original_text=correction.get("original", ""),
                            corrected_text=correction.get("corrected", ""),
                            explanation=correction.get("explanation", ""),
                            context=encode_error_context(message.id, message.content),
                        ))
                db.flush()
                session.error_count = db.query(func.count(models.ErrorRecord.id)).filter(
                    models.ErrorRecord.session_id == session_id,
                ).scalar() or 0
                db.commit()
                analysed += len(pending)
            except Exception:
                db.rollback()
                logger.exception("discussion.analysis_failed session_id=%s", session_id)
                raise
            finally:
                db.close()


def finalize_session_review(session_id: int, user_id: UUID) -> None:
    """Flush hidden analysis and generate the persisted session assessment."""
    try:
        analyze_pending_messages(session_id, user_id, force=True)
        db = SessionLocal()
        try:
            session = db.query(models.ConversationSession).filter(
                models.ConversationSession.id == session_id,
                models.ConversationSession.user_id == user_id,
            ).first()
            if not session or session.summary is not None:
                return
            messages = db.query(models.Message).filter(
                models.Message.session_id == session_id,
            ).order_by(models.Message.timestamp.asc(), models.Message.id.asc()).all()
            errors = db.query(models.ErrorRecord).filter(
                models.ErrorRecord.session_id == session_id,
            ).order_by(models.ErrorRecord.created_at.asc(), models.ErrorRecord.id.asc()).all()
            user = db.query(models.User).filter(models.User.id == user_id).first()
            learner_messages = [
                {"role": message.role, "content": message.content}
                for message in messages if message.role == "user"
            ]
            assessment = generate_session_summary(
                messages=learner_messages,
                errors=[{
                    "category": error.category,
                    "original": error.original_text,
                    "corrected": error.corrected_text,
                    "severity": error.severity,
                } for error in errors],
                topic=session.topic,
                level=user.level if user else "C1",
            )
            score = calculate_accuracy_score(
                user_texts=[message["content"] for message in learner_messages],
                errors=[{"severity": error.severity} for error in errors],
            )["score"]
            session.summary = assessment.get("summary") or "Session review complete."
            session.estimated_level = assessment.get("estimated_level")
            session.score = score
            session.accuracy_score = score
            session.error_count = len(errors)
            session.message_count = len(messages)
            if session.ended_at is None:
                session.ended_at = datetime.now(timezone.utc)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    except Exception:
        logger.exception("discussion.review_failed session_id=%s", session_id)
