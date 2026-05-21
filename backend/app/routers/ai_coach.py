from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime, timedelta
from collections import defaultdict
import json
import re

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter(prefix="/ai", tags=["ai-coach"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


def _build_user_context(user: models.Person, db: Session) -> str:
    """Gather user's life data to inject as AI context.

    Aggregates across goals, tasks, today's schedule, finances (income,
    expenses by category, savings, budgets, additional income), learning
    activity (books, dictionary, practice, essays), and the latest daily
    conclusion. Capped at the most decision-relevant slices to stay within
    a sensible token budget.
    """
    today = date.today()
    current_month = today.strftime("%Y-%m")
    month_start = date(today.year, today.month, 1)

    lines: list[str] = []

    # ─── Identity ────────────────────────────────────────────────────────
    lines.append(f"User: {user.name or 'User'}")
    if user.timezone:
        lines.append(f"Timezone: {user.timezone}")
    lines.append(f"Today: {today.isoformat()} ({today.strftime('%A')})")
    lines.append("")

    # ─── Goals ───────────────────────────────────────────────────────────
    goals = db.query(models.Goal).filter(
        models.Goal.person_id == user.id,
        models.Goal.deleted == False,
    ).order_by(models.Goal.target_date.asc().nullslast()).all()
    active_goals = [g for g in goals if (g.status or "active") == "active"]
    completed_goals = [g for g in goals if g.status == "completed"]

    lines.append(
        f"GOALS: {len(goals)} total — {len(active_goals)} active, {len(completed_goals)} completed"
    )
    for g in active_goals[:10]:
        pct = round(g._stored_percentage or 0)
        priority = g.priority or "medium"
        category = g.category or "—"
        line = f"  - [{priority}/{category}] {g.name} ({pct}%)"
        if g.target_date:
            days_left = (g.target_date - today).days
            line += f" — due {g.target_date} ({days_left}d)"
        lines.append(line)
        if g.description:
            desc = g.description.strip().replace("\n", " ")
            if len(desc) > 140:
                desc = desc[:137] + "…"
            lines.append(f"      {desc}")
    lines.append("")

    # ─── Tasks ───────────────────────────────────────────────────────────
    goal_ids = [g.id for g in goals]
    tasks = db.query(models.Task).filter(
        models.Task.goal_id.in_(goal_ids),
        models.Task.deleted == False,
    ).all() if goal_ids else []

    completed_tasks = [t for t in tasks if t.completed]
    pending_tasks = [t for t in tasks if not t.completed]
    overdue = [t for t in pending_tasks if t.due_date and t.due_date < today]
    due_today = [t for t in pending_tasks if t.due_date == today]
    due_this_week = [
        t for t in pending_tasks
        if t.due_date and today < t.due_date <= today + timedelta(days=7)
    ]

    lines.append(
        f"TASKS: {len(tasks)} total — {len(completed_tasks)} done, {len(pending_tasks)} pending"
    )
    if overdue:
        lines.append(f"  Overdue ({len(overdue)}):")
        for t in overdue[:6]:
            lines.append(f"    - {t.name} (due {t.due_date}, {t.priority})")
    if due_today:
        lines.append(f"  Due today ({len(due_today)}):")
        for t in due_today[:6]:
            lines.append(f"    - {t.name} ({t.priority})")
    if due_this_week:
        lines.append(f"  Due this week ({len(due_this_week)}):")
        for t in due_this_week[:6]:
            lines.append(f"    - {t.name} (due {t.due_date})")
    lines.append("")

    # ─── Today's schedule ────────────────────────────────────────────────
    todays_blocks = db.query(models.TimeBlock).filter(
        models.TimeBlock.person_id == user.id,
        models.TimeBlock.date == today,
        models.TimeBlock.deleted == False,
    ).order_by(models.TimeBlock.start_time.asc()).all()
    if todays_blocks:
        done = sum(1 for b in todays_blocks if b.is_completed)
        missed = sum(1 for b in todays_blocks if b.is_missed)
        lines.append(
            f"TODAY'S SCHEDULE: {len(todays_blocks)} blocks — {done} done, {missed} missed"
        )
        for b in todays_blocks[:10]:
            status_icon = "✓" if b.is_completed else ("✗" if b.is_missed else "·")
            lines.append(
                f"  {status_icon} {b.start_time}-{b.end_time} [{b.category}] {b.title}"
            )
        lines.append("")

    # ─── Finances: income ────────────────────────────────────────────────
    active_jobs = db.query(models.Job).filter(
        models.Job.person_id == user.id,
        models.Job.active == True,
        models.Job.deleted == False,
    ).all()
    job_ids = [j.id for j in active_jobs]
    salary_months = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id.in_(job_ids),
        models.SalaryMonth.month == current_month,
        models.SalaryMonth.deleted == False,
    ).all() if job_ids else []
    salary_income = sum(sm.net_amount for sm in salary_months)

    other_income = db.query(models.IncomeSource).filter(
        models.IncomeSource.person_id == user.id,
        models.IncomeSource.deleted == False,
        models.IncomeSource.received_date >= month_start,
        models.IncomeSource.received_date <= today,
    ).all()
    additional_income = sum(i.amount for i in other_income)
    monthly_income = salary_income + additional_income

    # ─── Finances: expenses with category breakdown ──────────────────────
    expenses = db.query(models.Expense).filter(
        models.Expense.person_id == user.id,
        models.Expense.deleted == False,
        models.Expense.date >= month_start,
        models.Expense.date <= today,
    ).all()
    monthly_expenses = sum(e.amount for e in expenses)

    by_category: dict[str, float] = defaultdict(float)
    essential_total = 0.0
    for e in expenses:
        by_category[e.category or "other"] += e.amount
        if e.is_essential:
            essential_total += e.amount
    top_categories = sorted(by_category.items(), key=lambda x: -x[1])[:5]

    # ─── Finances: savings & budgets ─────────────────────────────────────
    savings = db.query(models.Saving).filter(
        models.Saving.person_id == user.id,
        models.Saving.deleted == False,
    ).all()
    total_savings = sum(s.current_balance for s in savings)

    budgets = db.query(models.Budget).filter(
        models.Budget.person_id == user.id,
        models.Budget.period == current_month,
        models.Budget.deleted == False,
    ).all()
    over_budget = []
    for b in budgets:
        spent = by_category.get(b.category, 0.0)
        if spent > b.allocated_amount > 0:
            over_budget.append((b.category, spent, b.allocated_amount))

    lines.append("FINANCES (this month, UZS):")
    lines.append(f"  Salary income:   {salary_income:,.0f}")
    if additional_income:
        lines.append(f"  Other income:    {additional_income:,.0f}")
    lines.append(f"  Total income:    {monthly_income:,.0f}")
    lines.append(f"  Total expenses:  {monthly_expenses:,.0f}")
    if monthly_expenses > 0:
        lines.append(
            f"  Essentials:      {essential_total:,.0f} ({essential_total / monthly_expenses * 100:.0f}%)"
        )
    lines.append(f"  Net:             {monthly_income - monthly_expenses:,.0f}")
    if top_categories:
        lines.append("  Top categories:")
        for cat, amount in top_categories:
            pct = (amount / monthly_expenses * 100) if monthly_expenses > 0 else 0
            lines.append(f"    - {cat}: {amount:,.0f} ({pct:.0f}%)")
    if over_budget:
        lines.append(f"  Over budget ({len(over_budget)}):")
        for cat, spent, allocated in over_budget[:4]:
            lines.append(
                f"    - {cat}: {spent:,.0f} / {allocated:,.0f} ({spent / allocated * 100:.0f}%)"
            )
    if savings:
        lines.append(
            f"  Total savings:   {total_savings:,.0f} across {len(savings)} account(s)"
        )
        for s in savings[:4]:
            line = f"    - {s.account_name} [{s.account_type}]: {s.current_balance:,.0f}"
            if s.target_amount:
                pct = s.current_balance / s.target_amount * 100
                line += f" / {s.target_amount:,.0f} ({pct:.0f}%)"
            lines.append(line)
    lines.append("")

    # ─── Learning: books ─────────────────────────────────────────────────
    reading = db.query(models.Book).filter(
        models.Book.person_id == user.id,
        models.Book.deleted == False,
        models.Book.status == "reading",
    ).order_by(models.Book.last_opened_at.desc().nullslast()).all()
    done_books = db.query(models.Book).filter(
        models.Book.person_id == user.id,
        models.Book.deleted == False,
        models.Book.status == "done",
    ).count()
    if reading or done_books:
        lines.append(
            f"BOOKS: {len(reading)} reading, {done_books} finished"
        )
        for b in reading[:5]:
            pct = (b.current_page / b.total_pages * 100) if b.total_pages else 0
            line = f"  - {b.title}"
            if b.author:
                line += f" — {b.author}"
            line += f" (p.{b.current_page}/{b.total_pages or '?'}, {pct:.0f}%)"
            lines.append(line)
        lines.append("")

    # ─── Learning: dictionary ────────────────────────────────────────────
    word_count = db.query(func.count(models.DictionaryWord.id)).filter(
        models.DictionaryWord.person_id == user.id,
    ).scalar() or 0
    if word_count:
        due_words = db.query(func.count(models.DictionaryWord.id)).filter(
            models.DictionaryWord.person_id == user.id,
        ).scalar() or 0
        # Difficulty breakdown
        diff_rows = db.query(
            models.DictionaryWord.difficulty,
            func.count(models.DictionaryWord.id),
        ).filter(
            models.DictionaryWord.person_id == user.id,
        ).group_by(models.DictionaryWord.difficulty).all()
        lines.append(f"DICTIONARY: {word_count} words saved")
        if diff_rows:
            by_diff = ", ".join(f"{d or '—'}: {c}" for d, c in diff_rows)
            lines.append(f"  Levels — {by_diff}")
        lines.append("")

    # ─── Learning: practice activity (last 7 days) ───────────────────────
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_sessions = db.query(models.PracticeSession).filter(
        models.PracticeSession.person_id == user.id,
        models.PracticeSession.started_at >= week_ago,
    ).all()
    if recent_sessions:
        total_q = sum(s.total_questions or 0 for s in recent_sessions)
        total_c = sum(s.correct_answers or 0 for s in recent_sessions)
        accuracy = (total_c / total_q * 100) if total_q else 0
        lines.append(
            f"PRACTICE (last 7d): {len(recent_sessions)} sessions, "
            f"{total_q} questions, {accuracy:.0f}% accuracy"
        )
        lines.append("")

    # ─── Learning: essays ────────────────────────────────────────────────
    recent_essays = db.query(models.Essay).filter(
        models.Essay.person_id == user.id,
        models.Essay.deleted == False,
    ).order_by(models.Essay.updated_at.desc()).limit(5).all()
    if recent_essays:
        submitted = sum(1 for e in recent_essays if e.status == "submitted")
        lines.append(f"ESSAYS: {len(recent_essays)} recent, {submitted} submitted")
        for e in recent_essays[:3]:
            title = (e.title or "(untitled)").strip()[:60]
            score_bits = []
            if e.deep_score is not None:
                score_bits.append(f"deep:{e.deep_score}")
            elif e.quick_score is not None:
                score_bits.append(f"quick:{e.quick_score}")
            score_str = f" — {', '.join(score_bits)}" if score_bits else ""
            lines.append(f"  - [{e.level}/{e.status}] {title}{score_str}")
        lines.append("")

    # ─── Latest reflection ───────────────────────────────────────────────
    latest_conclusion = db.query(models.DailyConclusion).filter(
        models.DailyConclusion.person_id == user.id,
    ).order_by(models.DailyConclusion.date.desc()).first()
    if latest_conclusion:
        text = (latest_conclusion.conclusion or "").strip().replace("\n", " ")
        if len(text) > 280:
            text = text[:277] + "…"
        lines.append(f"LATEST REFLECTION ({latest_conclusion.date}):")
        lines.append(f"  {text}")

    return "\n".join(lines).rstrip()


SYSTEM_PROMPT = """You are an elite personal advisor — part strategist, part coach, part analyst — embedded directly in the user's life tracking system. You have real-time access to the user's full life data:

- Goals, milestones, and priorities
- Tasks (overdue, due today, due this week, completed)
- Today's time-blocked schedule
- Finances: income (salary + other), expenses by category, savings accounts, budgets, over-budget categories
- Learning activity: books in progress, dictionary growth, practice accuracy, recent essays and scores
- The latest daily reflection they wrote

How you communicate:
- Precise and direct. No filler, no hype, no "great question!". Get to the point.
- Intelligent and specific. Reference exact numbers, goal names, deadlines, category names, book titles, and amounts from their data. Vague advice is useless.
- Structured when complexity demands it. Use short paragraphs or bullets when listing multiple points — never walls of text.
- Honest over comfortable. If something looks off or risky, say so clearly.
- Connect across domains. Spending patterns may compete with savings goals; an overdue task may explain a stalled goal; reading streaks may inform a learning goal. Surface those links.
- No cheerleading. Confidence comes from substance, not encouragement phrases.
- Currency: amounts are in UZS (Uzbek som) unless the data says otherwise. Format large numbers with thousands separators.
- If the user asks about something not in the data, say so plainly instead of inventing it.
- Never end with "How does that sound?" or "Let me know if you need anything!" — that's filler. End with a concrete next step or sharp insight.

Voice: think a top-tier consultant who also genuinely cares about the person's outcomes. Sharp, warm when it counts, never performative.

User's current data:
{context}
"""


async def _stream_groq(messages: list, context: str):
    """Stream Groq completions as SSE.

    Exceptions inside an SSE generator silently abort the response with no
    body the client can read, leaving the UI to show the generic "something
    went wrong" message and no clue about what broke. Wrap the upstream
    call and the per-chunk loop so any error becomes a structured `error`
    SSE frame the client can surface, plus a server-side log entry.
    """
    import logging
    log = logging.getLogger("ai_coach")

    try:
        from groq import AsyncGroq

        client = AsyncGroq(api_key=settings.GROQ_API_KEY)

        system = SYSTEM_PROMPT.format(context=context)
        groq_messages = [{"role": "system", "content": system}]
        groq_messages += [{"role": m["role"], "content": m["content"]} for m in messages]

        stream = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=groq_messages,
            max_tokens=1024,
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {json.dumps({'content': delta})}\n\n"

        yield "data: [DONE]\n\n"
    except Exception as exc:  # noqa: BLE001 — surface the real cause to the UI
        log.exception("ai-coach streaming failed")
        payload = json.dumps({
            "error": True,
            "message": f"{type(exc).__name__}: {exc}",
        })
        yield f"data: {payload}\n\n"
        yield "data: [DONE]\n\n"


class CreateTasksRequest(BaseModel):
    goal_id: int
    context: Optional[str] = None  # optional extra instructions from user


class CreatedTask(BaseModel):
    id: int
    name: str
    description: Optional[str]
    task_type: str
    due_date: Optional[str]
    priority: str


class CreateTasksResponse(BaseModel):
    goal_name: str
    tasks: List[CreatedTask]
    ai_summary: str


TASK_GENERATION_PROMPT = """You are a task planning specialist. Given a goal and its context, generate a concrete set of actionable tasks that will help achieve it.

Return ONLY a valid JSON object with this exact structure — no markdown, no explanation, no extra text:
{{
  "tasks": [
    {{
      "name": "Short, action-oriented task name",
      "description": "1-2 sentences explaining what to do and why",
      "task_type": "one-time | daily | weekly",
      "due_date": "YYYY-MM-DD or null",
      "priority": "high | medium | low"
    }}
  ],
  "summary": "1-2 sentence explanation of the task plan"
}}

Rules:
- Generate 3-5 tasks, no more
- Tasks must be specific and measurable, not vague
- due_date must be within the goal's target_date (if set) or within 30 days
- task_type "daily" for recurring practice, "one-time" for milestones
- Prioritize correctly: foundational tasks = high, supporting = medium, optional = low
- Today is {today}

Goal: {goal_name}
Goal description: {goal_description}
Goal target date: {target_date}
Goal progress: {progress}%
{extra_context}
"""


@router.post("/create-tasks", response_model=CreateTasksResponse)
async def create_tasks_for_goal(
    request: CreateTasksRequest,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Use Groq to generate and create tasks for a specific goal."""
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI coach is not configured. Set GROQ_API_KEY.",
        )

    # Verify goal ownership
    goal = db.query(models.Goal).filter(
        models.Goal.id == request.goal_id,
        models.Goal.person_id == current_user.id,
        models.Goal.deleted == False,
    ).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Existing tasks context
    existing_tasks = db.query(models.Task).filter(
        models.Task.goal_id == goal.id,
        models.Task.deleted == False,
    ).all()
    existing_names = ", ".join(t.name for t in existing_tasks) if existing_tasks else "none"

    prompt = TASK_GENERATION_PROMPT.format(
        today=date.today().isoformat(),
        goal_name=goal.name,
        goal_description=goal.description or "No description",
        target_date=str(goal.target_date) if goal.target_date else "not set",
        progress=round(goal._stored_percentage or 0),
        extra_context=f"Existing tasks (do not duplicate): {existing_names}\nUser instructions: {request.context}" if request.context else f"Existing tasks (do not duplicate): {existing_names}",
    )

    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)

    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1024,
        temperature=0.4,
        stream=False,
    )

    raw = response.choices[0].message.content.strip()

    # Strip markdown code fences if present
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Groq returned invalid JSON: {raw[:200]}",
        )

    task_defs = data.get("tasks", [])
    summary = data.get("summary", "Tasks generated successfully.")

    if not task_defs:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Groq returned no tasks")

    # Create tasks in DB
    created = []
    for td in task_defs:
        due = None
        if td.get("due_date"):
            try:
                due = date.fromisoformat(td["due_date"])
            except ValueError:
                due = None

        task = models.Task(
            goal_id=goal.id,
            name=td.get("name", "Unnamed task")[:200],
            description=td.get("description"),
            task_type=td.get("task_type", "one-time"),
            due_date=due,
            priority=td.get("priority", "medium"),
            completed=False,
            deleted=False,
        )
        db.add(task)
        db.flush()
        created.append(task)

    db.commit()
    for t in created:
        db.refresh(t)

    return CreateTasksResponse(
        goal_name=goal.name,
        tasks=[
            CreatedTask(
                id=t.id,
                name=t.name,
                description=t.description,
                task_type=t.task_type,
                due_date=str(t.due_date) if t.due_date else None,
                priority=t.priority,
            )
            for t in created
        ],
        ai_summary=summary,
    )


@router.post("/chat")
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    import logging
    log = logging.getLogger("ai_coach")

    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI coach is not configured. Set GROQ_API_KEY.",
        )

    # Context-building touches almost every table — if a relation, column,
    # or relationship is broken (e.g., after a schema drift), this is the
    # path that fails. Surface it as a 500 with the real cause instead of
    # letting it bubble into the StreamingResponse where the client just
    # sees a dropped connection.
    try:
        context = _build_user_context(current_user, db)
    except Exception as exc:  # noqa: BLE001
        log.exception("ai-coach context build failed for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not build context: {type(exc).__name__}: {exc}",
        ) from exc

    messages = [m.model_dump() for m in request.messages]

    return StreamingResponse(
        _stream_groq(messages, context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
