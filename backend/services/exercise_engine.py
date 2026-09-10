import logging
import random
import json
import math
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Session
from sqlalchemy import func

import models
from services.claude_service import (
    classify_exercise_topic,
    generate_exercise,
    generate_vocabulary_cloze,
)

logger = logging.getLogger(__name__)

EXERCISE_TYPES = ["fill_blank", "correction", "multiple_choice", "vocabulary_cloze"]
VOCABULARY_CLOZE_LIBRARY_PATH = (
    Path(__file__).resolve().parents[1] / "content" / "vocabulary_cloze_texts.json"
)
SESSION_TOPICS_PATH = Path(__file__).resolve().parents[1] / "content" / "session_topics.json"

# Map error categories to most effective exercise types
CATEGORY_EXERCISE_MAP: Dict[str, List[str]] = {
    "grammar":           ["correction", "multiple_choice"],
    "vocabulary":        ["vocabulary_cloze"],
    "word_order":        ["correction"],
    "case":              ["fill_blank"],
    "gender":            ["gender_choice"],
    "verb_conjugation":  ["fill_blank"],
    "preposition":       ["multiple_choice"],
    "tense":             ["fill_blank"],
}

LLM_EXERCISE_TYPES = {"fill_blank", "correction", "multiple_choice"}
SUPPORTED_GENERAL_CATEGORIES = {
    "grammar", "word_order", "case", "gender",
    "verb_conjugation", "preposition", "tense",
}
AUTO_EXERCISE_FALLBACK_CATEGORIES = [
    "case",
    "verb_conjugation",
    "preposition",
    "word_order",
]


def _exercise_category_family(category: str) -> str:
    return "verbs_tenses" if category in {"verb_conjugation", "tense"} else category


def _distinct_category_items(
    items: List[Dict[str, Any]],
    limit: int,
) -> List[Dict[str, Any]]:
    selected: List[Dict[str, Any]] = []
    seen_families: set[str] = set()
    for item in items:
        category = item.get("category")
        if category not in SUPPORTED_GENERAL_CATEGORIES:
            continue
        family = _exercise_category_family(category)
        if family in seen_families:
            continue
        selected.append(item)
        seen_families.add(family)
        if len(selected) >= limit:
            break
    return selected


def _is_passive_contrast_focus(*values: Optional[str]) -> bool:
    focus = " ".join(value for value in values if value).casefold()
    compact_focus = re.sub(r"[\s_-]+", "", focus)
    if "zustandspassiv" in compact_focus or "vorgangspassiv" in compact_focus:
        return True
    mentions_passive = "passiv" in focus or "passive" in focus
    mentions_state = "zustand" in focus or "state" in focus
    mentions_process = "vorgang" in focus or "process" in focus or "event" in focus
    return mentions_passive and mentions_state and mentions_process


def _append_unique_text(target: List[str], value: Any) -> None:
    if not isinstance(value, str) or not value.strip():
        return
    cleaned = value.strip()
    if cleaned.casefold() not in {item.casefold() for item in target}:
        target.append(cleaned)


def get_exercise_context_topics(
    db: Session,
    user_id: UUID,
    limit: int = 8,
) -> List[str]:
    """Return varied personal and catalogue topics for exercise scenarios."""
    recent_sessions = (
        db.query(models.ConversationSession)
        .filter(models.ConversationSession.user_id == user_id)
        .order_by(models.ConversationSession.started_at.desc())
        .limit(limit * 2)
        .all()
    )
    personal_topics: List[str] = []
    for session in recent_sessions:
        _append_unique_text(personal_topics, session.topic)
    random.shuffle(personal_topics)

    catalogue_topics: List[str] = []
    try:
        with SESSION_TOPICS_PATH.open("r", encoding="utf-8") as handle:
            catalogue = json.load(handle)
        for topic in catalogue if isinstance(catalogue, list) else []:
            if not isinstance(topic, dict):
                continue
            _append_unique_text(catalogue_topics, topic.get("title"))
            for starter in topic.get("conversation_starters", []):
                if isinstance(starter, dict):
                    _append_unique_text(catalogue_topics, starter.get("title"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("exercise.context_topics_unavailable error_type=%s", type(exc).__name__)
    random.shuffle(catalogue_topics)

    contexts = personal_topics[:limit]
    for topic in catalogue_topics:
        _append_unique_text(contexts, topic)
        if len(contexts) >= limit:
            break
    return contexts


def get_recent_exercise_sentences(
    db: Session,
    user_id: UUID,
    limit: int = 15,
) -> List[str]:
    """Collect recent prompts so the generator can avoid close repetitions."""
    exercises = (
        db.query(models.Exercise)
        .filter(models.Exercise.user_id == user_id)
        .order_by(models.Exercise.created_at.desc())
        .limit(limit)
        .all()
    )
    sentences: List[str] = []
    for exercise in exercises:
        content = exercise.content if isinstance(exercise.content, dict) else {}
        for item in content.get("sentences", []):
            if isinstance(item, dict):
                _append_unique_text(sentences, item.get("text"))
        for item in content.get("questions", []):
            if isinstance(item, dict):
                _append_unique_text(sentences, item.get("question"))
        if len(sentences) >= limit:
            break
    return sentences[:limit]


def _exercise_prompt_sentences(exercise_data: Dict[str, Any]) -> List[str]:
    content = exercise_data.get("content")
    if not isinstance(content, dict):
        return []
    values: List[str] = []
    for collection, field in (("sentences", "text"), ("questions", "question")):
        for item in content.get(collection, []):
            if isinstance(item, dict):
                _append_unique_text(values, item.get(field))
    return values


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


def _swiss_text(value: Any) -> Any:
    """Ensure generated content follows Swiss Standard German spelling."""
    if isinstance(value, str):
        return value.replace("ß", "ss")
    if isinstance(value, list):
        return [_swiss_text(item) for item in value]
    if isinstance(value, dict):
        return {
            key: item if key == "card_id" else _swiss_text(item)
            for key, item in value.items()
        }
    return value


def _validate_generated_vocabulary_cloze(
    data: Dict[str, Any],
    cards: List[models.FlashcardCard],
) -> Dict[str, Any]:
    data = _swiss_text(data)
    expected_card_ids = [card.card_id for card in cards]
    gaps = data.get("gaps")
    source_text = data.get("source_text")
    word_bank = data.get("word_bank")
    errors: List[str] = []

    if not isinstance(data.get("title"), str) or not data["title"].strip():
        errors.append("title is missing")
    if not isinstance(source_text, str) or not source_text.strip():
        errors.append("source_text is missing")
        source_text = ""
    if not isinstance(gaps, list) or len(gaps) != len(cards):
        errors.append(f"expected {len(cards)} gaps")
        gaps = gaps if isinstance(gaps, list) else []
    if not isinstance(word_bank, list) or len(word_bank) != len(cards):
        errors.append(f"expected {len(cards)} word-bank entries")
        word_bank = word_bank if isinstance(word_bank, list) else []
    elif any(not isinstance(item, str) or not item.strip() for item in word_bank):
        errors.append("word-bank entries must be non-empty strings")

    actual_card_ids: List[str] = []
    answers: List[str] = []
    for index, gap in enumerate(gaps, start=1):
        if not isinstance(gap, dict):
            errors.append(f"gap {index} is not an object")
            continue
        if gap.get("id") != index:
            errors.append(f"gap {index} has the wrong id")
        if source_text.count(f"[{index}]") != 1:
            errors.append(f"marker [{index}] must occur exactly once")
        card_id = gap.get("card_id")
        if isinstance(card_id, str):
            actual_card_ids.append(card_id)
        answer = gap.get("answer")
        if not isinstance(answer, str) or not answer.strip():
            errors.append(f"gap {index} has no answer")
            continue
        answer = answer.strip()
        gap["answer"] = answer
        answers.append(answer)
        accepted = gap.get("accepted_answers")
        if not isinstance(accepted, list):
            accepted = []
        accepted = [item.strip() for item in accepted if isinstance(item, str) and item.strip()]
        if answer.casefold() not in {item.casefold() for item in accepted}:
            accepted.insert(0, answer)
        gap["accepted_answers"] = list(dict.fromkeys(accepted))

    if sorted(actual_card_ids) != sorted(expected_card_ids):
        errors.append("card ids must use every supplied flashcard exactly once")
    if [str(item).strip().casefold() for item in word_bank] != [
        answer.casefold() for answer in answers
    ]:
        errors.append("word_bank must contain the gap answers in gap order")
    marker_ids = [int(item) for item in re.findall(r"\[(\d+)\]", source_text)]
    if sorted(marker_ids) != list(range(1, len(cards) + 1)):
        errors.append("source_text contains missing, duplicate, or unknown markers")

    if errors:
        raise ValueError("; ".join(dict.fromkeys(errors)))
    return data


def create_flashcard_vocabulary_cloze_exercises(
    db: Session,
    user_id: UUID,
    flashcard_set: models.FlashcardSet,
    count: Optional[int],
) -> List[models.Exercise]:
    """Generate, validate, and persist cloze passages for one flashcard set."""
    cards = list(flashcard_set.cards)
    if count is not None and count > len(cards):
        raise ValueError(f"Requested {count} cards from a set containing {len(cards)}")
    requested_count = len(cards) if count is None else count
    selected_cards = random.sample(cards, k=min(requested_count, len(cards)))
    if not selected_cards:
        return []

    # Keep passages reasonably short without producing a tiny remainder.
    # Examples: 12 -> [12], 20 -> [10, 10], 25 -> [9, 8, 8].
    batch_count = max(1, math.ceil(len(selected_cards) / 12))
    base_batch_size, larger_batch_count = divmod(len(selected_cards), batch_count)
    batch_sizes = [
        base_batch_size + (1 if index < larger_batch_count else 0)
        for index in range(batch_count)
    ]

    created: List[models.Exercise] = []
    batch_start = 0
    for batch_size in batch_sizes:
        batch = selected_cards[batch_start:batch_start + batch_size]
        batch_start += batch_size
        card_payload = [
            {
                "id": card.card_id,
                "front": card.front,
                "back": card.back,
                "example": card.example or "",
                "case_examples": card.case_examples if isinstance(card.case_examples, dict) else {},
                "tense_examples": card.tense_examples if isinstance(card.tense_examples, dict) else {},
            }
            for card in batch
        ]
        validation_feedback: Optional[str] = None
        generated: Optional[Dict[str, Any]] = None
        for _ in range(2):
            candidate = generate_vocabulary_cloze(
                cards=card_payload,
                set_title=flashcard_set.title,
                level=flashcard_set.level,
                validation_feedback=validation_feedback,
            )
            try:
                generated = _validate_generated_vocabulary_cloze(candidate, batch)
                break
            except ValueError as exc:
                validation_feedback = str(exc)
        if generated is None:
            raise ValueError(f"Vocabulary exercise validation failed: {validation_feedback}")

        gaps = generated["gaps"]
        content = {
            "id": f"flashcard_cloze_{uuid4().hex}",
            "source_set_id": flashcard_set.id,
            "source_card_ids": [gap["card_id"] for gap in gaps],
            "topic_id": flashcard_set.topic,
            "topic_label": flashcard_set.title,
            "source_text": generated["source_text"],
            "word_bank": generated["word_bank"],
            "gaps": gaps,
            "preparation_use": False,
            "standalone_use": True,
        }
        exercise = models.Exercise(
            user_id=user_id,
            error_category="vocabulary",
            exercise_type="vocabulary_cloze",
            title=generated["title"],
            instructions="Setze das passende Wort aus der Wortliste in jede Lücke ein.",
            content=content,
            answer_key={str(gap["id"]): gap["accepted_answers"] for gap in gaps},
            difficulty=flashcard_set.level,
        )
        db.add(exercise)
        created.append(exercise)

    db.commit()
    for exercise in created:
        db.refresh(exercise)
    return created


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
    gender_choice_created_or_pending = has_pending_gender_choice_exercise(db, user_id)

    if focus_categories:
        # Vocabulary exercises are created from a selected flashcard set through
        # the dedicated cloze flow, never from the legacy prewritten library.
        categories = _distinct_category_items(
            [{"category": category, "count": 0} for category in focus_categories],
            limit=count,
        )
    elif topic_focus:
        try:
            topic_classification = classify_exercise_topic(topic_focus)
            classified_category = topic_classification["category"]
            categories = (
                [{"category": classified_category, "count": 0}]
                if classified_category in SUPPORTED_GENERAL_CATEGORIES
                else []
            )
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
        weak_categories = get_weak_categories(
            db,
            user_id,
            limit=len(SUPPORTED_GENERAL_CATEGORIES),
        )
        weak_categories = [
            item for item in weak_categories
            if not (
                item["category"] == "grammar"
                and not get_subcategories(db, user_id, "grammar")
            )
            and not (
                item["category"] == "gender"
                and gender_choice_created_or_pending
            )
        ]
        categories = _distinct_category_items(
            weak_categories,
            limit=len(SUPPORTED_GENERAL_CATEGORIES),
        )
        fallback_items = [
            {"category": category, "count": 0}
            for category in AUTO_EXERCISE_FALLBACK_CATEGORIES
        ]
        categories = _distinct_category_items(
            categories + fallback_items,
            limit=len(SUPPORTED_GENERAL_CATEGORIES),
        )

    if not categories:
        if focus_categories or topic_focus:
            return []
        # Defensive fallback; automatic selection above normally supplies these.
        categories = [{"category": "case", "count": 0}]

    created: List[models.Exercise] = []
    generation_target = min(count, len(categories))
    context_topics = get_exercise_context_topics(db, user_id, limit=max(generation_target, 8))
    recent_exercise_sentences = get_recent_exercise_sentences(db, user_id)

    for i, cat_info in enumerate(categories):
        if len(created) >= generation_target:
            break
        category = cat_info["category"]

        subcategories = (
            [topic_subcategory]
            if topic_subcategory and not focus_categories
            else get_subcategories(db, user_id, category)
        )
        example_errors = get_example_errors(db, user_id, category)

        # A broad grammar exercise is useful only when a concrete rule is known.
        if category == "grammar" and not subcategories and not topic_focus:
            continue

        exercise_variant = (
            "passive_contrast"
            if _is_passive_contrast_focus(topic_focus, *subcategories)
            else None
        )
        if exercise_variant == "passive_contrast":
            exercise_type = "multiple_choice"
        else:
            exercise_types = CATEGORY_EXERCISE_MAP.get(category, EXERCISE_TYPES)
            if topic_focus:
                exercise_types = [
                    item for item in exercise_types
                    if item in LLM_EXERCISE_TYPES
                ] or ["correction", "multiple_choice"]
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
                exercise_variant=exercise_variant,
                context_inspiration=(
                    context_topics[i % len(context_topics)] if context_topics else None
                ),
                avoid_sentences=recent_exercise_sentences,
            )
        except Exception as e:
            logger.warning(
                "exercise.generation_failed user_id=%s category=%s exercise_type=%s "
                "error_type=%s error_detail=%s",
                user_id,
                category,
                exercise_type,
                type(e).__name__,
                str(e)[:500].replace("\n", " "),
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
        for sentence in _exercise_prompt_sentences(exercise_data):
            _append_unique_text(recent_exercise_sentences, sentence)
        recent_exercise_sentences = recent_exercise_sentences[-15:]

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
                message = f"✗ Item {item_id}: Incorrect."
                feedback.append(message)
                add_item_result(item_id, user_ans, correct_ans, "incorrect", message)

    elif exercise_type == "correction":
        for item_id, correct_ans in answer_key.items():
            total += 1
            user_ans = user_answers.get(str(item_id), "")
            answer_values = correct_ans if isinstance(correct_ans, list) else [correct_ans]
            expected_sentences = [correction_sentence_only(value) for value in answer_values]
            expected_sentence = expected_sentences[0] if expected_sentences else ""
            user_normalized = normalize_sentence(user_ans)
            is_correct = any(
                user_normalized == normalize_sentence(candidate)
                or normalize_without_terminal_punctuation(user_ans)
                == normalize_without_terminal_punctuation(candidate)
                for candidate in expected_sentences
            )
            if is_correct:
                correct += 1
                message = f"✓ Item {item_id}: Correct!"
                feedback.append(message)
                add_item_result(item_id, user_ans, expected_sentence, "correct", message)
            else:
                message = f"✗ Item {item_id}: Not quite correct."
                feedback.append(message)
                add_item_result(item_id, user_ans, expected_sentence, "incorrect", message)

    score = (correct / total * 100) if total > 0 else 0
    return {
        "score": round(score, 1),
        "feedback": feedback,
        "correct_answers": answer_key,
        "item_results": item_results,
    }
