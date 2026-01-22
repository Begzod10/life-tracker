from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db
from app.services.progress_service import ProgressService

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"]
)


@router.get('/', response_model=List[schemas.Task])
def get_tasks(db: Session = Depends(get_db)):
    """Get all tasks"""
    return db.query(models.Task).all()


@router.get('/{task_id}', response_model=schemas.Task)
def get_task(task_id: int, db: Session = Depends(get_db)):
    """Get a specific task by ID"""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.post('/', response_model=schemas.Task)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    """
    Create a new task and recalculate goal progress.
    Adding a task will update the goal's completion percentage.
    """
    # Verify the goal exists
    goal = db.query(models.Goal).filter(models.Goal.id == task.goal_id).first()
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Goal with id {task.goal_id} not found"
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
def update_task(task_id: int, task: schemas.TaskUpdate, db: Session = Depends(get_db)):
    """
    Update a task and automatically recalculate goal progress.
    When task completion status changes, the goal percentage is updated.
    """
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
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

    # Apply updates to the task
    for key, value in update_data.items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)

    # Recalculate goal progress if completion status changed
    if completion_changed:
        ProgressService.update_goal_percentage(db_task.goal_id, db, method='hybrid')

    return db_task


@router.delete('/{task_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """
    Delete a task and recalculate goal progress.
    Removing a task affects the total count and percentage.
    """
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    goal_id = db_task.goal_id

    db.delete(db_task)
    db.commit()

    # Recalculate goal progress (removing a task changes the total)
    ProgressService.update_goal_percentage(goal_id, db, method='hybrid')

    return


@router.get('/goal/{goal_id}', response_model=List[schemas.Task])
def get_tasks_by_goal(goal_id: int, db: Session = Depends(get_db)):
    """Get all tasks for a specific goal"""
    return db.query(models.Task).filter(models.Task.goal_id == goal_id).all()


@router.post('/{task_id}/mark_task', response_model=schemas.Task)
def mark_task(task_id: int, db: Session = Depends(get_db)):
    """
    Quick endpoint to mark a task as completed.
    Automatically updates goal progress.
    """
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if db_task.completed:
        db_task.completed = False
        db_task.completed_at = None
    else:
        db_task.completed = True
        db_task.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(db_task)

    # Recalculate goal progress
    ProgressService.update_goal_percentage(db_task.goal_id, db, method='hybrid')

    return db_task


@router.get('/goal/{goal_id}/statistics')
def get_goal_task_statistics(goal_id: int, db: Session = Depends(get_db)):
    """
    Get detailed task statistics for a goal.
    Returns counts by status, priority, and completion percentages.
    """
    # Verify goal exists
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
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
