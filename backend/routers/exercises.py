from copy import deepcopy
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import CurrentUser, get_current_user
from database import get_db
from services.exercise_engine import create_exercises_for_user, score_exercise
from rate_limits import EXERCISE_GENERATE_PER_HOUR, HOUR, require_user_rate_limit

router = APIRouter(prefix="/exercises", tags=["exercises"])


def _public_exercise_content(exercise: models.Exercise) -> dict:
    content = exercise.content if isinstance(exercise.content, dict) else {}
    public_content = deepcopy(content)

    if exercise.exercise_type != "vocabulary_cloze":
        return public_content

    gaps = public_content.get("gaps") if isinstance(public_content.get("gaps"), list) else []
    word_bank = public_content.get("word_bank") if isinstance(public_content.get("word_bank"), list) else []
    word_bank_entries = []

    for index, word in enumerate(word_bank):
        gap = gaps[index] if index < len(gaps) and isinstance(gaps[index], dict) else None
        word_bank_entries.append({
            "label": word,
            "gap_id": gap.get("id") if gap else None,
        })

    for gap in gaps:
        if isinstance(gap, dict):
            gap.pop("answer", None)

    public_content["word_bank_entries"] = word_bank_entries
    return public_content


def _attempt_response(attempt: models.ExerciseAttempt) -> schemas.ExerciseAttemptResponse:
    item_results = attempt.item_results or []
    return schemas.ExerciseAttemptResponse(
        id=attempt.id,
        attempt_number=attempt.attempt_number,
        submitted_answers=attempt.submitted_answers,
        feedback=[item.get("message", "") for item in item_results if isinstance(item, dict)],
        item_results=item_results,
        score=attempt.score,
        created_at=attempt.created_at,
    )


def _exercise_response(exercise: models.Exercise) -> schemas.ExerciseResponse:
    attempts = [_attempt_response(attempt) for attempt in exercise.attempts]
    completed = len(attempts) > 0
    latest_attempt = attempts[-1] if attempts else None
    content = exercise.content if isinstance(exercise.content, dict) else {}
    is_vocabulary_cloze = exercise.exercise_type == "vocabulary_cloze"
    is_gender_choice = (
        exercise.error_category == "gender"
        and exercise.exercise_type == "multiple_choice"
        and bool(content.get("items"))
    )

    return schemas.ExerciseResponse(
        id=exercise.id,
        user_id=exercise.user_id,
        error_category=exercise.error_category,
        exercise_type=exercise.exercise_type,
        title=exercise.title,
        instructions=exercise.instructions,
        content=_public_exercise_content(exercise),
        difficulty=exercise.difficulty,
        completed=completed,
        score=latest_attempt.score if latest_attempt else None,
        correct_answers=exercise.answer_key if completed or is_gender_choice or is_vocabulary_cloze else None,
        attempts=attempts,
        created_at=exercise.created_at,
    )


@router.post("/generate", response_model=List[schemas.ExerciseResponse])
def generate_exercises(
    request: schemas.ExerciseGenerateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(
        current_user,
        "exercises:generate",
        EXERCISE_GENERATE_PER_HOUR,
        HOUR,
    )

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    exercises = create_exercises_for_user(
        db=db,
        user_id=current_user.id,
        user_level=user.level,
        focus_categories=request.focus_categories,
        exercise_topic=request.topic,
        count=request.count,
    )

    return [_exercise_response(e) for e in exercises]


@router.get("/me", response_model=List[schemas.ExerciseResponse])
def get_user_exercises(
    completed: bool = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(models.Exercise).filter(models.Exercise.user_id == current_user.id)
    if completed is not None:
        if completed:
            q = q.filter(models.Exercise.attempts.any())
        else:
            q = q.filter(~models.Exercise.attempts.any())
    return [_exercise_response(e) for e in q.order_by(models.Exercise.created_at.desc()).all()]


@router.post("/{exercise_id}/submit", response_model=schemas.ExerciseResult)
def submit_exercise(
    exercise_id: int,
    submission: schemas.ExerciseSubmit,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    exercise = db.query(models.Exercise).filter(
        models.Exercise.id == exercise_id,
        models.Exercise.user_id == current_user.id,
    ).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    result = score_exercise(exercise, submission.answers)
    attempt_number = (
        db.query(models.ExerciseAttempt)
        .filter(models.ExerciseAttempt.exercise_id == exercise.id)
        .count()
        + 1
    )
    attempt = models.ExerciseAttempt(
        user_id=exercise.user_id,
        exercise_id=exercise.id,
        attempt_number=attempt_number,
        submitted_answers=submission.answers,
        item_results=result["item_results"],
        score=result["score"],
    )
    db.add(attempt)

    db.commit()

    return schemas.ExerciseResult(
        score=result["score"],
        feedback=result["feedback"],
        correct_answers=result["correct_answers"],
        item_results=result["item_results"],
        attempt_number=attempt_number,
    )
