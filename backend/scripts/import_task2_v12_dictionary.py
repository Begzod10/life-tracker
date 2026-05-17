"""Importer for Task 2 v1.2 (Quizlet) — same shape as import_task2_dictionary.py
but lands in a new 'Task 2 v1.2' module under the existing IELTS folder.

Idempotent: re-running skips words already present (case-insensitive).

Run from the backend dir:
    PYTHONPATH=. ./venv/bin/python scripts/import_task2_v12_dictionary.py
"""
from __future__ import annotations

from typing import List, Tuple

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app import models
from sqlalchemy import func


PERSON_ID = 2
FOLDER_NAME = "IELTS"
MODULE_NAME = "Task 2 v1.2"
DIFFICULTY = "B2"

# (headword, definition/synonyms) — entry 29 was split across pages 2-3
# in the source PDF; I rejoined "Guide children through challenges"
# (headword, page 3) with its definition "to help and support children
# when they face difficult situations" (page 2). Also fixed the typo
# "theri" → "their" in entry 7 from the source PDF.
ENTRIES: List[Tuple[str, str]] = [
    ("public health", "community wellbeing / population health / societal wellness / general health of citizens"),
    ("increase", "expand / boost / develop / enhance / build more"),
    ("sports facilities", "athletic centers / recreational facilities / fitness centers / gymnasiums / sporting venues"),
    ("little effect", "minimal impact / limited influence / negligible difference / insufficient change"),
    ("other measures", "alternative approaches / different strategies / additional methods / broader solutions"),
    ("health", "wellbeing / fitness / physical condition / wellness"),
    ("promote physical activity", "guide students in analyzing their own individual fitness test results and designing an activity program to enhance their personal fitness level"),
    ("tackle obesity", "to fight obesity"),
    ("Nutrition", "the process of eating the right food for good health"),
    ("parents", "guardians / families / caregivers / mothers and fathers"),
    ("responsible for", "accountable for / in charge of / obligated to"),
    ("teaching children", "educating youngsters / guiding the younger generation / nurturing children"),
    ("behave in society", "conduct themselves in public / act appropriately / demonstrate social behavior"),
    ("schools and teachers", "educational institutions / educators / academic staff"),
    ("more influence", "greater impact / stronger effect / more significant role"),
    ("values", "principles / morals / ethics / beliefs"),
    ("upbringing", "the care and training a child gets while growing up"),
    ("nurture", "to care for"),
    ("reinforce", "to make stronger"),
    ("well-behaved", "behaving in a way that is accepted as correct"),
    ("obedient", "doing what one is asked or told"),
    ("instill good values", "to gradually teach important principles and beliefs to someone"),
    ("shape a child's character", "to influence and form who a child becomes as a person"),
    ("establish boundaries", "to set clear rules about what is acceptable and unacceptable behavior"),
    ("reinforce positive behavior", "to strengthen and encourage good behavior through praise or reward"),
    ("model appropriate conduct", "to demonstrate correct and acceptable behavior for others to copy"),
    ("build strong moral foundation", "to create a solid base of ethical values and principles"),
    ("encourage respectful behavior", "to motivate and support polite and considerate actions toward others"),
    ("guide children through challenges", "to help and support children when they face difficult situations"),
    ("bias", "a particular preference or point of view that is personal, rather than scientific"),
    ("Meritocracy", "a system in which promotion is based on individual ability or achievement"),
]


def main() -> None:
    assert len(ENTRIES) == 31, f"expected 31 entries, got {len(ENTRIES)}"
    db = SessionLocal()
    try:
        # ── Folder (reuse existing) ─────────────────────────────────────────
        folder = (
            db.query(models.DictionaryFolder)
            .filter(
                models.DictionaryFolder.person_id == PERSON_ID,
                func.lower(models.DictionaryFolder.name) == FOLDER_NAME.lower(),
            )
            .first()
        )
        if folder is None:
            folder = models.DictionaryFolder(person_id=PERSON_ID, name=FOLDER_NAME)
            db.add(folder)
            db.flush()
            print(f"[+] Created folder #{folder.id} '{FOLDER_NAME}'")
        else:
            print(f"[=] Reusing folder #{folder.id} '{FOLDER_NAME}'")

        # ── Module ──────────────────────────────────────────────────────────
        module = (
            db.query(models.DictionaryModule)
            .filter(
                models.DictionaryModule.folder_id == folder.id,
                func.lower(models.DictionaryModule.name) == MODULE_NAME.lower(),
            )
            .first()
        )
        if module is None:
            module = models.DictionaryModule(
                folder_id=folder.id,
                person_id=PERSON_ID,
                name=MODULE_NAME,
            )
            db.add(module)
            db.flush()
            print(f"[+] Created module #{module.id} '{MODULE_NAME}'")
        else:
            print(f"[=] Reusing module #{module.id} '{MODULE_NAME}'")

        # ── Words ───────────────────────────────────────────────────────────
        existing_lower = {
            (w.word or "").strip().lower()
            for w in db.query(models.DictionaryWord)
            .filter(
                models.DictionaryWord.module_id == module.id,
                models.DictionaryWord.deleted == False,
            )
            .all()
        }
        added = skipped = 0
        for word, definition in ENTRIES:
            if word.strip().lower() in existing_lower:
                skipped += 1
                continue
            db.add(models.DictionaryWord(
                person_id=PERSON_ID,
                module_id=module.id,
                word=word,
                definition=definition,
                difficulty=DIFFICULTY,
                tags="source:quizlet|task2-v1.2",
            ))
            added += 1

        db.commit()
        print(f"\n[✓] Done: {added} added, {skipped} skipped.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
