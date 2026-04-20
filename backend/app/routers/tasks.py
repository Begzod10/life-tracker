from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date, timedelta
from sqlalchemy import or_, func
from app import models, schemas
from app.database import get_db
from app.services.progress_service import ProgressService
from app.dependencies import get_current_active_user

not_deleted = or_(models.Task.deleted == False, models.Task.deleted.is_(None))
router = APIRouter(
    prefix="/tasks",
    tags=["tasks"]
)


@router.get('/', response_model=List[schemas.Task])
def get_tasks(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Get all tasks for current user (via their goals)"""
    return (
        db.query(models.Task)
        .join(models.Goal)
        .filter(models.Goal.person_id == current_user.id, models.Task.deleted == False)
        .all()
    )


@router.get('/recurring-stats')
def get_recurring_stats(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Return completion/missed/streak stats for all recurring tasks of the current user."""
    recurring_tasks = (
        db.query(models.Task)
        .join(models.Goal)
        .filter(
            models.Goal.person_id == current_user.id,
            models.Task.is_recurring == True,
            models.Task.deleted == False,
        )
        .all()
    )

    today = date.today()
    result = {}

    for task in recurring_tasks:
        logs = db.query(models.ProgressLogTask).filter(
            models.ProgressLogTask.task_id == task.id
        ).all()
        completed_dates = {log.log_date for log in logs}

        # Also count days where a linked timetable block was completed
        block_dates = {
            b.date for b in db.query(models.TimeBlock).filter(
                models.TimeBlock.task_id == task.id,
                models.TimeBlock.is_completed == True,
                models.TimeBlock.deleted == False,
            ).all()
        }
        completed_dates = completed_dates | block_dates
        days_completed = len(completed_dates)

        start = task.created_at.date() if task.created_at else today
        total_days = max((today - start).days, 0)  # exclude today
        days_missed = max(total_days - days_completed, 0)

        # Current streak: consecutive days ending yesterday (or today if completed today)
        streak = 0
        check = today if today in completed_dates else today - timedelta(days=1)
        while check in completed_dates:
            streak += 1
            check -= timedelta(days=1)

        result[task.id] = {
            "days_completed": days_completed,
            "days_missed": days_missed,
            "total_days": total_days,
            "streak": streak,
        }

    return result


@router.get('/{task_id}/completion-dates')
def get_task_completion_dates(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Return all dates (ISO strings) when this task was completed — from progress logs + timetable blocks."""
    task = (
        db.query(models.Task)
        .join(models.Goal)
        .filter(models.Task.id == task_id, models.Goal.person_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    log_dates = {
        str(log.log_date)
        for log in db.query(models.ProgressLogTask).filter(
            models.ProgressLogTask.task_id == task_id
        ).all()
    }
    block_dates = {
        str(b.date)
        for b in db.query(models.TimeBlock).filter(
            models.TimeBlock.task_id == task_id,
            models.TimeBlock.is_completed == True,
            models.TimeBlock.deleted == False,
        ).all()
    }
    return sorted(log_dates | block_dates)


@router.get('/deleted/goal/{goal_id}', response_model=List[schemas.Task])
def get_deleted_tasks(goal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Get all soft-deleted tasks for a specific goal"""
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.person_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return db.query(models.Task).filter(models.Task.goal_id == goal_id, models.Task.deleted == True).all()


@router.get('/{task_id}', response_model=schemas.Task)
def get_task(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Get a specific task by ID"""
    task = (
        db.query(models.Task)
        .join(models.Goal)
        .filter(models.Task.id == task_id, models.Goal.person_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.post('/', response_model=schemas.Task)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """
    Create a new task and recalculate goal progress.
    Adding a task will update the goal's completion percentage.
    """
    # Verify the goal exists and belongs to current user
    goal = db.query(models.Goal).filter(models.Goal.id == task.goal_id, models.Goal.person_id == current_user.id).first()
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Goal with id {task.goal_id} not found"
        )

    # Validate task value against goal's target_value
    if task.value is not None and goal.target_value:
        existing_values_sum = db.query(func.coalesce(func.sum(models.Task.value), 0)).filter(
            models.Task.goal_id == task.goal_id,
            models.Task.value.isnot(None),
            or_(models.Task.deleted == False, models.Task.deleted.is_(None))
        ).scalar()
        if existing_values_sum + task.value > goal.target_value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total tasks value ({existing_values_sum + task.value}) would exceed goal's target value ({goal.target_value})"
            )

    # Create the task
    new_task = models.Task(**task.dict())
    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    # Recalculate goal progress (adding a task changes the total)
    ProgressService.update_goal_percentage(task.goal_id, db, method='hybrid')

    return new_task


@router.put('/{task_id}', response_model=schemas.Task)
def update_task(task_id: int, task: schemas.TaskUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """
    Update a task and automatically recalculate goal progress.
    When task completion status changes, the goal percentage is updated.
    """
    db_task = (
        db.query(models.Task)
        .join(models.Goal)
        .filter(models.Task.id == task_id, models.Goal.person_id == current_user.id)
        .first()
    )
    if not db_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # Track if completion status changed
    completion_changed = False
    update_data = task.dict(exclude_unset=True)

    # Check if completed status is being updated
    if 'completed' in update_data:
        old_status = db_task.completed
        new_status = update_data['completed']

        if old_status != new_status:
            completion_changed = True

            # If marking as completed, set completed_at timestamp
            if new_status:
                update_data['completed_at'] = datetime.utcnow()
            else:
                # If unmarking completion, clear completed_at
                update_data['completed_at'] = None

    # Validate task value against goal's target_value
    if 'value' in update_data and update_data['value'] is not None:
        goal = db.query(models.Goal).filter(models.Goal.id == db_task.goal_id).first()
        if goal and goal.target_value:
            existing_values_sum = db.query(func.coalesce(func.sum(models.Task.value), 0)).filter(
                models.Task.goal_id == db_task.goal_id,
                models.Task.id != db_task.id,
                models.Task.value.isnot(None),
                or_(models.Task.deleted == False, models.Task.deleted.is_(None))
            ).scalar()
            if existing_values_sum + update_data['value'] > goal.target_value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Total tasks value ({existing_values_sum + update_data['value']}) would exceed goal's target value ({goal.target_value})"
                )

    # Apply updates to the task
    for key, value in update_data.items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)

    # Recalculate goal progress if completion status changed
    if completion_changed:
        ProgressService.update_goal_percentage(db_task.goal_id, db, method='hybrid')

    return db_task


@router.delete('/{task_id}', status_code=status.HTTP_200_OK)
def delete_task(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """
    Soft-delete a task and recalculate goal progress.
    Removing a task affects the total count and percentage.
    """
    db_task = (
        db.query(models.Task)
        .join(models.Goal)
        .filter(models.Task.id == task_id, models.Goal.person_id == current_user.id)
        .first()
    )
    if not db_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    goal_id = db_task.goal_id

    db_task.deleted = True
    db.commit()

    # Recalculate goal progress (removing a task changes the total)
    ProgressService.update_goal_percentage(goal_id, db, method='hybrid')

    return {"message": "Task deleted"}


@router.get('/person/{person_id}', response_model=List[schemas.Task])
def get_tasks_by_person(person_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Get all tasks for a specific person (across all their goals)"""
    if person_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return db.query(models.Task).join(models.Goal).filter(
        models.Goal.person_id == person_id,
        not_deleted
    ).all()


@router.get('/goal/{goal_id}', response_model=List[schemas.Task])
def get_tasks_by_goal(goal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Get all tasks for a specific goal"""
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.person_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return db.query(models.Task).filter(models.Task.goal_id == goal_id, not_deleted).all()


@router.post('/{task_id}/mark_task', response_model=schemas.Task)
def mark_task(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """
    Mark a task as completed.
    - Regular tasks: toggle completed on/off.
    - Recurring tasks: log the completion in ProgressLogTask, then reset
      completed=False so the task is ready again tomorrow. Due date advances
      by 1 day so it shows up correctly in the list.
    """
    db_task = (
        db.query(models.Task)
        .join(models.Goal)
        .filter(models.Task.id == task_id, models.Goal.person_id == current_user.id)
        .first()
    )
    if not db_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if db_task.is_recurring:
        today = date.today()

        # Check if already logged today (prevent double-completion)
        already_done = db.query(models.ProgressLogTask).filter(
            models.ProgressLogTask.task_id == task_id,
            models.ProgressLogTask.log_date == today,
        ).first()

        if already_done:
            # Un-complete: remove today's log entry
            db.delete(already_done)
            db_task.completed = False
            db_task.completed_at = None
        else:
            # Log completion
            log = models.ProgressLogTask(
                task_id=task_id,
                log_date=today,
                notes="completed",
            )
            db.add(log)
            # Show as completed until midnight, then reset via next call
            db_task.completed = True
            db_task.completed_at = datetime.utcnow()
            db_task.due_date = today + timedelta(days=1)

        db.commit()
        db.refresh(db_task)
        ProgressService.update_goal_percentage(db_task.goal_id, db, method='hybrid')
        return db_task

    # ── Non-recurring: original toggle behaviour ──────────────────────────────
    if db_task.completed:
        db_task.completed = False
        db_task.completed_at = None
    else:
        db_task.completed = True
        db_task.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(db_task)

    goal = db.query(models.Goal).filter(models.Goal.id == db_task.goal_id).first()
    if goal and goal.target_value:
        total_value = db.query(func.coalesce(func.sum(models.Task.value), 0)).filter(
            models.Task.goal_id == db_task.goal_id,
            models.Task.completed == True,
            models.Task.value.isnot(None)
        ).scalar()
        goal.current_value = total_value
        db.commit()
        db.refresh(db_task)

    ProgressService.update_goal_percentage(db_task.goal_id, db, method='hybrid')
    return db_task


@router.get('/goal/{goal_id}/recurring-completions', response_model=List[schemas.RecurringCompletionTask])
def get_recurring_completions(goal_id: int, weeks: int = Query(default=4, ge=1, le=52), db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """
    Return completion history for all recurring tasks in a goal.
    `weeks` controls how far back to look (default: 4 weeks).
    """
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.person_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    since = date.today() - timedelta(weeks=weeks)

    recurring_tasks = db.query(models.Task).filter(
        models.Task.goal_id == goal_id,
        models.Task.is_recurring == True,
        or_(models.Task.deleted == False, models.Task.deleted.is_(None)),
    ).all()

    result = []
    for task in recurring_tasks:
        log_dates = {
            log.log_date
            for log in db.query(models.ProgressLogTask).filter(
                models.ProgressLogTask.task_id == task.id,
                models.ProgressLogTask.log_date >= since,
            ).all()
        }
        block_dates = {
            b.date
            for b in db.query(models.TimeBlock).filter(
                models.TimeBlock.task_id == task.id,
                models.TimeBlock.is_completed == True,
                models.TimeBlock.deleted == False,
                models.TimeBlock.date >= since,
            ).all()
        }
        all_dates = sorted(log_dates | block_dates)

        result.append(schemas.RecurringCompletionTask(
            task_id=task.id,
            task_name=task.name,
            priority=task.priority,
            completions=all_dates,
        ))

    return result


@router.get('/goal/{goal_id}/statistics')
def get_goal_task_statistics(goal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """
    Get detailed task statistics for a goal.
    Returns counts by status, priority, and completion percentages.
    """
    # Verify goal exists and belongs to current user
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, models.Goal.person_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Get detailed progress information
    progress_details = ProgressService.get_goal_progress_details(goal_id, db)

    # Get additional task breakdowns
    tasks = db.query(models.Task).filter(models.Task.goal_id == goal_id).all()

    by_priority = {
        'high': {'total': 0, 'completed': 0},
        'medium': {'total': 0, 'completed': 0},
        'low': {'total': 0, 'completed': 0}
    }

    by_type = {}

    for task in tasks:
        # Count by priority
        priority = task.priority.lower()
        if priority in by_priority:
            by_priority[priority]['total'] += 1
            if task.completed:
                by_priority[priority]['completed'] += 1

        # Count by type
        task_type = task.task_type
        if task_type not in by_type:
            by_type[task_type] = {'total': 0, 'completed': 0}
        by_type[task_type]['total'] += 1
        if task.completed:
            by_type[task_type]['completed'] += 1

    return {
        **progress_details,
        'breakdown_by_priority': by_priority,
        'breakdown_by_type': by_type
    }
