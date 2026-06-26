"""
Weekly "wrapped" share card.

Generates a portrait PNG (1080×1350) summarising a person's week — designed to
be screenshot- and story-worthy, not a generic gradient with emojis. Rendered
in-memory via Pillow, sent through Telegram from `send_weekly_review`.

Public surface:
    - WEEKLY_STATS_FIELDS  (canonical stats dict shape)
    - compute_weekly_stats(db, person, week_start, today) -> dict
    - render_weekly_card(stats, ai_line) -> bytes
    - generate_uzbek_motivation_line(stats) -> str

The layout constants block at the top is the only place to touch for a rebrand
(colour palette, font path, footer wordmark, padding).
"""
from __future__ import annotations

import io
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Optional, Sequence

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import or_

from app import models

logger = logging.getLogger(__name__)


# ── Brand & layout constants ────────────────────────────────────────────────
# Touch THESE to rebrand — nothing below should hardcode a colour or size.

CANVAS_W = 1080
CANVAS_H = 1350

# Solid dark slate; deliberately not a rainbow gradient. Picked to read well
# on both light and dark Telegram themes when shared as a Story.
BG               = (14, 14, 18)        # #0E0E12
SURFACE          = (24, 24, 30)        # chip / card background
SURFACE_HI       = (34, 34, 42)        # chip on hover-tone (used for ring track)
TEXT             = (245, 245, 248)
TEXT_DIM         = (175, 178, 192)
TEXT_MUTED       = (110, 113, 128)
ACCENT_FLAME     = (255, 138, 76)      # streak / hero
ACCENT_FLAME_HI  = (255, 214, 138)     # flame inner highlight
ACCENT_RING      = (96, 165, 250)      # completion ring
ACCENT_BAR_HI    = (110, 231, 183)     # weekly bars when day is completed
ACCENT_BAR_LO    = (52, 56, 72)        # weekly bars baseline / empty
DIVIDER          = (40, 42, 54)

# Spatial rhythm — intentional, not uniform padding everywhere.
PAD_X            = 72                  # left/right canvas gutter
PAD_TOP          = 72
SECTION_GAP      = 56                  # vertical breath between sections

# Brand strings — change here, propagate everywhere.
BRAND_WORDMARK   = "GENNIS"
BRAND_TAGLINE    = "WEEKLY"
FOOTER_LINE      = "gennis · weekly wrapped"

# Weekday initials (Mon → Sun). Used by the daily bar row.
WEEKDAY_LABELS = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")

# Static English motivation pool — used when the AI provider is unreachable or
# returns garbage. Each line is ≤ 8 words and ends without punctuation so
# it composites cleanly under the chip row.
FALLBACK_LINES = (
    "Keep going — the result is near",
    "Another strong week in the books",
    "Every day is one step forward",
    "Same energy again tomorrow",
    "You are ahead of most people",
    "Good work — keep the momentum",
    "One more week, one more win",
)

# Bundled font dir. Resolver tries these first; falls back to system DejaVu
# (which handles Uzbek Latin fine) and only as a last resort to Pillow's
# bitmap default. See assets/fonts/README.md.
_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

_FONT_CANDIDATES_REGULAR = (
    _FONT_DIR / "Inter-Regular.ttf",
    _FONT_DIR / "DejaVuSans.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/TTF/DejaVuSans.ttf"),
    Path("/usr/share/fonts/liberation/LiberationSans-Regular.ttf"),
    Path("/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf"),
    Path("/usr/share/fonts/gnu-free/FreeSans.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
)
_FONT_CANDIDATES_MEDIUM = (
    _FONT_DIR / "Inter-Medium.ttf",
    _FONT_DIR / "Inter-Regular.ttf",
    _FONT_DIR / "DejaVuSans.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/liberation/LiberationSans-Regular.ttf"),
    Path("/usr/share/fonts/gnu-free/FreeSans.ttf"),
)
_FONT_CANDIDATES_BOLD = (
    _FONT_DIR / "Inter-Bold.ttf",
    _FONT_DIR / "DejaVuSans-Bold.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/liberation/LiberationSans-Bold.ttf"),
    Path("/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf"),
    Path("/usr/share/fonts/gnu-free/FreeSansBold.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
)

# Cache so we don't re-open the TTF for every glyph size we need.
_FONT_CACHE: dict[tuple[str, int], ImageFont.ImageFont] = {}
_FONT_WARNED = False


WEEKLY_STATS_FIELDS = (
    "period_label",        # "Nov 25 – Dec 1"
    "streak_days",         # int
    "total_blocks",        # int
    "completed_blocks",    # int
    "completion_rate",     # 0–100 float
    "total_hours",         # float
    "completed_hours",     # float
    "top_category",        # str ("Learning") or "—"
    "top_category_hours",  # float
    "best_weekday",        # str ("Tuesday") or "—"
    "best_weekday_rate",   # 0–100 float
    "daily_summary",       # list[dict[date_iso, total, completed]] — exactly 7
)


# ── Font resolution ─────────────────────────────────────────────────────────

def _first_existing(candidates: Sequence[Path]) -> Optional[Path]:
    for c in candidates:
        try:
            if c.is_file():
                return c
        except OSError:
            continue
    return None


def _font(weight: str, size: int) -> ImageFont.ImageFont:
    """Resolve a TTF font at the requested weight + size.

    Order: bundled (assets/fonts) → system DejaVu → Pillow's bitmap default.
    Warns once if it has to fall back to the bitmap font (which means the card
    will render in an ugly low-res style — the deploy is missing TTFs).
    """
    global _FONT_WARNED
    key = (weight, size)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]

    candidates = {
        "regular": _FONT_CANDIDATES_REGULAR,
        "medium":  _FONT_CANDIDATES_MEDIUM,
        "bold":    _FONT_CANDIDATES_BOLD,
    }.get(weight, _FONT_CANDIDATES_REGULAR)

    path = _first_existing(candidates)
    if path is not None:
        try:
            font = ImageFont.truetype(str(path), size=size)
            _FONT_CACHE[key] = font
            return font
        except OSError as exc:
            logger.warning("weekly_card: failed to load %s: %s", path, exc)

    if not _FONT_WARNED:
        logger.warning(
            "weekly_card: no TTF font available — falling back to Pillow's "
            "bitmap default. Drop Inter or DejaVu Sans into %s.", _FONT_DIR,
        )
        _FONT_WARNED = True
    font = ImageFont.load_default()
    _FONT_CACHE[key] = font
    return font


# ── Stats computation ───────────────────────────────────────────────────────

def _duration_hours(b: models.TimeBlock) -> float:
    """Hours covered by a single TimeBlock. Mirrors /timetable/stats logic."""
    try:
        sh, sm = b.start_time.split(":")
        eh, em = b.end_time.split(":")
        return max(0, (int(eh) * 60 + int(em)) - (int(sh) * 60 + int(sm))) / 60
    except (ValueError, AttributeError):
        return 0.0


def _pad_daily_summary(raw: dict[date, dict], week_start: date) -> list[dict]:
    """Return exactly 7 entries (Mon..Sun) so the bar row never breaks."""
    out: list[dict] = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        bucket = raw.get(d, {"total": 0, "completed": 0})
        out.append({
            "date": d.isoformat(),
            "total": bucket["total"],
            "completed": bucket["completed"],
        })
    return out


def _format_period_label(week_start: date, week_end: date) -> str:
    if week_start.month == week_end.month:
        return f"{week_start.strftime('%b %-d')} – {week_end.strftime('%-d')}"
    return f"{week_start.strftime('%b %-d')} – {week_end.strftime('%b %-d')}"


def compute_weekly_stats(
    db,
    person: models.Person,
    week_start: date,
    today: date,
) -> dict:
    """Aggregate the same numbers /timetable/stats produces, for one person and
    one Tashkent-local Monday→Sunday window. Pure DB calls — no router/HTTP.
    """
    week_end = week_start + timedelta(days=6)
    frozen_dates: set = {
        row.date
        for row in db.query(models.FrozenDay).filter(
            models.FrozenDay.person_id == person.id,
            models.FrozenDay.date >= week_start,
            models.FrozenDay.date <= week_end,
        ).all()
    }
    blocks = [
        b for b in (
            db.query(models.TimeBlock)
            .filter(
                models.TimeBlock.person_id == person.id,
                models.TimeBlock.deleted == False,  # noqa: E712
                models.TimeBlock.date >= week_start,
                models.TimeBlock.date <= week_end,
            )
            .all()
        )
        if b.date not in frozen_dates
    ]

    total_blocks     = len(blocks)
    completed_blocks = sum(1 for b in blocks if b.is_completed)
    total_hours      = sum(_duration_hours(b) for b in blocks)
    completed_hours  = sum(_duration_hours(b) for b in blocks if b.is_completed)

    # Top category by raw hours scheduled.
    cat_hours: dict[str, float] = defaultdict(float)
    for b in blocks:
        cat_hours[(b.category or "other")] += _duration_hours(b)
    if cat_hours:
        top_cat, top_cat_h = max(cat_hours.items(), key=lambda kv: kv[1])
    else:
        top_cat, top_cat_h = "—", 0.0

    # Best weekday by completed/total ratio (ties → highest hours).
    weekday_buckets: dict[int, dict[str, float]] = defaultdict(
        lambda: {"total": 0, "completed": 0, "hours": 0.0}
    )
    for b in blocks:
        wd = b.date.weekday()
        weekday_buckets[wd]["total"]     += 1
        weekday_buckets[wd]["hours"]     += _duration_hours(b)
        if b.is_completed:
            weekday_buckets[wd]["completed"] += 1

    best_wd_name = "—"
    best_wd_rate = 0.0
    if weekday_buckets:
        best_idx, best = max(
            weekday_buckets.items(),
            key=lambda kv: (
                (kv[1]["completed"] / kv[1]["total"]) if kv[1]["total"] else 0.0,
                kv[1]["hours"],
            ),
        )
        if best["total"]:
            best_wd_rate = best["completed"] / best["total"] * 100
            best_wd_name = ["Monday", "Tuesday", "Wednesday", "Thursday",
                            "Friday", "Saturday", "Sunday"][best_idx]

    # Daily summary, padded to 7 entries.
    raw_days: dict[date, dict] = defaultdict(lambda: {"total": 0, "completed": 0})
    for b in blocks:
        raw_days[b.date]["total"] += 1
        if b.is_completed:
            raw_days[b.date]["completed"] += 1
    daily_summary = _pad_daily_summary(raw_days, week_start)

    # Streak: consecutive days ending today with ≥1 non-deleted block. Use a
    # 90-day lookback so a long streak isn't truncated to the week window.
    streak = 0
    cursor = today
    horizon = today - timedelta(days=90)
    frozen_streak: set = {
        row.date
        for row in db.query(models.FrozenDay).filter(
            models.FrozenDay.person_id == person.id,
            models.FrozenDay.date >= horizon,
            models.FrozenDay.date <= today,
        ).all()
    }
    seen_dates: set[date] = set()
    streak_rows = (
        db.query(models.TimeBlock.date)
        .filter(
            models.TimeBlock.person_id == person.id,
            models.TimeBlock.deleted == False,  # noqa: E712
            models.TimeBlock.date >= horizon,
            models.TimeBlock.date <= today,
        ).all()
    )
    for (d,) in streak_rows:
        if d not in frozen_streak:
            seen_dates.add(d)
    while cursor in seen_dates:
        streak += 1
        cursor -= timedelta(days=1)

    completion_rate = (completed_blocks / total_blocks * 100) if total_blocks else 0.0

    return {
        "period_label":       _format_period_label(week_start, week_end),
        "streak_days":        streak,
        "total_blocks":       total_blocks,
        "completed_blocks":   completed_blocks,
        "completion_rate":    round(completion_rate, 1),
        "total_hours":        round(total_hours, 1),
        "completed_hours":    round(completed_hours, 1),
        "top_category":       top_cat,
        "top_category_hours": round(top_cat_h, 1),
        "best_weekday":       best_wd_name,
        "best_weekday_rate":  round(best_wd_rate, 1),
        "daily_summary":      daily_summary,
    }


# ── AI motivation line ──────────────────────────────────────────────────────

def generate_motivation_line(stats: dict) -> str:
    """One short English sentence (≤ 8 words) summarising the week.

    Calls the existing `_generate_text` helper. Falls back to a static line if
    the AI provider is unreachable, returns nothing, or returns something
    suspicious (too long, too short).
    """
    from app.tasks import _generate_text  # local to avoid circular import

    # Choose a deterministic fallback up-front so empty-week and AI-failure
    # paths share the same line for the same stats.
    fallback = FALLBACK_LINES[stats["streak_days"] % len(FALLBACK_LINES)]

    if stats["total_blocks"] == 0:
        return "This week hasn't started yet"

    prompt = (
        "You write motivational one-liners in English for a study tracker app. "
        "Output a SINGLE short sentence, at most 8 words, no quotes, no emoji, "
        "no punctuation at the end. It should sound like a friend, not a "
        "corporate slogan.\n\n"
        f"This week the user did {stats['completed_blocks']}/{stats['total_blocks']} "
        f"timetable blocks ({stats['completion_rate']:.0f}% complete), "
        f"spent {stats['completed_hours']:.1f} hours, "
        f"top category: {stats['top_category']}, "
        f"current streak: {stats['streak_days']} days.\n"
        "Write the one sentence now:"
    )

    try:
        raw = _generate_text(prompt, max_tokens=60, temperature=0.8) or ""
    except Exception as exc:
        logger.warning("weekly_card: AI line failed: %s", exc)
        return fallback

    line = raw.strip().strip("\"' ")
    if not line:
        return fallback
    words = line.split()
    if len(words) > 10:
        line = " ".join(words[:8])
    # Strip trailing punctuation per the spec.
    return line.rstrip(".!?·,;: ")


# Keep old name as an alias so callers in telegram.py don't break.
generate_uzbek_motivation_line = generate_motivation_line


# ── Drawing primitives ──────────────────────────────────────────────────────

def _text_w(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def _text_h(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[3] - bbox[1]


def _draw_centered(draw, y: int, text: str, font, fill) -> None:
    w = _text_w(draw, text, font)
    draw.text(((CANVAS_W - w) // 2, y), text, font=font, fill=fill)


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def _draw_flame(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int) -> None:
    """Stylised flame icon drawn as polygons — no emoji font dependency."""
    s = size
    outer = [
        (cx,              cy - s),
        (cx + s * 0.45,   cy - s * 0.35),
        (cx + s * 0.62,   cy + s * 0.20),
        (cx + s * 0.42,   cy + s * 0.70),
        (cx + s * 0.08,   cy + s * 0.88),
        (cx - s * 0.08,   cy + s * 0.88),
        (cx - s * 0.42,   cy + s * 0.70),
        (cx - s * 0.62,   cy + s * 0.20),
        (cx - s * 0.45,   cy - s * 0.35),
    ]
    draw.polygon(outer, fill=ACCENT_FLAME)
    inner = [
        (cx,              cy - s * 0.55),
        (cx + s * 0.24,   cy - s * 0.05),
        (cx + s * 0.32,   cy + s * 0.32),
        (cx + s * 0.16,   cy + s * 0.62),
        (cx - s * 0.16,   cy + s * 0.62),
        (cx - s * 0.32,   cy + s * 0.32),
        (cx - s * 0.24,   cy - s * 0.05),
    ]
    draw.polygon(inner, fill=ACCENT_FLAME_HI)


def _draw_ring(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    radius: int,
    pct: float,
    *,
    track_w: int = 16,
) -> None:
    """Hollow progress ring: muted track + accent arc starting at 12 o'clock."""
    bbox = (cx - radius, cy - radius, cx + radius, cy + radius)
    # Track
    draw.ellipse(bbox, outline=SURFACE_HI, width=track_w)
    # Arc only if > 0 — Pillow's arc with start==end still draws a sliver.
    if pct > 0.5:
        # PIL.arc starts at 3 o'clock with 0°, rotates clockwise. Offset by
        # -90° so the arc starts at the top, matching every other "% ring" UI.
        end_angle = -90 + (min(pct, 100) / 100.0) * 360
        draw.arc(bbox, start=-90, end=end_angle, fill=ACCENT_RING, width=track_w)


def _draw_chip(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    label: str,
    value: str,
) -> None:
    """Pill chip with a small label on top and a bigger value underneath."""
    draw.rounded_rectangle((x, y, x + w, y + h), radius=20, fill=SURFACE)
    label_font = _font("medium", 22)
    value_font = _font("bold", 36)
    # Label
    lw = _text_w(draw, label, label_font)
    draw.text((x + (w - lw) // 2, y + 18), label, font=label_font, fill=TEXT_MUTED)
    # Value (truncate long category names so they don't overflow)
    safe_value = _truncate(value, 14)
    vw = _text_w(draw, safe_value, value_font)
    draw.text((x + (w - vw) // 2, y + 52), safe_value, font=value_font, fill=TEXT)


def _draw_daily_bars(
    draw: ImageDraw.ImageDraw,
    y_top: int,
    daily_summary: Sequence[dict],
) -> None:
    """Seven thin vertical bars, label initials beneath. Bar height encodes
    completed/total per day; empty days still show the baseline track so the
    rhythm reads."""
    n = 7
    track_w = CANVAS_W - 2 * PAD_X
    slot_w = track_w / n
    bar_w = int(slot_w * 0.55)
    bar_max_h = 160

    for i in range(n):
        entry = daily_summary[i] if i < len(daily_summary) else {"total": 0, "completed": 0}
        total = entry.get("total", 0)
        done  = entry.get("completed", 0)
        ratio = (done / total) if total else 0.0

        cx = int(PAD_X + slot_w * (i + 0.5))
        bx0 = cx - bar_w // 2
        bx1 = cx + bar_w // 2

        # Baseline (muted) — always drawn so the empty-day shape is visible.
        draw.rounded_rectangle(
            (bx0, y_top, bx1, y_top + bar_max_h),
            radius=bar_w // 2,
            fill=ACCENT_BAR_LO,
        )
        # Filled portion — only when something happened that day.
        if ratio > 0:
            fill_h = max(int(bar_max_h * ratio), bar_w)  # never thinner than the cap radius
            draw.rounded_rectangle(
                (bx0, y_top + (bar_max_h - fill_h), bx1, y_top + bar_max_h),
                radius=bar_w // 2,
                fill=ACCENT_BAR_HI,
            )

        # Weekday initial
        label = WEEKDAY_LABELS[i]
        lf = _font("medium", 22)
        lw = _text_w(draw, label, lf)
        draw.text((cx - lw // 2, y_top + bar_max_h + 14), label, font=lf, fill=TEXT_DIM)


# ── Public renderer ─────────────────────────────────────────────────────────

def render_weekly_card(stats: dict, ai_line: str) -> bytes:
    """Render the weekly wrapped card and return PNG bytes (no disk I/O).

    Empty-week guard: when stats['total_blocks'] == 0, the layout switches to
    a minimal "the week is still empty" card instead of dividing by zero.
    """
    img = Image.new("RGB", (CANVAS_W, CANVAS_H), BG)
    draw = ImageDraw.Draw(img)

    period_label = stats.get("period_label", "")
    total_blocks = stats.get("total_blocks", 0)

    # ── Top header bar (small, muted) ───────────────────────────────────────
    header_font = _font("medium", 26)
    head_left = f"{BRAND_WORDMARK}  ·  {BRAND_TAGLINE}"
    draw.text((PAD_X, PAD_TOP), head_left, font=header_font, fill=TEXT_DIM)
    if period_label:
        hr_w = _text_w(draw, period_label, header_font)
        draw.text(
            (CANVAS_W - PAD_X - hr_w, PAD_TOP),
            period_label,
            font=header_font,
            fill=TEXT_MUTED,
        )

    # Thin divider line under the header
    line_y = PAD_TOP + 50
    draw.rectangle((PAD_X, line_y, CANVAS_W - PAD_X, line_y + 2), fill=DIVIDER)

    # ── Empty-week shortcut ─────────────────────────────────────────────────
    if total_blocks == 0:
        msg_font  = _font("bold", 64)
        sub_font  = _font("medium", 30)
        _draw_centered(draw, 520, "This week", msg_font, TEXT)
        _draw_centered(draw, 600, "hasn’t started yet", msg_font, TEXT)
        _draw_centered(
            draw,
            720,
            "Add your first block tomorrow — the journey starts here.",
            sub_font,
            TEXT_DIM,
        )
        _draw_centered(draw, CANVAS_H - 90, FOOTER_LINE, _font("regular", 22), TEXT_MUTED)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    # ── Vertical rhythm — every section anchors off these so a layout
    #    change is one edit, not a chain of additions. ────────────────────
    HERO_Y       = 180     # top of the big streak number
    UNIT_Y       = 430     # "kun" label
    RING_CY      = 640     # centre of the completion ring
    RING_R       = 110
    BARS_Y       = 800     # top of the bar tracks
    CHIPS_Y      = 1010    # top of the chip row
    CHIP_H       = 110
    AI_Y         = 1180    # baseline-ish for the AI Uzbek line
    FOOTER_Y     = 1290

    # ── HERO: streak number + flame ─────────────────────────────────────────
    hero_font    = _font("bold", 230)
    hero_unit    = _font("medium", 42)
    hero_sub     = _font("medium", 28)

    streak       = stats["streak_days"]
    streak_str   = str(streak)
    streak_w     = _text_w(draw, streak_str, hero_font)
    flame_size   = 86
    gap_between  = 30
    total_w      = streak_w + gap_between + flame_size

    base_x       = (CANVAS_W - total_w) // 2
    draw.text((base_x, HERO_Y), streak_str, font=hero_font, fill=TEXT)
    flame_cx     = base_x + streak_w + gap_between + flame_size // 2
    flame_cy     = HERO_Y + 138
    _draw_flame(draw, flame_cx, flame_cy, flame_size)

    _draw_centered(draw, UNIT_Y,      "day",           hero_unit, TEXT_DIM)
    _draw_centered(draw, UNIT_Y + 56, "daily streak",  hero_sub,  TEXT_MUTED)

    # ── Completion ring ─────────────────────────────────────────────────────
    ring_pct     = stats["completion_rate"]
    _draw_ring(draw, CANVAS_W // 2, RING_CY, RING_R, ring_pct)

    # Anchored centring beats manual bbox math for varying-glyph heights
    # ("100" vs "5" have different ascent visually). "mm" = middle/middle.
    pct_font     = _font("bold", 72)
    pct_label    = _font("medium", 22)
    pct_str      = f"{int(round(ring_pct))}%"
    draw.text(
        (CANVAS_W // 2, RING_CY - 4),
        pct_str,
        font=pct_font,
        fill=TEXT,
        anchor="mm",
    )
    ratio_str    = f"{stats['completed_blocks']}/{stats['total_blocks']} blocks"
    draw.text(
        (CANVAS_W // 2, RING_CY + 50),
        ratio_str,
        font=pct_label,
        fill=TEXT_MUTED,
        anchor="mm",
    )

    # ── Daily bar row ───────────────────────────────────────────────────────
    _draw_daily_bars(draw, BARS_Y, stats["daily_summary"])

    # ── Three chips (hours, top category, best weekday) ─────────────────────
    gutter       = 16
    chip_w       = (CANVAS_W - 2 * PAD_X - 2 * gutter) // 3

    _draw_chip(
        draw, PAD_X, CHIPS_Y, chip_w, CHIP_H,
        "HOURS", f"{stats['completed_hours']:.1f}h",
    )
    _draw_chip(
        draw, PAD_X + chip_w + gutter, CHIPS_Y, chip_w, CHIP_H,
        "TOP CATEGORY",
        (stats["top_category"] or "—").capitalize(),
    )
    _draw_chip(
        draw, PAD_X + 2 * (chip_w + gutter), CHIPS_Y, chip_w, CHIP_H,
        "BEST DAY",
        stats["best_weekday"] if stats["best_weekday"] != "—" else "—",
    )

    # ── AI Uzbek line ───────────────────────────────────────────────────────
    ai_font      = _font("medium", 32)
    safe_ai      = (ai_line or FALLBACK_LINES[0]).strip()
    max_ai_w     = CANVAS_W - 2 * PAD_X
    if _text_w(draw, f"“{safe_ai}”", ai_font) <= max_ai_w:
        draw.text(
            (CANVAS_W // 2, AI_Y),
            f"“{safe_ai}”", font=ai_font, fill=TEXT, anchor="mm",
        )
    else:
        # Greedy wrap into two lines.
        words = safe_ai.split()
        line1, line2 = "", ""
        for w in words:
            test = (line1 + " " + w).strip()
            if _text_w(draw, test, ai_font) <= max_ai_w:
                line1 = test
            else:
                line2 = (line2 + " " + w).strip()
        draw.text((CANVAS_W // 2, AI_Y - 22), f"“{line1}",
                  font=ai_font, fill=TEXT, anchor="mm")
        draw.text((CANVAS_W // 2, AI_Y + 22), f"{line2}”",
                  font=ai_font, fill=TEXT, anchor="mm")

    # ── Footer wordmark ─────────────────────────────────────────────────────
    draw.text(
        (CANVAS_W // 2, FOOTER_Y),
        FOOTER_LINE,
        font=_font("regular", 22),
        fill=TEXT_MUTED,
        anchor="mm",
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
