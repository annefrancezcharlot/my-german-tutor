from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import models
import schemas
from auth import CurrentUser, get_current_user
from database import get_db
from services.scoring import count_words

router = APIRouter(prefix="/errors", tags=["errors"])


@router.get("/me", response_model=List[schemas.ErrorRecordResponse])
def get_user_errors(
    category: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = (
        db.query(models.ErrorRecord)
        .join(models.ConversationSession, models.ErrorRecord.session_id == models.ConversationSession.id)
        .filter(
            models.ErrorRecord.user_id == current_user.id,
            models.ConversationSession.ended_at.isnot(None),
        )
    )
    if category:
        q = q.filter(models.ErrorRecord.category == category)
    return q.order_by(models.ErrorRecord.created_at.desc()).limit(limit).all()


@router.get("/me/stats", response_model=List[schemas.ErrorStats])
def get_error_stats(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    results = (
        db.query(
            models.ErrorRecord.category,
            func.count(models.ErrorRecord.id).label("cnt"),
        )
        .join(models.ConversationSession, models.ErrorRecord.session_id == models.ConversationSession.id)
        .filter(models.ErrorRecord.user_id == current_user.id)
        .filter(models.ConversationSession.ended_at.isnot(None))
        .group_by(models.ErrorRecord.category)
        .order_by(func.count(models.ErrorRecord.id).desc())
        .all()
    )

    total = sum(r.cnt for r in results)
    stats = []
    for r in results:
        # Subcategory breakdown
        subs = (
            db.query(
                models.ErrorRecord.subcategory,
                func.count(models.ErrorRecord.id).label("sub_cnt"),
            )
            .join(models.ConversationSession, models.ErrorRecord.session_id == models.ConversationSession.id)
            .filter(
                models.ErrorRecord.user_id == current_user.id,
                models.ErrorRecord.category == r.category,
                models.ErrorRecord.subcategory.isnot(None),
                models.ConversationSession.ended_at.isnot(None),
            )
            .group_by(models.ErrorRecord.subcategory)
            .all()
        )
        stats.append(
            schemas.ErrorStats(
                category=r.category,
                count=r.cnt,
                percentage=round(r.cnt / total * 100, 1) if total else 0,
                subcategories={s.subcategory: s.sub_cnt for s in subs},
            )
        )
    return stats


@router.get("/me/timeline")
def get_error_timeline(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Error counts grouped by session for progress chart."""
    sessions = (
        db.query(models.ConversationSession)
        .filter(
            models.ConversationSession.user_id == current_user.id,
            models.ConversationSession.ended_at.isnot(None),
        )
        .order_by(models.ConversationSession.started_at.asc())
        .all()
    )
    timeline = []
    for s in sessions:
        error_count = (
            db.query(func.count(models.ErrorRecord.id))
            .filter(models.ErrorRecord.session_id == s.id)
            .scalar()
        )
        timeline.append({
            "session_id": s.id,
            "topic": s.topic,
            "date": s.started_at,
            "error_count": error_count,
            "score": s.score,
            "message_count": s.message_count or 0,
            "learner_word_count": sum(
                count_words(m.content)
                for m in s.messages
                if m.role == "user"
            ),
        })
    return timeline


@router.get("/me/exercise-timeline")
def get_exercise_timeline(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    attempts = (
        db.query(models.ExerciseAttempt, models.Exercise)
        .join(models.Exercise, models.ExerciseAttempt.exercise_id == models.Exercise.id)
        .filter(models.Exercise.user_id == current_user.id)
        .order_by(models.ExerciseAttempt.created_at.asc())
        .all()
    )

    return [
        {
            "attempt_id": attempt.id,
            "exercise_id": exercise.id,
            "date": attempt.created_at,
            "category": exercise.error_category,
            "exercise_type": exercise.exercise_type,
            "title": exercise.title,
            "score": attempt.score,
            "attempt_number": attempt.attempt_number,
        }
        for attempt, exercise in attempts
    ]


@router.get("/me/activity-timeline")
def get_activity_timeline(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    conversations = (
        db.query(
            func.date(models.ConversationSession.ended_at).label("day"),
            func.count(models.ConversationSession.id).label("count"),
        )
        .filter(
            models.ConversationSession.user_id == current_user.id,
            models.ConversationSession.ended_at.isnot(None),
        )
        .group_by(func.date(models.ConversationSession.ended_at))
        .all()
    )
    exercises = (
        db.query(
            func.date(models.ExerciseAttempt.created_at).label("day"),
            func.count(models.ExerciseAttempt.id).label("count"),
        )
        .join(models.Exercise, models.ExerciseAttempt.exercise_id == models.Exercise.id)
        .filter(models.Exercise.user_id == current_user.id)
        .group_by(func.date(models.ExerciseAttempt.created_at))
        .all()
    )
    flashcard_sets = (
        db.query(
            func.date(models.FlashcardReviewEvent.reviewed_at).label("day"),
            func.count(func.distinct(models.FlashcardReviewEvent.set_id)).label("count"),
        )
        .filter(models.FlashcardReviewEvent.user_id == current_user.id)
        .group_by(func.date(models.FlashcardReviewEvent.reviewed_at))
        .all()
    )

    by_day = {}
    for row in conversations:
        by_day.setdefault(row.day, {"date": row.day, "conversations": 0, "exercises": 0, "flashcard_sets": 0})
        by_day[row.day]["conversations"] = row.count
    for row in exercises:
        by_day.setdefault(row.day, {"date": row.day, "conversations": 0, "exercises": 0, "flashcard_sets": 0})
        by_day[row.day]["exercises"] = row.count
    for row in flashcard_sets:
        by_day.setdefault(row.day, {"date": row.day, "conversations": 0, "exercises": 0, "flashcard_sets": 0})
        by_day[row.day]["flashcard_sets"] = row.count

    return [by_day[day] for day in sorted(by_day)]
