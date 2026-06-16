"""Import German noun genders from content/nouns_cleaned.csv.

Usage from the backend directory:
    .germanenv/bin/python scripts/import_noun_lexicon.py
    .germanenv/bin/python scripts/import_noun_lexicon.py --replace
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import models
from database import SessionLocal, engine
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert


CSV_PATH = BACKEND_DIR / "content" / "nouns_cleaned.csv"
ARTICLE_BY_GENDER = {
    "m": "der",
    "f": "die",
    "n": "das",
}


def normalize_noun(value: str) -> str:
    return value.strip().casefold()


def read_rows() -> list[dict[str, str]]:
    with CSV_PATH.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def ensure_noun_lexicon_schema() -> None:
    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE noun_lexicon DROP CONSTRAINT IF EXISTS uq_noun_lexicon_singular"
        ))
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'uq_noun_lexicon_singular_gender'
                ) THEN
                    ALTER TABLE noun_lexicon
                    ADD CONSTRAINT uq_noun_lexicon_singular_gender UNIQUE (singular, gender);
                END IF;
            END $$;
        """))


def import_noun_lexicon(replace: bool = False) -> tuple[int, int, int]:
    ensure_noun_lexicon_schema()
    rows = []
    seen_pairs: set[tuple[str, str]] = set()
    skipped = 0

    for row in read_rows():
        singular = (row.get("nominativ singular") or "").strip()
        gender = (row.get("genus") or "").strip().lower()
        plural = (row.get("nominativ plural") or "").strip() or None
        if not singular or gender not in ARTICLE_BY_GENDER:
            skipped += 1
            continue

        pair = (singular, gender)
        if pair in seen_pairs:
            skipped += 1
            continue

        seen_pairs.add(pair)
        rows.append({
            "singular": singular,
            "singular_normalized": normalize_noun(singular),
            "gender": gender,
            "article": ARTICLE_BY_GENDER[gender],
            "plural": plural,
        })

    if engine.dialect.name != "postgresql":
        return import_noun_lexicon_sqlalchemy(rows, skipped, replace)

    affected = 0
    chunk_size = 5000
    with engine.begin() as conn:
        for start in range(0, len(rows), chunk_size):
            chunk = rows[start:start + chunk_size]
            stmt = pg_insert(models.NounLexicon).values(chunk)
            if replace:
                stmt = stmt.on_conflict_do_update(
                    index_elements=["singular", "gender"],
                    set_={
                        "singular_normalized": stmt.excluded.singular_normalized,
                        "article": stmt.excluded.article,
                        "plural": stmt.excluded.plural,
                    },
                )
            else:
                stmt = stmt.on_conflict_do_nothing(index_elements=["singular", "gender"])

            result = conn.execute(stmt)
            affected += result.rowcount or 0

    skipped += len(rows) - affected if not replace else 0
    return affected, 0, skipped


def import_noun_lexicon_sqlalchemy(
    rows: list[dict[str, str | None]],
    skipped: int,
    replace: bool = False,
) -> tuple[int, int, int]:
    db = SessionLocal()
    imported = 0
    updated = 0

    try:
        for row in rows:
            existing = (
                db.query(models.NounLexicon)
                .filter(
                    models.NounLexicon.singular == row["singular"],
                    models.NounLexicon.gender == row["gender"],
                )
                .first()
            )
            if existing:
                if not replace:
                    skipped += 1
                    continue

                existing.singular_normalized = row["singular_normalized"]
                existing.article = row["article"]
                existing.plural = row["plural"]
                updated += 1
                continue

            db.add(models.NounLexicon(**row))
            imported += 1

        db.commit()
        return imported, updated, skipped
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--replace", action="store_true", help="Replace existing rows with CSV values.")
    args = parser.parse_args()

    imported, updated, skipped = import_noun_lexicon(replace=args.replace)
    print(f"Imported {imported} noun(s), updated {updated}, skipped {skipped}.")


if __name__ == "__main__":
    main()
