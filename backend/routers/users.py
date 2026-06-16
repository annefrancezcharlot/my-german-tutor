from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import models
import schemas
from auth import CurrentUser, get_current_user, get_supabase_admin_client
from database import get_db

router = APIRouter(prefix="/users", tags=["users"])
VALID_LEVELS = {"B1", "B2", "C1"}
VALID_GERMAN_VARIANTS = {"de-DE", "de-CH", "de-AT"}


@router.post("/", response_model=schemas.UserResponse)
def create_user(
    data: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    existing = db.query(models.User).filter(
        models.User.id == current_user.id
    ).first()
    if existing:
        return existing

    username_taken = db.query(models.User).filter(models.User.username == data.username).first()
    username = data.username if not username_taken else f"{data.username}-{str(current_user.id)[:8]}"
    user = models.User(id=current_user.id, username=username)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/me", response_model=schemas.UserResponse)
def update_profile(
    data: schemas.UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.level not in VALID_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level")
    if data.german_variant not in VALID_GERMAN_VARIANTS:
        raise HTTPException(status_code=400, detail="Invalid German dialect")

    user.level = data.level
    user.german_variant = data.german_variant
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=schemas.UserResponse)
def get_user(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/me/level")
def update_level(
    level: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if level not in VALID_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level")
    user.level = level
    db.commit()
    return {"message": f"Level updated to {level}"}


@router.delete("/me")
def delete_account(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        get_supabase_admin_client().auth.admin.delete_user(str(current_user.id))
    except HTTPException:
        raise
    except Exception as exc:
        message = getattr(exc, "message", None) or str(exc)
        raise HTTPException(
            status_code=500,
            detail=message or "Could not delete the authentication account.",
        )

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if user:
        db.delete(user)
        db.commit()

    return {"message": "Account deleted"}
