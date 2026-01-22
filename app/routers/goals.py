from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db
from app.services.progress_service import ProgressService

router = APIRouter(
    prefix="/goals",
    tags=["goals"]
)


@router.post('/', response_model=schemas.Goal, status_code=status.HTTP_201_CREATED)
def create_goal(goal: schemas.GoalCreate, db: Session = Depends(get_db)):
    """Create a new goal"""
    new_goal = models.Goal(**goal.model_dump())
    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)
    return new_goal


@router.get('/', response_model=List[schemas.Goal])
def get_goals(
        status_filter: Optional[str] = Query(None, description="Filter by status: active, completed, paused"),
        category_filter: Optional[str] = Query(None, description="Filter by category"),
        db: Session = Depends(get_db)
):
    """
    Get all goals with optional filters.
    Percentage field shows the latest calculated progress.
    """
    query = db.query(models.Goal)

    if status_filter:
        query = query.filter(models.Goal.status == status_filter)

    if category_filter:
        query = query.filter(models.Goal.category == category_filter)

    return query.all()


@router.get('/{goal_id}', response_model=schemas.Goal)
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    """Get a specific goal by ID with current progress percentage"""
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.get('/{goal_id}/with-stats', response_model=schemas.GoalWithStats)
def get_goal_with_statistics(goal_id: int, db: Session = Depends(get_db)):
    """
    Get a goal with detailed statistics including:
    - Total tasks and completed tasks
    - Task completion percentage
    - Manual percentage (if target_value exists)
    - Current stored percentage
    """
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Get progress details
    progress_details = ProgressService.get_goal_progress_details(goal_id, db)

    # Create response with statistics
    goal_dict = {
        **goal.__dict__,
        'total_tasks': progress_details['total_tasks'],
        'completed_tasks': progress_details['completed_tasks'],
        'task_completion_percentage': progress_details['percentages']['simple'],
        'manual_percentage': goal.calculate_manual_percentage()
    }

    return goal_dict


@router.put('/{goal_id}', response_model=schemas.Goal)
def update_goal(goal_id: int, goal: schemas.GoalUpdate, db: Session = Depends(get_db)):
    """
    Update a goal. If current_value is updated and target_value exists,
    the percentage will be recalculated based on manual progress.
    """
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not db_goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    update_data = goal.model_dump(exclude_unset=True)

    # Track if current_value changed
    current_value_changed = 'current_value' in update_data

    # Apply updates
    for key, value in update_data.items():
        setattr(db_goal, key, value)

    db.commit()
    db.refresh(db_goal)

    # Recalculate percentage if current_value changed
    if current_value_changed:
        ProgressService.update_goal_percentage(goal_id, db, method='hybrid')
        db.refresh(db_goal)

    return db_goal


@router.delete('/{goal_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    """Delete a goal and all associated tasks"""
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not db_goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    db.delete(db_goal)
    db.commit()
    return


@router.post('/{goal_id}/recalculate-progress', response_model=schemas.Goal)
def recalculate_goal_progress(
        goal_id: int,
        method: str = Query('hybrid', description="Calculation method: simple, weighted, subtasks, hybrid"),
        db: Session = Depends(get_db)
):
    """
    Manually trigger recalculation of goal progress.

    Methods:
    - simple: Count completed tasks / total tasks
    - weighted: Weight tasks by priority (high=3, medium=2, low=1)
    - subtasks: Include subtask completion in calculation
    - hybrid: Use manual progress if available, otherwise use simple task counting
    """
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Recalculate with specified method
    new_percentage = ProgressService.update_goal_percentage(goal_id, db, method=method)

    if new_percentage is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to calculate progress"
        )

    db.refresh(goal)
    return goal


@router.get('/{goal_id}/progress-details')
def get_goal_progress_details(goal_id: int, db: Session = Depends(get_db)):
    """
    Get comprehensive progress details for a goal.

    Returns:
    - Task counts and completion statistics
    - Multiple percentage calculations (simple, weighted, with subtasks, hybrid)
    - Priority breakdowns
    - Target vs current values
    """
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    return ProgressService.get_goal_progress_details(goal_id, db)


@router.get('/person/{person_id}', response_model=List[schemas.Goal])
def get_goals_by_person(
        person_id: int,
        include_completed: bool = Query(True, description="Include completed goals"),
        db: Session = Depends(get_db)
):
    """Get all goals for a specific person"""
    query = db.query(models.Goal).filter(models.Goal.person_id == person_id)

    if not include_completed:
        query = query.filter(models.Goal.status != 'completed')

    return query.all()


@router.post('/{goal_id}/complete', response_model=schemas.Goal)
def mark_goal_complete(goal_id: int, db: Session = Depends(get_db)):
    """
    Mark a goal as completed.
    Sets status to 'completed' and percentage to 100.
    """
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    if goal.status == 'completed':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Goal is already completed"
        )

    goal.status = 'completed'
    goal.percentage = 100.0

    # If target_value exists, set current_value to target_value
    if goal.target_value:
        goal.current_value = goal.target_value

    db.commit()
    db.refresh(goal)

    return goal


@router.get('/statistics/overview')
def get_all_goals_overview(
        person_id: Optional[int] = Query(None, description="Filter by person ID"),
        db: Session = Depends(get_db)
):
    """
    Get overview statistics for all goals.

    Returns:
    - Total goals by status
    - Average completion percentage
    - Goals on track vs behind schedule
    - Total tasks and completion rate
    """
    query = db.query(models.Goal)

    if person_id:
        query = query.filter(models.Goal.person_id == person_id)

    goals = query.all()

    if not goals:
        return {
            'total_goals': 0,
            'by_status': {},
            'average_completion': 0,
            'total_tasks': 0,
            'total_completed_tasks': 0
        }

    # Calculate statistics
    by_status = {}
    total_percentage = 0
    total_tasks = 0
    total_completed = 0

    for goal in goals:
        # Count by status
        status = goal.status
        by_status[status] = by_status.get(status, 0) + 1

        # Sum percentages
        total_percentage += goal.percentage

        # Count tasks
        tasks = db.query(models.Task).filter(models.Task.goal_id == goal.id).all()
        total_tasks += len(tasks)
        total_completed += sum(1 for t in tasks if t.completed)

    avg_completion = total_percentage / len(goals) if goals else 0

    return {
        'total_goals': len(goals),
        'by_status': by_status,
        'average_completion': round(avg_completion, 2),
        'total_tasks': total_tasks,
        'total_completed_tasks': total_completed,
        'overall_task_completion': round((total_completed / total_tasks * 100), 2) if total_tasks > 0 else 0
    }
