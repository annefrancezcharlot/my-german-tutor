"""Reuse category names within a learner's saved conversations."""
import json
from pathlib import Path

import models


def category_key(value: str) -> str:
    return " ".join(value.split()).casefold()


def category_names(db, user_id, exclude_session_id=None):
    path = Path(__file__).resolve().parents[1] / "content" / "session_topics.json"
    names = {category_key("Free discussions"): "Free discussions"}
    for topic in json.loads(path.read_text(encoding="utf-8")):
        name = " ".join(topic["category"].split())
        names.setdefault(category_key(name), name)
    query = db.query(models.ConversationSession).filter(
        models.ConversationSession.user_id == user_id,
        models.ConversationSession.ended_at.isnot(None),
        models.ConversationSession.message_count > 0,
    )
    if exclude_session_id is not None:
        query = query.filter(models.ConversationSession.id != exclude_session_id)
    for session in query.order_by(models.ConversationSession.id.asc()).all():
        name = " ".join((session.topic_category or "Free discussions").split())
        if name:
            names.setdefault(category_key(name), name)
    return names


def resolve_category(db, user_id, value, exclude_session_id=None):
    name = " ".join((value or "Free discussions").split()) or "Free discussions"
    return category_names(db, user_id, exclude_session_id).get(category_key(name), name)
