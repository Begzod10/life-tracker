"""One-shot importer for the Task 2 (Quizlet) dictionary PDF.

Creates an 'IELTS' folder + 'Task 2' module for the user (idempotent — re-runs
just skip existing words by case-insensitive match against the module).

Run from the backend dir with the venv active:
    ./venv/bin/python scripts/import_task2_dictionary.py
"""
from __future__ import annotations

from typing import List, Tuple

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app import models
from sqlalchemy import func


PERSON_ID = 2  # Begzod
FOLDER_NAME = "IELTS"
MODULE_NAME = "Task 2"
DIFFICULTY = "B2"

# (headword, synonyms-or-definition) pairs straight from the PDF.
# For rows 23-26 the original PDF flips the columns (synonym chain on the
# left, category label on the right); I rewrote those so the *concept* is
# the headword and the synonym list is the definition, which matches the
# pattern of the other 80+ rows.
ENTRIES: List[Tuple[str, str]] = [
    ("people", "individuals, some argue"),
    ("believe/think", "claim, argue, assert"),
    ("technology", "technological advances, modern devices"),
    ("complicated", "complex, difficult"),
    ("easier", "simpler, more convenient"),
    ("governments", "authorities, the state, policymakers, officials"),
    ("spend money", "invest, allocate funds, provide funding"),
    ("public transport", "public transit, mass transportation, public commuting systems"),
    ("others believe", "some argue, certain people claim, a number of individuals assert"),
    ("investment", "funding, financial resources, spending"),
    ("building", "constructing, developing, creating"),
    ("roads", "highways, infrastructure, street networks"),
    ("private vehicles", "personal cars, privately owned automobiles, individual transportation"),
    ("Many people believe", "A large number of individuals think / argue / claim / consider / suggest"),
    ("social media", "online platforms / digital networks / social networking sites"),
    ("negative impact", "harmful effects / detrimental influence / adverse consequences / damaging outcomes"),
    ("society", "the community / the public / modern life / people in general"),
    ("While this may be true", "acknowledges the negative view from sentence 1"),
    ("to some extent", "shows balanced opinion"),
    ("a problem", "a serious concern, a major issue"),
    ("widespread belief", "many people think this"),
    ("ongoing argument", "to start introduction with 'there is'"),
    ("Academic opinion phrases", "there is a widespread belief that..., it is widely argued that..., it is undeniable that..."),
    ("Positive effects (social media)", "connect people globally, raise awareness, share information rapidly, facilitate communication, enhance productivity, benefit society"),
    ("Negative effects (social media)", "harmful effects, damaging outcomes, negative impact, detrimental influence, cyberbullying, misinformation, privacy concerns, screen time addiction, constant distraction, information overload"),
    ("General social media words", "online platforms, social networks, digital communities, virtual world, user-generated content, algorithm, viral content"),
    ("hard working", "diligence / dedication / industriousness / strong work ethic"),
    ("determination", "persistence / perseverance / resilience / strong willpower"),
    ("key factors", "crucial elements / main contributors / essential aspects / primary reasons"),
    ("being successful", "achieving success / accomplishing goals / reaching one's potential / thriving in life"),
    ("other people feel", "others argue / some individuals claim / another group believes"),
    ("other factors", "additional elements / alternative aspects / other contributors / different circumstances"),
    ("taxing", "use to the limit; exhaust"),
    ("diligent", "hardworking and careful"),
    ("persistent", "never giving up despite difficulties"),
    ("resilient", "able to recover from setbacks"),
    ("determined", "having strong will to succeed"),
    ("are considered", "people generally think"),
    ("are regarded as", "are seen/viewed as"),
    ("it is widely believed", "most people think"),
    ("it is argued that", "some people claim"),
    ("affordable", "not expensive"),
    ("destinations", "places you travel to"),
    ("public commuting systems", "buses, trains, metro"),
    ("maintenance", "keeping something in good condition"),
    ("time restrictions", "limits on when you can travel"),
    ("operate", "to use/drive a vehicle"),
    ("urgent situations", "emergency moments"),
    ("this demonstrates that", "showing your example proves your point"),
    ("particularly", "especially"),
    ("arduous", "hard to do, requiring much effort"),
    ("right at our fingertips", "something is very easily accessible or immediately available (e.g. 'With smartphones, information is right at our fingertips.')"),
    ("burden", "a hardship; something difficult to bear"),
    ("internship", "temporary work experience at a company"),
    ("employability", "how easy it is to get a job"),
    ("critical thinking", "ability to analyze and evaluate ideas"),
    ("research skills", "ability to find and use information"),
    ("practical experience", "real hands-on experience"),
    ("career prospects", "future job opportunities"),
    ("scholarship", "financial support for studying"),
    ("vocation", "a job you feel strongly called to do"),
    ("equip", "to provide necessary skills/tools"),
    ("pursue", "to follow/chase a goal"),
    ("collaborate", "to work together with others"),
    ("skilled", "having ability/expertise"),
    ("qualified", "having necessary certificates"),
    ("knowledgeable", "knowing a lot about something"),
    ("versatile", "able to do many different things"),
    ("well-rounded", "having broad skills and knowledge"),
    ("develop critical thinking skills", "improve ability to analyze"),
    ("enhance employability", "improve chances of getting a job"),
    ("acquire practical experience", "gain real world experience"),
    ("prepare students for the workforce", "get students ready for work"),
    ("broaden intellectual horizons", "expand knowledge and thinking"),
    ("gain work experience", "get experience from working"),
    ("pursue career opportunities", "follow job possibilities"),
    ("equip graduates with essential skills", "provide necessary abilities"),
    ("foster independent thinking", "encourage thinking for yourself"),
    ("bridge the gap between theory and practice", "connect ideas with real world"),
    ("universities", "higher education institutions / academic institutions / colleges"),
    ("academic knowledge", "theoretical knowledge / scholarly learning / intellectual development"),
    ("prepare students", "equip students / train students / ready students"),
    ("employment", "the job market / the workforce / career opportunities / professional life"),
    ("focus on", "prioritize / concentrate on / emphasize"),
    ("students", "undergraduates / learners / graduates"),
    ("skills", "competencies / abilities / capabilities"),
    ("knowledge", "understanding / expertise / learning"),
]


def main() -> None:
    assert len(ENTRIES) == 87, f"expected 87 entries, got {len(ENTRIES)}"
    db = SessionLocal()
    try:
        # ── Folder ──────────────────────────────────────────────────────────
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
            print(f"[=] Folder '{FOLDER_NAME}' already exists (#{folder.id})")

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
            print(f"[=] Module '{MODULE_NAME}' already exists (#{module.id})")

        # ── Words ───────────────────────────────────────────────────────────
        # Dedupe by case-insensitive word against this module so re-running
        # the script doesn't pile up duplicates.
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
                tags="source:quizlet|task2",
            ))
            added += 1

        db.commit()
        print(f"\n[✓] Done: {added} added, {skipped} skipped (already present).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
