"""
Create recurring Gym blocks: Tue/Thu/Sat 08:00-10:00 for 12 weeks.
Moves any conflicting blocks (not deletes).

Run on VPS:  cd /opt/life_tracker/backend && python scripts/create_gym_blocks.py
"""
import sys
import os
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app import models

GYM_START = "08:00"
GYM_END   = "10:00"
GYM_TITLE = "Gym"
GYM_CAT   = "health"
WEEKS     = 12
GYM_DAYS  = {1, 3, 5}   # 0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Sat 6=Sun

MOVE_TIMES = [
    ("10:00", "12:00"),
    ("12:00", "14:00"),
    ("14:00", "16:00"),
    ("16:00", "18:00"),
    ("18:00", "20:00"),
    ("20:00", "22:00"),
]


def overlaps(s1: str, e1: str, s2: str, e2: str) -> bool:
    return s1 < e2 and e1 > s2


def is_slot_free(db, person_id: int, d: date, start: str, end: str, exclude_id: int | None = None) -> bool:
    q = db.query(models.TimeBlock).filter(
        models.TimeBlock.person_id == person_id,
        models.TimeBlock.date == d,
        models.TimeBlock.deleted == False,
    )
    if exclude_id:
        q = q.filter(models.TimeBlock.id != exclude_id)
    for b in q.all():
        if overlaps(b.start_time, b.end_time, start, end):
            return False
    return True


def find_free_slot(db, person_id: int, d: date, exclude_id: int) -> tuple[str, str] | None:
    for start, end in MOVE_TIMES:
        if is_slot_free(db, person_id, d, start, end, exclude_id=exclude_id):
            return start, end
    return None


def build_dates() -> list[date]:
    today = date.today()
    results = []
    for i in range(WEEKS * 7):
        d = today + timedelta(days=i)
        if d.weekday() in GYM_DAYS:
            results.append(d)
    return results


def main() -> None:
    db = SessionLocal()
    try:
        persons = db.query(models.Person).all()
        if not persons:
            print("No persons found in DB.")
            return
        if len(persons) > 1:
            print("Multiple persons found:")
            for p in persons:
                print(f"  id={p.id}  {p.name}  {p.email}")
            pid = int(input("Enter person_id to use: "))
            person = next(p for p in persons if p.id == pid)
        else:
            person = persons[0]

        print(f"\nUsing person: {person.name} (id={person.id})")
        print(f"Creating Gym blocks Tue/Thu/Sat 08:00-10:00 for {WEEKS} weeks\n")

        dates = build_dates()
        conflicts_moved = []
        blocks_created = []
        blocks_skipped = []

        for d in dates:
            # Check for existing gym block on this date
            existing_gym = db.query(models.TimeBlock).filter(
                models.TimeBlock.person_id == person.id,
                models.TimeBlock.date == d,
                models.TimeBlock.title == GYM_TITLE,
                models.TimeBlock.start_time == GYM_START,
                models.TimeBlock.deleted == False,
            ).first()
            if existing_gym:
                blocks_skipped.append(d)
                continue

            # Find conflicting blocks in the 08:00-10:00 window
            existing = db.query(models.TimeBlock).filter(
                models.TimeBlock.person_id == person.id,
                models.TimeBlock.date == d,
                models.TimeBlock.deleted == False,
            ).all()
            conflicts = [b for b in existing if overlaps(b.start_time, b.end_time, GYM_START, GYM_END)]

            for conflict in conflicts:
                slot = find_free_slot(db, person.id, d, exclude_id=conflict.id)
                if slot is None:
                    print(f"  WARNING: No free slot to move '{conflict.title}' on {d} — SKIPPING GYM for this date")
                    print("  >>> Please resolve manually and re-run.")
                    continue
                old_start, old_end = conflict.start_time, conflict.end_time
                conflict.start_time = slot[0]
                conflict.end_time   = slot[1]
                conflicts_moved.append((d, conflict.title, f"{old_start}-{old_end}", f"{slot[0]}-{slot[1]}"))

            # Create the gym block
            gym = models.TimeBlock(
                person_id=person.id,
                title=GYM_TITLE,
                date=d,
                start_time=GYM_START,
                end_time=GYM_END,
                category=GYM_CAT,
                is_recurring=True,
                is_completed=False,
                deleted=False,
            )
            db.add(gym)
            blocks_created.append(d)

        db.commit()

        print(f"Created {len(blocks_created)} Gym blocks:")
        for d in blocks_created:
            print(f"  {d} ({d.strftime('%a')})")

        if blocks_skipped:
            print(f"\nSkipped {len(blocks_skipped)} dates (Gym block already exists):")
            for d in blocks_skipped:
                print(f"  {d} ({d.strftime('%a')})")

        if conflicts_moved:
            print(f"\nMoved {len(conflicts_moved)} conflicting blocks:")
            for d, title, old, new in conflicts_moved:
                print(f"  {d} ({d.strftime('%a')})  '{title}'  {old}  →  {new}")

        print("\nDone.")

    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
