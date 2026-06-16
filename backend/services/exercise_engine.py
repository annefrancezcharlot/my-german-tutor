import logging
import random
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func

import models
from services.claude_service import classify_exercise_topic, generate_exercise

logger = logging.getLogger(__name__)

EXERCISE_TYPES = ["fill_blank", "correction", "multiple_choice", "translation", "vocabulary_cloze"]
VOCABULARY_CLOZE_LIBRARY_PATH = (
    Path(__file__).resolve().parents[1] / "content" / "vocabulary_cloze_texts.json"
)

# Map error categories to most effective exercise types
CATEGORY_EXERCISE_MAP: Dict[str, List[str]] = {
    "grammar":           ["correction", "fill_blank", "multiple_choice"],
    "vocabulary":        ["vocabulary_cloze"],
    "word_order":        ["correction", "fill_blank"],
    "case":              ["fill_blank", "multiple_choice", "correction"],
    "gender":            ["gender_choice"],
    "verb_conjugation":  ["fill_blank", "correction", "multiple_choice"],
    "preposition":       ["fill_blank", "multiple_choice"],
    "tense":             ["fill_blank", "correction", "translation"],
    "spelling":          ["correction", "fill_blank"],
    "punctuation":       ["correction"],
    "style":             ["translation", "correction"],
    "other":             ["correction", "fill_blank"],
}

LLM_EXERCISE_TYPES = {"fill_blank", "correction", "multiple_choice", "translation"}


def load_vocabulary_cloze_library() -> Dict[str, Any]:
    with VOCABULARY_CLOZE_LIBRARY_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def create_vocabulary_cloze_exercise(
    db: Session,
    user_id: UUID,
    user_level: str,
) -> Optional[models.Exercise]:
    library = load_vocabulary_cloze_library()
    items = library.get("items", [])
    if not items:
        return None

    pending_vocabulary_exercises = (
        db.query(models.Exercise)
        .filter(
            models.Exercise.user_id == user_id,
            models.Exercise.exercise_type == "vocabulary_cloze",
            ~models.Exercise.attempts.any(),
        )
        .all()
    )
    existing_item_ids = {
        exercise.content.get("id")
        for exercise in pending_vocabulary_exercises
        if isinstance(exercise.content, dict) and exercise.content.get("id")
    }

    eligible = [item for item in items if item.get("level") in (None, user_level)]
    pool = [
        item for item in eligible
        if item.get("id") not in existing_item_ids
    ]

    # If the level-filtered pool is empty, try any remaining unseen item.
    if not pool:
        pool = [
            item for item in items
            if item.get("id") not in existing_item_ids
        ]

    if not pool:
        return None

    selected = random.choice(pool)

    answer_key = {
        str(gap["id"]): gap["answer"]
        for gap in selected.get("gaps", [])
    }
    content = {
        "id": selected["id"],
        "topic_id": selected["topic_id"],
        "topic_label": selected["topic_label"],
        "source_text": selected["source_text"],
        "word_bank": selected["word_bank"],
        "gaps": selected["gaps"],
        "preparation_use": selected.get("preparation_use", True),
        "standalone_use": selected.get("standalone_use", True),
    }

    exercise = models.Exercise(
        user_id=user_id,
        error_category="vocabulary",
        exercise_type="vocabulary_cloze",
        title=selected["title"],
        instructions=selected["instructions"],
        content=content,
        answer_key=answer_key,
        difficulty=selected.get("level", user_level),
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


def extract_noun_candidates(text: str) -> List[str]:
    candidates = re.findall(r"\b[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]{2,}\b", text or "")
    ignored = {
        "Ich",
        "Du",
        "Er",
        "Sie",
        "Es",
        "Wir",
        "Ihr",
        "Deutsch",
        "German",
    }
    return [candidate for candidate in candidates if candidate not in ignored]


def normalize_noun(value: str) -> str:
    return value.strip().casefold()


def plural_matches(plural: Optional[str], normalized: str) -> bool:
    if not plural:
        return False
    return any(
        normalize_noun(candidate) == normalized
        for candidate in plural.split(",")
    )


def has_pending_gender_choice_exercise(
    db: Session,
    user_id: UUID,
) -> bool:
    return (
        db.query(models.Exercise)
        .filter(
            models.Exercise.user_id == user_id,
            models.Exercise.error_category == "gender",
            models.Exercise.exercise_type == "multiple_choice",
            ~models.Exercise.attempts.any(),
        )
        .first()
        is not None
    )


def create_gender_choice_exercise(
    db: Session,
    user_id: UUID,
    user_level: str,
) -> Optional[models.Exercise]:
    if has_pending_gender_choice_exercise(db, user_id):
        return None

    records = (
        db.query(models.ErrorRecord)
        .filter(
            models.ErrorRecord.user_id == user_id,
            models.ErrorRecord.category.in_(["gender", "case"]),
        )
        .order_by(models.ErrorRecord.created_at.desc())
        .limit(100)
        .all()
    )

    seen: set[str] = set()
    candidates: List[Dict[str, Any]] = []

    for record in records:
        for noun in extract_noun_candidates(record.corrected_text or ""):
            normalized = normalize_noun(noun)
            if normalized in seen:
                continue

            singular_matches = (
                db.query(models.NounLexicon)
                .filter(models.NounLexicon.singular_normalized == normalized)
                .order_by(models.NounLexicon.gender.asc())
                .all()
            )
            matches = singular_matches
            if not matches:
                candidates_by_plural = (
                    db.query(models.NounLexicon)
                    .filter(models.NounLexicon.plural.isnot(None))
                    .order_by(models.NounLexicon.gender.asc())
                    .all()
                )
                matches = [
                    candidate
                    for candidate in candidates_by_plural
                    if plural_matches(candidate.plural, normalized)
                ]
            if not matches:
                continue

            articles = sorted({match.article for match in matches})
            plurals = sorted({match.plural for match in matches if match.plural})
            seen.add(normalized)
            candidates.append({
                "noun": matches[0].singular,
                "plural": ", ".join(plurals) if plurals else None,
                "articles": articles,
            })

    if not candidates:
        return None

    random.shuffle(candidates)
    selected = candidates[:10]

    items: List[Dict[str, Any]] = []
    answer_key: Dict[str, List[str]] = {}
    for index, candidate in enumerate(selected, start=1):
        items.append({
            "id": index,
            "noun": candidate["noun"],
            "plural": candidate["plural"],
        })
        answer_key[str(index)] = candidate["articles"]

    exercise = models.Exercise(
        user_id=user_id,
        error_category="gender",
        exercise_type="multiple_choice",
        title="Noun genders from your mistakes",
        instructions="Choose the correct article for each noun.",
        content={"items": items},
        answer_key=answer_key,
        difficulty=user_level,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


def get_weak_categories(
    db: Session,
    user_id: UUID,
    limit: int = 3,
) -> List[Dict[str, Any]]:
    """Return the user's most frequent error categories."""
    results = (
        db.query(
            models.ErrorRecord.category,
            func.count(models.ErrorRecord.id).label("total"),
        )
        .filter(models.ErrorRecord.user_id == user_id)
        .group_by(models.ErrorRecord.category)
        .order_by(func.count(models.ErrorRecord.id).desc())
        .limit(limit)
        .all()
    )
    return [{"category": r.category, "count": r.total} for r in results]


def get_subcategories(
    db: Session,
    user_id: UUID,
    category: str,
    limit: int = 3,
) -> List[str]:
    results = (
        db.query(models.ErrorRecord.subcategory)
        .filter(
            models.ErrorRecord.user_id == user_id,
            models.ErrorRecord.category == category,
            models.ErrorRecord.subcategory.isnot(None),
        )
        .group_by(models.ErrorRecord.subcategory)
        .order_by(func.count(models.ErrorRecord.id).desc())
        .limit(limit)
        .all()
    )
    return [r.subcategory for r in results]


def get_example_errors(
    db: Session,
    user_id: UUID,
    category: str,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    records = (
        db.query(models.ErrorRecord)
        .filter(
            models.ErrorRecord.user_id == user_id,
            models.ErrorRecord.category == category,
        )
        .order_by(models.ErrorRecord.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "original": r.original_text,
            "corrected": r.corrected_text,
            "explanation": r.explanation,
            "subcategory": r.subcategory,
        }
        for r in records
    ]


def create_exercises_for_user(
    db: Session,
    user_id: UUID,
    user_level: str,
    focus_categories: Optional[List[str]] = None,
    exercise_topic: Optional[str] = None,
    count: int = 3,
) -> List[models.Exercise]:
    """Generate `count` exercises targeting the user's weak points."""

    topic_focus = exercise_topic.strip() if exercise_topic else None
    topic_subcategory: Optional[str] = None

    if focus_categories:
        categories = [{"category": c, "count": 0} for c in focus_categories]
    elif topic_focus:
        try:
            topic_classification = classify_exercise_topic(topic_focus)
            categories = [{"category": topic_classification["category"], "count": 0}]
            topic_subcategory = topic_classification.get("subcategory")
        except Exception as e:
            logger.warning(
                "exercise.topic_classification_failed user_id=%s topic_chars=%s error_type=%s",
                user_id,
                len(topic_focus),
                type(e).__name__,
            )
            categories = [{"category": "grammar", "count": 0}]
    else:
        categories = get_weak_categories(db, user_id, limit=count)

    if not categories:
        # No error data yet → general review exercises
        categories = [{"category": "grammar", "count": 0},
                      {"category": "case", "count": 0}]

    created: List[models.Exercise] = []
    gender_choice_created_or_pending = has_pending_gender_choice_exercise(db, user_id)

    for i in range(count):
        cat_info = categories[i % len(categories)]
        category = cat_info["category"]

        subcategories = (
            [topic_subcategory]
            if topic_subcategory and not focus_categories
            else get_subcategories(db, user_id, category)
        )
        example_errors = get_example_errors(db, user_id, category)

        exercise_types = CATEGORY_EXERCISE_MAP.get(category, EXERCISE_TYPES)
        if topic_focus:
            exercise_types = [
                item for item in exercise_types
                if item in LLM_EXERCISE_TYPES
            ] or ["fill_blank", "correction", "multiple_choice"]
        exercise_type = random.choice(exercise_types)

        if exercise_type == "vocabulary_cloze":
            vocab_exercise = create_vocabulary_cloze_exercise(
                db=db,
                user_id=user_id,
                user_level=user_level,
            )
            if vocab_exercise is not None:
                created.append(vocab_exercise)
            continue

        if exercise_type == "gender_choice":
            if gender_choice_created_or_pending:
                continue

            gender_exercise = create_gender_choice_exercise(
                db=db,
                user_id=user_id,
                user_level=user_level,
            )
            if gender_exercise is not None:
                created.append(gender_exercise)
                gender_choice_created_or_pending = True
            continue

        try:
            exercise_data = generate_exercise(
                error_category=category,
                subcategories=subcategories,
                exercise_type=exercise_type,
                difficulty=user_level,
                example_errors=example_errors,
                exercise_topic=topic_focus,
            )
        except Exception as e:
            logger.warning(
                "exercise.generation_failed user_id=%s category=%s exercise_type=%s error_type=%s",
                user_id,
                category,
                exercise_type,
                type(e).__name__,
            )
            continue

        db_exercise = models.Exercise(
            user_id=user_id,
            error_category=category,
            exercise_type=exercise_type,
            title=exercise_data.get("title", f"{category.title()} Exercise"),
            instructions=exercise_data.get("instructions", ""),
            content=exercise_data.get("content", {}),
            answer_key=exercise_data.get("answer_key", {}),
            difficulty=user_level,
        )
        db.add(db_exercise)
        db.commit()
        db.refresh(db_exercise)
        created.append(db_exercise)

    return created


def score_exercise(
    exercise: models.Exercise,
    user_answers: Any,
) -> Dict[str, Any]:
    """Score user's answers against the answer key."""
    answer_key = exercise.answer_key
    exercise_type = exercise.exercise_type
    feedback: List[str] = []
    item_results: List[Dict[str, Any]] = []
    correct = 0
    total = 0

    def normalize(text: str) -> str:
        return str(text).strip().lower()

    def normalize_sentence(text: str) -> str:
        normalized = normalize(text)
        normalized = normalized.replace("’", "'").replace("`", "'").replace("„", '"').replace("“", '"')
        normalized = re.sub(r"\s+", " ", normalized)
        normalized = re.sub(r"\s+([,.;:!?])", r"\1", normalized)
        return normalized

    def normalize_without_terminal_punctuation(text: str) -> str:
        return re.sub(r"[.!?]+$", "", normalize_sentence(text)).strip()

    def correction_sentence_only(text: Any) -> str:
        sentence = str(text).strip()
        sentence = re.split(r"\s*(?:\|\||\||—|–)\s*", sentence, maxsplit=1)[0].strip()
        sentence = re.sub(r"\s+\[[^\]]+\]\s*$", "", sentence).strip()

        # Some generated keys use "Correct sentence. - Explanation...".
        dash_explanation = re.search(r"(?<=[.!?])\s+-\s+", sentence)
        if dash_explanation:
            sentence = sentence[:dash_explanation.start()].strip()

        return sentence

    def vocabulary_answer_variants(item_id: str, correct_ans: Any) -> set[str]:
        if isinstance(correct_ans, list):
            variants = {normalize(value) for value in correct_ans}
        else:
            variants = {normalize(correct_ans)}
        content = exercise.content if isinstance(exercise.content, dict) else {}
        gaps = content.get("gaps", [])
        gap = next(
            (
                item for item in gaps
                if isinstance(item, dict) and str(item.get("id")) == str(item_id)
            ),
            None,
        )
        if not gap:
            return variants

        for value in (gap.get("answer"), gap.get("lemma")):
            if not value:
                continue

            normalized_value = normalize(value)
            variants.add(normalized_value)
            parts = normalized_value.split()
            if parts:
                variants.add(parts[-1])

        return variants

    def add_item_result(
        item_id: Any,
        user_ans: Any,
        correct_ans: Any,
        status: str,
        message: str,
    ) -> None:
        item_results.append({
            "item_id": str(item_id),
            "user_answer": user_ans,
            "correct_answer": correct_ans,
            "status": status,
            "is_correct": status == "correct",
            "message": message,
        })

    if exercise_type in ("fill_blank", "multiple_choice", "vocabulary_cloze"):
        # answers: {"1": "user answer", "2": ...}
        for item_id, correct_ans in answer_key.items():
            total += 1
            user_ans = user_answers.get(str(item_id), "")
            correct_variants = (
                vocabulary_answer_variants(str(item_id), correct_ans)
                if exercise_type == "vocabulary_cloze"
                else {normalize(value) for value in correct_ans}
                if isinstance(correct_ans, list)
                else {normalize(correct_ans)}
            )
            is_correct = normalize(user_ans) in correct_variants
            if is_correct:
                correct += 1
                message = f"✓ Item {item_id}: Correct!"
                feedback.append(message)
                add_item_result(item_id, user_ans, correct_ans, "correct", message)
            else:
                message = (
                    f"✗ Item {item_id}: You wrote '{user_ans}'. "
                    f"Correct: '{correct_ans}'"
                )
                feedback.append(message)
                add_item_result(item_id, user_ans, correct_ans, "incorrect", message)

    elif exercise_type == "correction":
        for item_id, correct_ans in answer_key.items():
            total += 1
            user_ans = user_answers.get(str(item_id), "")
            expected_sentence = correction_sentence_only(correct_ans)
            user_normalized = normalize_sentence(user_ans)
            correct_normalized = normalize_sentence(expected_sentence)
            if (
                user_normalized == correct_normalized
                or normalize_without_terminal_punctuation(user_ans)
                == normalize_without_terminal_punctuation(expected_sentence)
            ):
                correct += 1
                message = f"✓ Item {item_id}: Correct!"
                feedback.append(message)
                add_item_result(item_id, user_ans, expected_sentence, "correct", message)
            else:
                message = f"✗ Item {item_id}: Not quite correct."
                feedback.append(message)
                add_item_result(item_id, user_ans, expected_sentence, "incorrect", message)

    elif exercise_type == "translation":
        # For translation we give full credit on close matches
        # (In production you'd use Claude to grade these)
        for item_id, correct_ans in answer_key.items():
            total += 1
            user_ans = user_answers.get(str(item_id), "")
            # Simple keyword overlap scoring
            correct_words = set(normalize(correct_ans).split())
            user_words = set(normalize(user_ans).split())
            overlap = len(correct_words & user_words) / max(len(correct_words), 1)
            if overlap >= 0.8:
                correct += 1
                message = f"✓ Item {item_id}: Great translation!"
                feedback.append(message)
                add_item_result(item_id, user_ans, correct_ans, "correct", message)
            elif overlap >= 0.5:
                correct += 0.5
                message = (
                    f"~ Item {item_id}: Partially correct. "
                    f"Model answer: '{correct_ans}'"
                )
                feedback.append(message)
                add_item_result(item_id, user_ans, correct_ans, "partial", message)
            else:
                message = (
                    f"✗ Item {item_id}: Model answer: '{correct_ans}'"
                )
                feedback.append(message)
                add_item_result(item_id, user_ans, correct_ans, "incorrect", message)

    score = (correct / total * 100) if total > 0 else 0
    return {
        "score": round(score, 1),
        "feedback": feedback,
        "correct_answers": answer_key,
        "item_results": item_results,
    }
