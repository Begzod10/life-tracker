from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime
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
    """Gather user's life data to inject as AI context."""
    today = date.today()
    current_month = today.strftime("%Y-%m")

    # Goals
    goals = db.query(models.Goal).filter(
        models.Goal.person_id == user.id,
        models.Goal.deleted == False,
    ).all()

    # Tasks (active)
    tasks = db.query(models.Task).filter(
        models.Task.goal_id.in_([g.id for g in goals]),
        models.Task.deleted == False,
    ).all() if goals else []

    # Financial: salary this month
    job_ids = [j.id for j in db.query(models.Job).filter(
        models.Job.person_id == user.id,
        models.Job.active == True,
    ).all()]
    salary_months = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id.in_(job_ids),
        models.SalaryMonth.month == current_month,
        models.SalaryMonth.deleted == False,
    ).all() if job_ids else []
    monthly_income = sum(sm.net_amount for sm in salary_months)

    expenses = db.query(models.Expense).filter(
        models.Expense.person_id == user.id,
        models.Expense.deleted == False,
        models.Expense.date >= date(today.year, today.month, 1),
    ).all()
    monthly_expenses = sum(e.amount for e in expenses)

    # Build readable context
    lines = [f"User: {user.name or 'User'}"]
    lines.append(f"Today: {today.isoformat()}")
    lines.append("")

    # Goals summary
    lines.append(f"GOALS ({len(goals)} total):")
    for g in goals[:10]:  # cap at 10
        status_label = g.status or "active"
        pct = round(g._stored_percentage or 0)
        lines.append(f"  - [{status_label}] {g.name} ({pct}% complete)")
        if g.target_date:
            lines.append(f"    Due: {g.target_date}")

    lines.append("")

    # Tasks summary
    completed = sum(1 for t in tasks if t.completed)
    pending = len(tasks) - completed
    lines.append(f"TASKS: {len(tasks)} total — {completed} done, {pending} pending")
    overdue = [t for t in tasks if not t.completed and t.due_date and t.due_date < today]
    if overdue:
        lines.append(f"  Overdue ({len(overdue)}):")
        for t in overdue[:5]:
            lines.append(f"    - {t.name} (due {t.due_date})")

    lines.append("")

    # Finances
    lines.append(f"FINANCES (this month):")
    lines.append(f"  Income:   {monthly_income:,.0f} UZS")
    lines.append(f"  Expenses: {monthly_expenses:,.0f} UZS")
    net = monthly_income - monthly_expenses
    lines.append(f"  Net:      {net:,.0f} UZS")

    return "\n".join(lines)


SYSTEM_PROMPT = """You are an elite personal advisor — part strategist, part coach, part analyst — embedded directly in the user's life tracking system. You have real-time access to their goals, tasks, and financial data.

How you communicate:
- Precise and direct. No filler, no hype, no "great question!". Get to the point.
- Intelligent and specific. Reference exact numbers, goal names, deadlines from their data. Vague advice is useless.
- Structured when complexity demands it. Use short paragraphs or bullets when listing multiple points — never walls of text.
- Honest over comfortable. If something looks off or risky, say so clearly.
- No cheerleading. Confidence comes from substance, not encouragement phrases.
- Never end with "How does that sound?" or "Let me know if you need anything!" — that's filler. End with a concrete next step or sharp insight.

Voice: think a top-tier consultant who also genuinely cares about the person's outcomes. Sharp, warm when it counts, never performative.

User's current data:
{context}
"""


async def _stream_groq(messages: list, context: str):
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
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI coach is not configured. Set GROQ_API_KEY.",
        )

    context = _build_user_context(current_user, db)
    messages = [m.model_dump() for m in request.messages]

    return StreamingResponse(
        _stream_groq(messages, context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
