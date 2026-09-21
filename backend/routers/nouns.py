from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import NounLexicon

router = APIRouter(prefix="/nouns", tags=["nouns"], dependencies=[Depends(get_current_user)])


class NounResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    singular: str
    article: str
    plural: str | None


@router.get("/lookup", response_model=list[NounResult])
def lookup_noun(
    word: str = Query(min_length=1, max_length=200),
    db: Session = Depends(get_db),
):
    normalized = word.strip().casefold()
    if not normalized:
        raise HTTPException(status_code=422, detail="Enter a noun to look up.")
    return (
        db.query(NounLexicon)
        .filter(NounLexicon.singular_normalized == normalized)
        .order_by(NounLexicon.article, NounLexicon.singular)
        .all()
    )
