"""
One-off: reshape this week's timetable so Mon/Wed/Fri have a recurring
Teaching block 09:00-13:30. Any pre-existing block that overlaps that window
is pushed forward to the first free ≥same-duration slot after 13:30 on the
same day.

Idempotent: re-running on an already-aligned week is a no-op.

Usage (from backend/):
    venv/bin/python scripts/reset_teaching_week.py --person-id 1                 # dry run
    venv/bin/python scripts/reset_teaching_week.py --person-id 1 --apply         # commit

Tip: find your person_id with
    venv/bin/python -c "from app.database import SessionLocal; from app import models; \
        [print(p.id, p.name, p.email) for p in SessionLocal().query(models.Person).all()]"
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta

# Make `app.*` importable regardless of where the script is launched from.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402


TEACHING_TITLE_DEFAULT = "Teaching"
TEACHING_START = "09:00"
TEACHING_END = "13:30"
TEACHING_CATEGORY = "work"

# Latest a relocated block may start (so we never push something past midnight).
DAY_END = "23:30"

WEEKDAYS = {0: "Monday", 2: "Wednesday", 4: "Friday"}


# ─── time helpers ────────────────────────────────────────────────────────────

def to_min(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def from_min(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def tashkent_today() -> date:
    return (datetime.utcnow() + timedelta(hours=5)).date()


def find_free_slot(
    occupied: list[tuple[int, int]],
    dur: int,
    start_from: int,
    day_end_min: int,
) -> int | None:
    """First minute ≥ start_from at which a `dur`-minute span fits inside the
    day without overlapping any (start, end) in `occupied`."""
    cursor = start_from
    for s, e in sorted(occupied):
        if e <= cursor:
            continue
        if s >= cursor + dur:
            return cursor
        cursor = max(cursor, e)
    if cursor + dur <= day_end_min:
        return cursor
    return None


# ─── per-day pass ────────────────────────────────────────────────────────────

def process_day(
    db,
    person_id: int,
    target_date: date,
    title_match: str,
    teaching_title: str,
    *,
    apply_changes: bool,
) -> None:
    blocks = (
        db.query(models.TimeBlock)
        .filter(
            models.TimeBlock.person_id == person_id,
            models.TimeBlock.date == target_date,
            models.TimeBlock.deleted == False,
        )
        .order_by(models.TimeBlock.start_time)
        .all()
    )

    teaching_start_min = to_min(TEACHING_START)
    teaching_end_min = to_min(TEACHING_END)
    day_end_min = to_min(DAY_END)

    # 1) find / update / create the teaching block ───────────────────────────
    existing = next(
        (b for b in blocks if (b.title or "").lower().find(title_match) >= 0),
        None,
    )
    if existing:
        needs_update = (
            existing.start_time != TEACHING_START
            or existing.end_time != TEACHING_END
            or not existing.is_recurring
        )
        if needs_update:
            print(
                f"  UPDATE teaching block #{existing.id} "
                f"({existing.start_time}-{existing.end_time}, recurring={existing.is_recurring}) "
                f"→ {TEACHING_START}-{TEACHING_END}, recurring=True"
            )
            if apply_changes:
                existing.start_time = TEACHING_START
                existing.end_time = TEACHING_END
                existing.is_recurring = True
                existing.is_completed = False
                existing.is_missed = False
                existing.notified_at = None
                if not existing.category:
                    existing.category = TEACHING_CATEGORY
        else:
            print(f"  KEEP teaching block #{existing.id} (already correct)")
    else:
        print(
            f"  CREATE teaching block {TEACHING_START}-{TEACHING_END} "
            f"'{teaching_title}' (recurring)"
        )
        if apply_changes:
            db.add(
                models.TimeBlock(
                    person_id=person_id,
                    title=teaching_title,
                    date=target_date,
                    start_time=TEACHING_START,
                    end_time=TEACHING_END,
                    category=TEACHING_CATEGORY,
                    is_recurring=True,
                )
            )

    # 2) find conflicts (overlap with 09:00-13:30, excluding the teaching one) ─
    conflicts = []
    for b in blocks:
        if b is existing:
            continue
        s, e = to_min(b.start_time), to_min(b.end_time)
        if s < teaching_end_min and e > teaching_start_min:
            conflicts.append(b)

    if not conflicts:
        print("  no conflicts")
        return

    # 3) relocate each conflict to the first free slot ≥ 13:30 same day ──────
    # Occupied = everything we're keeping in place + the teaching block window.
    fixed = [
        b for b in blocks
        if b is not existing and b not in conflicts
    ]
    occupied = [(to_min(b.start_time), to_min(b.end_time)) for b in fixed]
    occupied.append((teaching_start_min, teaching_end_min))

    for c in conflicts:
        dur = to_min(c.end_time) - to_min(c.start_time)
        new_start = find_free_slot(
            occupied, dur, start_from=teaching_end_min, day_end_min=day_end_min,
        )
        if new_start is None:
            print(
                f"  ⚠️  NO FREE SLOT for #{c.id} '{c.title}' ({dur}m) "
                f"after {TEACHING_END} — leaving untouched"
            )
            continue
        new_end = new_start + dur
        old = f"{c.start_time}-{c.end_time}"
        print(
            f"  MOVE #{c.id} '{c.title}' ({dur}m): {old} "
            f"→ {from_min(new_start)}-{from_min(new_end)}"
        )
        if apply_changes:
            c.start_time = from_min(new_start)
            c.end_time = from_min(new_end)
            # A relocated block is no longer "missed" relative to its old slot.
            c.is_missed = False
            c.notified_at = None
        occupied.append((new_start, new_end))


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--person-id", type=int, required=True)
    p.add_argument(
        "--title", default=TEACHING_TITLE_DEFAULT,
        help="title for newly-created teaching blocks (default: %(default)s)",
    )
    p.add_argument(
        "--title-match", default="teach",
        help="lowercased substring used to recognise an existing teaching block "
             "(default: %(default)s)",
    )
    p.add_argument(
        "--apply", action="store_true",
        help="commit changes (default is dry-run)",
    )
    args = p.parse_args()

    db = SessionLocal()
    try:
        person = (
            db.query(models.Person)
            .filter(models.Person.id == args.person_id)
            .first()
        )
        if not person:
            raise SystemExit(f"person_id={args.person_id} not found")

        today = tashkent_today()
        monday = today - timedelta(days=today.weekday())
        week_end = monday + timedelta(days=6)

        mode = "APPLY" if args.apply else "DRY RUN"
        print(
            f"[{mode}] person={person.name} (id={person.id})  "
            f"week {monday} → {week_end}"
        )

        for offset, label in WEEKDAYS.items():
            target = monday + timedelta(days=offset)
            marker = "  (today)" if target == today else ""
            print(f"\n{label} {target}{marker}:")
            process_day(
                db,
                person_id=person.id,
                target_date=target,
                title_match=args.title_match.lower(),
                teaching_title=args.title,
                apply_changes=args.apply,
            )

        if args.apply:
            db.commit()
            print("\n✅ Committed.")
        else:
            db.rollback()
            print("\nDry-run complete — no changes saved. "
                  "Re-run with --apply to write.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
