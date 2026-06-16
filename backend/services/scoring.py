import re
from typing import Any, Dict, List


WORD_PATTERN = re.compile(r"[A-Za-zÄÖÜäöüß]+(?:[-'][A-Za-zÄÖÜäöüß]+)*")

SEVERITY_WEIGHTS: Dict[str, float] = {
    "light": 0.25,
    "medium": 1.0,
    "severe": 2.0,
}

WORDS_BASELINE = 100
POINTS_PER_WEIGHTED_ERROR = 1


def count_words(text: str) -> int:
    if not text:
        return 0
    return len(WORD_PATTERN.findall(text))


def calculate_accuracy_score(
    user_texts: List[str],
    errors: List[Dict[str, Any]],
) -> Dict[str, float]:
    """
    Score only learner-written text.

    Model:
    - Count only words from learner messages.
    - Weight errors by Claude's severity classification.
    - Convert weighted errors to a density per 100 learner words.
    - Deduct 1 point for each weighted error per 100 words.
    """
    word_count = sum(count_words(text) for text in user_texts)
    weighted_errors = sum(
        SEVERITY_WEIGHTS.get(
            str(err.get("severity", "medium")).lower(),
            SEVERITY_WEIGHTS["medium"],
        )
        for err in errors
    )

    if word_count == 0:
        return {
            "score": 0.0,
            "word_count": 0.0,
            "weighted_errors": round(weighted_errors, 2),
            "error_density": 0.0,
        }

    error_density = (weighted_errors / word_count) * WORDS_BASELINE
    score = max(0.0, 100.0 - (error_density * POINTS_PER_WEIGHTED_ERROR))

    return {
        "score": round(score, 1),
        "word_count": float(word_count),
        "weighted_errors": round(weighted_errors, 2),
        "error_density": round(error_density, 2),
    }
