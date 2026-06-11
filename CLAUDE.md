# Life Tracker — Claude Instructions

## Project Structure

```
life_tracker/
├── backend/    FastAPI + SQLAlchemy + Celery + PostgreSQL
├── frontend/   Next.js App Router + TypeScript + TailwindCSS + React Query
├── mobile/     Flutter (separate app)
└── infra/      Deployment config
```

**Backend runs on:** FastAPI with Alembic migrations, Celery for background tasks, Groq for AI grading/summarization.
**Frontend runs on:** Next.js 14 App Router, `src/lib/hooks/` for React Query hooks, `src/lib/api/endpoints.ts` as the single URL source of truth.

---

## Request Router

Classify every incoming task before doing anything. Match the request to a type, then follow the chain for that type.

| Request type | Triggers | Chain to follow |
|---|---|---|
| **Bug fix** | "fix", "broken", "not working", "error", "wrong", image showing an error | → Chain: Bug Fix |
| **New feature** | "add", "create", "build", "implement", "new page", "new endpoint" | → Chain: New Feature |
| **UI change** | component/page name + visual change, "style", "layout", "responsive" | → Chain: UI Change |
| **Backend change** | "endpoint", "route", "api", "model", "migration", "celery task" | → Chain: Backend Change |
| **Refactor** | "clean", "refactor", "simplify", "extract", "too long" | → Chain: Refactor |
| **Question** | "what", "how", "why", "explain", "which", "what is" | → Chain: Question |
| **Deploy / ops** | "deploy", "restart", "server", "vps", "systemd" | → Chain: Deploy |

If the request matches multiple types, prefer the more specific one (Bug Fix > UI Change > New Feature).

---

## Chain: Bug Fix

1. Read the file(s) mentioned or implied by the error
2. Find the root cause — don't guess, trace it
3. Apply the minimal fix — don't clean up surrounding code unless it caused the bug
4. If the fix touches auth, user input, DB queries, or external APIs → run **security-reviewer** agent
5. Run **code-reviewer** agent
6. Report: what was broken, why, what changed

## Chain: New Feature

1. Read related existing files to understand current patterns
2. Use **planner** agent if the feature spans >2 files or has unclear scope
3. Implement step by step — follow existing code conventions exactly
4. Every UI surface must work on mobile (sm/md/lg breakpoints)
5. Never invent data — every value shown must come from the database
6. Run **code-reviewer** agent after implementation
7. If touches auth/input/DB/external API → run **security-reviewer** agent
8. Commit with conventional format: `feat(scope): description`

## Chain: UI Change

1. Read the target component/page file
2. Make the change
3. Verify mobile breakpoints are preserved (sm/md/lg) — this is mandatory on every edit
4. No new npm packages unless absolutely necessary — use existing Tailwind + lucide-react
5. Run **code-reviewer** agent
6. Commit: `fix(ui): description` or `feat(ui): description`

## Chain: Backend Change

1. Read the relevant router file + models if schema changes
2. If adding a column → create an Alembic migration
3. If adding an endpoint → follow existing router patterns (Query params, Depends(get_db), Depends(get_current_user))
4. Update the corresponding frontend endpoint in `src/lib/api/endpoints.ts` and hook in `src/lib/hooks/`
5. Run **security-reviewer** agent (backend touches DB and auth by definition)
6. Commit: `feat(api): description` or `fix(api): description`

## Chain: Refactor

1. Read the file in full
2. Use **refactor-cleaner** agent for dead code / unused imports
3. Apply changes — keep behavior identical, only improve structure
4. Run **code-reviewer** agent
5. Commit: `refactor(scope): description`

## Chain: Question

1. Answer directly and concisely
2. Reference actual files/line numbers when relevant to this codebase
3. No code changes unless the user explicitly asks after the explanation

## Chain: Deploy

1. Never restart services without confirming with the user first
2. Systemd unit names: `life_tracker.service`, `life_tracker_celery.service`, `life_tracker_celerybeat.service`
3. Reference `deploy.sh` for the standard deploy sequence
4. Never echo credentials, tokens, or connection strings — not even to diagnose

---

## Domain Glossary

| Term | Meaning |
|---|---|
| **SRS** | Spaced Repetition System — `next_review_at` on each word drives when it resurfaces |
| **chunk** | 10-word practice batch in the practice drill |
| **mistakesPool** | Words answered wrong, recycled into future chunks until correct |
| **unseenQueue** | Words not yet practiced in the current session |
| **ExerciseAttempt** | One graded answer: word + response + is_correct + feedback + usage_score |
| **ExerciseSession** | A batch of ExerciseAttempts grouped under one session_id |
| **verdict** | Grading result object returned by grader: `{ ok, exact, score, feedback }` |
| **platform id** | User profile ID in the URL — `/platform/[id]/...` — comes from `useParams<{ id: string }>()` |
| **news pipeline** | fetch → scrape → AI summarize → save. Runs as a Celery task |
| **reader overlay** | Word-click popup in the book reader that looks up definitions |

---

## Page ↔ API Map

| Frontend page | Backend router file |
|---|---|
| `/platform/[id]/news` | `routers/news.py` |
| `/platform/[id]/learning/exercises` | `routers/exercises.py` |
| `/platform/[id]/learning/exercises/history` | `routers/exercises.py` |
| `/platform/[id]/learning/practice` | `routers/exercises.py` + `routers/dictionary.py` |
| `/platform/[id]/learning/library/[bookId]` | `routers/library.py` |
| `/platform/[id]/learning` | `routers/dictionary.py` + `routers/library.py` |

---

## Known Gotchas

- **Deploy is instant:** GitHub webhook → `webhook.service` (port 9000) → `deploy.sh`. No cron. Push to master and it deploys in ~2 seconds.
- **Long jobs → Celery:** anything >5s must use `.delay()` — the VPS nginx times out at 30s. News fetch, bulk AI grading, any scraping loop.
- **News category filter:** use URL state `?cat=` via `useSearchParams` + `router.replace`, not `useState` — `useState` resets on back-navigation.
- **HackerNews fetches:** must be parallel (`ThreadPoolExecutor`) — sequential hits 60×8s = timeout.
- **PDF soft-hyphens:** normalize on text selection in the reader — `pin-\nnacle` → `pinnacle` (already fixed, don't regress).
- **Reader word overlay:** keep `\bword\b` strict — no partial/prefix/suffix matching fallbacks.
- **News 504:** was caused by synchronous pipeline in HTTP handler. Fixed by Celery. Don't move it back inline.
- **Practice auto-advance:** only skip chunk-review when `missedIds.length === 0 AND sessionMistakes === 0 AND correct >= 20` — all three conditions required.

---

## Commit Scopes

```
feat(reader) / fix(reader)       — book reader, PDF, highlights, overlay
feat(news) / fix(news)           — news feed, categories, providers, pipeline
feat(exercises) / fix(exercises) — exercise sessions, grading, SRS
feat(practice) / fix(practice)   — practice drill, chunks, streak
feat(library) / fix(library)     — book library, folders, modules
feat(api) / fix(api)             — backend endpoints, routers
feat(ui) / fix(ui)               — visual-only frontend changes
refactor(scope)                  — behavior-preserving cleanup
chore(deps) / chore(ci)          — dependencies, CI/CD
```

---

## Hard Rules (always active, override everything)

- **Mobile-first:** every frontend edit must keep sm/md/lg layouts working — not just desktop
- **No invented data:** never render values not backed by the database
- **No secrets in chat:** never accept pasted API keys, tokens, or passwords; never echo them back
- **Immutable updates:** always return new objects, never mutate existing ones
- **Minimal diffs:** fix the thing asked, don't refactor surrounding code unless it caused the problem
- **English meanings only:** for dictionary features, show English definitions — not translations
- **Strict text match:** keep `\bword\b` exact in reader overlay — no lax prefix/suffix fallbacks

---

## Key Files

| File | Purpose |
|---|---|
| `frontend/src/lib/api/endpoints.ts` | Single source of truth for all API URLs |
| `frontend/src/lib/hooks/use-*.ts` | React Query hooks — one per domain |
| `backend/app/routers/` | FastAPI route handlers |
| `backend/app/models.py` | SQLAlchemy models |
| `backend/app/services/` | Business logic (news pipeline, AI grading) |
| `backend/app/tasks.py` | Celery background tasks |
| `backend/alembic/versions/` | DB migrations |

---

## Tech Constraints

- React Query cache keys must include all params that affect the query
- Celery tasks for anything that takes >5s (news fetch, bulk AI ops)
- Alembic migration required for every schema change — no raw ALTER TABLE
- `useSearchParams` + `router.replace` for any filter/tab state that should survive navigation
