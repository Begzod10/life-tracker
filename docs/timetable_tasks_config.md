# Timetable ↔ Tasks: Full Config & Analyzable Stats

Reference for how the personal timetable (`TimeBlock`) and the goal-tied `Task`
system are wired together, every endpoint that touches them, the scheduled
jobs that mutate their state, and every statistic the backend currently emits.

Source of truth: `backend/app/models.py`, `backend/app/routers/{timetable,tasks,progresslog_task}.py`,
`backend/app/celery_app.py`, `backend/app/tasks.py`.

---

## 1. Data model

### 1.1 `Task` — `tasks` table

Belongs to a `Goal` (which belongs to a `Person`). Two flavours:

- **One-off** (`is_recurring=False`): toggling `mark_task` flips `completed` and stamps `completed_at`.
- **Recurring** (`is_recurring=True`): completion is logged in `progress_log_tasks`; `completed` is shown as `True` until midnight, then resets (due-date advances 1 day).

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `goal_id` | FK → `goals.id` | nullable |
| `name` | str(200) | required |
| `description` | text | |
| `task_type` | str(20) | `daily`, `weekly`, `one-time` (default `daily`) |
| `due_date` | date | for recurring, auto-bumps +1d on completion |
| `completed` | bool | |
| `completed_at` | datetime | |
| `priority` | str(20) | `high`/`medium`/`low` |
| `estimated_duration` | int | minutes; used by `/timetable/auto-schedule` |
| `value` | float | contribution to goal `current_value` on completion |
| `is_recurring` | bool | enables ProgressLogTask flow |
| `deleted` | bool | soft delete |
| `created_at` | datetime | streak baseline |

**Relationships:**
- `goal` → `Goal`
- `sub_tasks` → `SubTasks[]` (cascade)
- `progress_log_tasks` → `ProgressLogTask[]` (cascade)
- `time_blocks` → `TimeBlock[]` (back-ref, **not** cascade — deleting a task does *not* delete its time blocks)

### 1.2 `TimeBlock` — `time_blocks` table

The personal timetable. Each block is a `(date, start_time, end_time)` slot owned by a `Person`. Optionally `task_id`-linked.

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `person_id` | FK → `person.id` | required |
| `title` | str(200) | required |
| `description` | text | |
| `date` | date, indexed | block date |
| `start_time` | str(5) | `"HH:MM"` (string, not Time) |
| `end_time` | str(5) | `"HH:MM"`, must be `> start_time` |
| `category` | str(50) | `work`, `personal`, `health`, `learning`, `social`, `other` |
| `color` | str(7) | hex override |
| `is_completed` | bool | toggled via `/timetable/{id}/toggle` |
| `is_missed` | bool | set by `mark_missed_blocks` Celery task at 00:05 UTC |
| `notified_at` | datetime | when the "did you complete?" Telegram check-in was sent |
| `is_recurring` | bool | weekly auto-copy via `copy_recurring_blocks` |
| `task_id` | FK → `tasks.id` | nullable — **the connection point** |
| `deleted` | bool | soft delete |
| `created_at` / `updated_at` | datetime | |

**State invariants:**
- `is_completed=True` ⟹ `is_missed=False` (enforced in toggle handler).
- "Missed in stats" is computed live as `date < today AND not is_completed`, independent of the `is_missed` flag (the flag exists for Telegram notification logic; stats use the runtime predicate).

### 1.3 `ProgressLogTask` — `progress_log_tasks` table

Per-day completion ledger for **recurring** tasks. Streak/completion-count source of truth.

| Column | Type |
|---|---|
| `id` | int PK |
| `task_id` | FK → `tasks.id` |
| `log_date` | date, default `utcnow` |
| `value_logged` | float |
| `notes` | text |
| `mood` | str(20) (`great`/`good`/`okay`/`struggling`) |
| `energy_level` | int (1–10) |
| `created_at` | datetime |

---

## 2. Connection between Task and TimeBlock

The link is **one-way**: `TimeBlock.task_id → Task.id`. A task may have 0..N time blocks; a block has 0..1 task.

### 2.1 Completion-sync rule (`/timetable/{id}/toggle`)

When a block linked to a **recurring** task is toggled:

- **Toggle ON** + no log for that date → create a `ProgressLogTask(task_id, log_date=block.date)`.
- **Toggle OFF** + a log exists for that date → delete that `ProgressLogTask`.
- One-off tasks: block toggle does *not* mutate the task — manual `mark_task` only.

This makes a block-completion count toward the task's streak.

### 2.2 Completion-dates aggregation

The set of "days task X was done" is computed as the **union** of:

1. `ProgressLogTask.log_date` rows for that task, and
2. `TimeBlock.date` for blocks where `task_id=X AND is_completed=True AND NOT deleted`.

Used by:
- `GET /tasks/{id}/completion-dates`
- `GET /tasks/recurring-stats`
- `GET /tasks/goal/{goal_id}/recurring-completions`

### 2.3 Auto-scheduling (`POST /timetable/auto-schedule/{goal_id}`)

Walks the goal's pending tasks and slots each into the first free 09:00–18:00 window over the next 7 days. Sets `task_id` on the created block. `estimated_duration` (default 30 min) controls slot length. Overlap check is purely time-based (start/end minutes) over existing non-deleted blocks.

### 2.4 Category propagation

`PUT /timetable/{id}?propagate=true` on a recurring block whose `category` changed fires `propagate_recurring_category` Celery task — updates `category` on all **future** recurring siblings (matched by person + start_time + end_time + recurring + future date).

---

## 3. Endpoints

### 3.1 Tasks (`/tasks`, file: `routers/tasks.py`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/tasks/` | All user's non-deleted tasks (via Goal join) |
| `GET` | `/tasks/{id}` | Single task |
| `POST` | `/tasks/` | Create |
| `PUT` | `/tasks/{id}` | Update |
| `DELETE` | `/tasks/{id}` | Soft delete |
| `POST` | `/tasks/{id}/mark_task` | Toggle complete (one-off) / log today (recurring) — also recomputes goal `current_value` and `percentage` |
| `GET` | `/tasks/recurring-stats` | Per-task completion/missed/streak (see §4.2) |
| `GET` | `/tasks/{id}/completion-dates` | ISO dates union of logs + completed blocks |
| `GET` | `/tasks/deleted/goal/{goal_id}` | Soft-deleted tasks |
| `GET` | `/tasks/person/{person_id}` | By person |
| `GET` | `/tasks/goal/{goal_id}` | By goal |
| `GET` | `/tasks/goal/{goal_id}/recurring-completions?weeks=4` | Per-recurring-task completion calendar |
| `GET` | `/tasks/goal/{goal_id}/statistics` | Per-goal task breakdown (see §4.3) |

### 3.2 Timetable (`/timetable`, file: `routers/timetable.py`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/timetable/?date_from=&date_to=` | List blocks (date-filtered) |
| `GET` | `/timetable/day/{day}` | All blocks for a day |
| `GET` | `/timetable/stats?weeks=4` or `?from_date=&to_date=` | Aggregate stats (see §4.1) |
| `POST` | `/timetable/` | Create block (rejects `start_time ≥ end_time`) |
| `PUT` | `/timetable/{id}?propagate=true` | Update; `propagate` rewrites category on future recurring siblings |
| `DELETE` | `/timetable/{id}` | Soft delete |
| `PATCH` | `/timetable/{id}/toggle` | Flip `is_completed`; syncs `ProgressLogTask` when block links a recurring task |
| `POST` | `/timetable/auto-schedule/{goal_id}` | Slot pending goal tasks into free windows |
| `POST` | `/timetable/bulk-reschedule` body `{from_date, to_date}` | Move all incomplete blocks from one day to another |
| `GET` | `/timetable/conclusions?limit=30` | Daily AI summaries |
| `POST` | `/timetable/conclusions/generate?force=true` | Generate today's AI conclusion synchronously |

### 3.3 ProgressLogTask (`/progress-log-task`, file: `routers/progresslog_task.py`)

Used by features that log mood/energy alongside a task completion without going through the toggle path. Same 4 CRUD verbs.

### 3.4 Frontend endpoint registry

`frontend/src/lib/api/endpoints.ts`:
- `API_ENDPOINTS.TASKS.*` (lines ~49–61) — including `RECURRING_STATS`, `RECURRING_COMPLETIONS`, `COMPLETION_DATES`.
- `API_ENDPOINTS.TIMETABLE.*` (lines ~326–349) — `STATS(weeks, fromDate?, toDate?)`, `BY_DAY`, `TOGGLE`, `CONCLUSIONS`, `GENERATE_CONCLUSION`, `AUTO_SCHEDULE`, `BULK_RESCHEDULE`.

Hooks: `frontend/src/lib/hooks/use-timetable.ts`, `use-tasks.ts`.

---

## 4. Stats — what's currently computed

### 4.1 Timetable aggregate — `GET /timetable/stats`

Window: `[date_from, date_to]` (defaults to `today ± weeks`). Returns:

```jsonc
{
  "period":          { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "weeks":           4,

  "total_blocks":     int,
  "completed_blocks": int,        // is_completed
  "missed_blocks":    int,        // date < today AND NOT is_completed
  "completion_rate":  float,      // completed/total * 100, 1 decimal
  "missed_rate":      float,

  "total_hours":      float,      // sum(end-start) over all
  "completed_hours":  float,
  "missed_hours":     float,

  "recurring_count":  int,

  "streak_days":      int,        // consecutive days ending today with ≥1 block

  "by_category":  [{ "category", "count", "hours", "completed", "missed" }, …],
  "by_weekday":   [{ "weekday": 0..6, "name", "count", "hours", "completed", "missed" }, …],
  "by_hour":      [{ "hour": 6..23, "count" }, …],           // by start hour
  "daily_summary":[{ "date", "total", "completed", "missed", "hours" }, …]
}
```

Hours per block = `(end_time − start_time)` in minutes, clamped at 0, divided by 60. String time parse — no timezone math.

### 4.2 Per-task recurring stats — `GET /tasks/recurring-stats`

Returns `{ <task_id>: {...} }` for every recurring task of the current user:

```jsonc
{
  "days_completed": int,   // |ProgressLogTask.log_date ∪ TimeBlock.date(completed)|
  "days_missed":    int,   // max(total_days − days_completed, 0)
  "total_days":     int,   // (today − task.created_at.date()), excludes today
  "streak":         int    // consecutive days ending today (or yesterday if not done today)
}
```

### 4.3 Per-goal task breakdown — `GET /tasks/goal/{goal_id}/statistics`

Merges `ProgressService.get_goal_progress_details(goal_id)` with:

```jsonc
{
  "breakdown_by_priority": {
    "high":   { "total": n, "completed": n },
    "medium": { "total": n, "completed": n },
    "low":    { "total": n, "completed": n }
  },
  "breakdown_by_type": {
    "daily":    { "total": n, "completed": n },
    "weekly":   { "total": n, "completed": n },
    "one-time": { "total": n, "completed": n }
  }
}
```

### 4.4 Recurring-completion calendar — `GET /tasks/goal/{goal_id}/recurring-completions?weeks=4`

Per recurring task in the goal:

```jsonc
[{
  "task_id":   int,
  "task_name": str,
  "priority":  str,
  "completions": ["YYYY-MM-DD", …]   // union of logs ∪ completed blocks, since (today − weeks)
}]
```

Frontend uses this to render heatmap calendars.

### 4.5 Completion dates — `GET /tasks/{id}/completion-dates`

Sorted ISO-string list (`logs ∪ completed blocks`, no time-window filter).

---

## 5. Scheduled jobs (Celery Beat)

`backend/app/celery_app.py` — RedBeat-backed, broker = Redis, TZ = UTC. Tashkent is UTC+5.

| Beat key | UTC | Tashkent | Task | What it does |
|---|---|---|---|---|
| `send-morning-tasks` | `NOTIFY_MORNING_HOUR_UTC:00` | usually 08:00 | `send_morning_tasks` | Telegram: today's tasks/blocks |
| `send-word-of-the-day` | `04:00` | 09:00 | `send_word_of_the_day` | Vocab nudge from due-review pool |
| `send-daily-summary` | `17:00` | 22:00 | `send_daily_summary` | Telegram full-day summary |
| `carryover-missed-tasks` | `17:05` | 22:05 | `carryover_missed_tasks` | Move today's missed recurring blocks into tomorrow's first free slot |
| `send-evening-checkup` | `NOTIFY_EVENING_HOUR_UTC:00` | usually 21:00 | `send_evening_checkup` | Telegram check-in |
| `generate-daily-conclusion` | `17:30` | 22:30 | `generate_daily_conclusion` | AI conclusion → DB + Telegram |
| `retry-undelivered-conclusions` | `*/10 min` | — | `retry_undelivered_conclusions` | Re-send conclusions whose Telegram delivery never landed |
| `check-block-completions` | `*/5 min` | — | `check_block_completions` | 60-min-after-end ping: "did you complete?" |
| `mark-missed-blocks` | `00:05` | 05:05 | `mark_missed_blocks` | Stamp `is_missed=True` on prior-day blocks |
| `copy-recurring-timetable-blocks` | Sat `00:00` | Sat 05:00 | `copy_recurring_blocks` | Mirror recurring blocks into next week |
| `goal-deadline-warnings` | Mon `03:00` | Mon 08:00 | `goal_deadline_warnings` | Telegram nudge for goals near `target_date` |
| `send-weekly-review` | Sun `15:00` | Sun 20:00 | `send_weekly_review` | Per-person weekly summary |

Notes:
- `check_block_completions` only fires the "completion?" Telegram message **once** (`notified_at` guard).
- `carryover_missed_tasks` only touches blocks linked to a **recurring** task (`_is_recurring_task`); pure one-off blocks are left alone.

---

## 6. What you can analyze (and where the data lives)

If you want to add a new stat, here's where each signal already exists:

| Question | Source |
|---|---|
| How completed was the past week? | `/timetable/stats?from_date=&to_date=` → `completion_rate`, `daily_summary` |
| Which category eats the most hours? | `/timetable/stats` → `by_category[*].hours` |
| Which days of week am I most consistent? | `/timetable/stats` → `by_weekday[*].completed / count` |
| When in the day do I schedule blocks? | `/timetable/stats` → `by_hour` |
| Current planning streak | `/timetable/stats` → `streak_days` |
| Per-recurring-task adherence | `/tasks/recurring-stats` → `days_completed / total_days`, `streak` |
| Heatmap of one recurring task | `/tasks/{id}/completion-dates` or `/tasks/goal/{goal}/recurring-completions` |
| Goal-level task health | `/tasks/goal/{goal_id}/statistics` → `breakdown_by_priority`, `breakdown_by_type`, plus ProgressService details |
| AI's daily narrative | `/timetable/conclusions?limit=N` |

### 6.1 Stats not yet exposed (would be cheap to add)

These are derivable from existing rows but no endpoint emits them today:

- **Task-vs-block reconciliation**: per task, `count(time_blocks where task_id=X) − count(time_blocks where task_id=X AND is_completed)` ⇒ "scheduled but not done".
- **Block-link adoption**: `count(time_blocks where task_id IS NOT NULL) / count(time_blocks)` — how much of the timetable is goal-tied vs ad-hoc.
- **Average block duration by category** — `by_category[*].hours / by_category[*].count`.
- **Time-of-day completion rate** — extend `by_hour` to track `completed/count` per start-hour.
- **Recurring-block drift** — `count(copy_recurring_blocks created)` vs `count(deleted)` over a window.
- **Mood/energy correlation** — `ProgressLogTask.mood`/`energy_level` is collected but no aggregation endpoint reads it.

All of those would be a single small handler in `routers/timetable.py` or `routers/tasks.py` over the same tables documented above.

---

## 7. Files to know

| File | Role |
|---|---|
| `backend/app/models.py` | `Task`@243, `SubTasks`@272, `ProgressLog`@294, `ProgressLogTask`@307, `TimeBlock`@614 |
| `backend/app/schemas.py` | Task/TimeBlock Pydantic schemas (TimeBlock @ ~870) |
| `backend/app/routers/tasks.py` | Task CRUD + recurring stats + completion dates |
| `backend/app/routers/timetable.py` | TimeBlock CRUD + `/stats` + AI conclusions + auto-schedule + bulk-reschedule |
| `backend/app/routers/progresslog_task.py` | Mood/energy log endpoints |
| `backend/app/celery_app.py` | Beat schedule |
| `backend/app/tasks.py` | All Celery task implementations (`copy_recurring_blocks`, `mark_missed_blocks`, `check_block_completions`, `carryover_missed_tasks`, `generate_daily_conclusion`, …) |
| `backend/app/services/progress_service.py` | `ProgressService.update_goal_percentage` + `get_goal_progress_details` |
| `frontend/src/lib/api/endpoints.ts` | Endpoint URL registry |
| `frontend/src/lib/hooks/use-timetable.ts` | React Query hooks for blocks/stats/conclusions |
| `frontend/src/app/platform/[id]/timetable/page.tsx` | Timetable UI |
| `frontend/src/app/platform/[id]/timetable/stats/page.tsx` | Stats dashboard |
| `frontend/src/app/platform/task/[taskId]/page.tsx` | Task detail (calendar/streak) |
