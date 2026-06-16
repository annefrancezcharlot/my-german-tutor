from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import models
import schemas
from auth import CurrentUser, get_current_user
from database import get_db
from services.claude_service import generate_teacher_rule
from rate_limits import HOUR, TEACHER_ASK_PER_HOUR, require_user_rate_limit

router = APIRouter(prefix="/teacher", tags=["teacher"])


@router.post("/ask", response_model=schemas.TeacherRuleResponse)
def ask_teacher(
    request: schemas.TeacherQuestionRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    require_user_rate_limit(current_user, "teacher:ask", TEACHER_ASK_PER_HOUR, HOUR)

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    rule_data = generate_teacher_rule(
        question=request.question,
        level=user.level,
    )

    rule = models.TeacherRule(
        user_id=user.id,
        question=request.question.strip(),
        category=rule_data["category"],
        title=rule_data["title"],
        short_answer=rule_data["short_answer"],
        explanation=rule_data["explanation"],
        examples=rule_data["examples"],
        related_terms=rule_data["related_terms"],
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/rules/me", response_model=List[schemas.TeacherRuleResponse])
def get_teacher_rules(
    category: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(models.TeacherRule).filter(models.TeacherRule.user_id == current_user.id)
    if category:
        q = q.filter(models.TeacherRule.category == category)
    return q.order_by(models.TeacherRule.created_at.desc()).limit(limit).all()
