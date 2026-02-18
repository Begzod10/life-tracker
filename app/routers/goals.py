from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from sqlalchemy import or_, func

from app import models, schemas
from app.database import get_db
from app.services.progress_service import ProgressService
from app.dependencies import get_current_active_user

not_deleted = or_(models.Goal.deleted == False, models.Goal.deleted.is_(None))

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
        person_id: int = Query(..., description="Person ID"),
        status_filter: Optional[str] = Query(None, description="Filter by status: active, completed, paused"),
        category_filter: Optional[str] = Query(None, description="Filter by category"),
        db: Session = Depends(get_db)
):
    """
    Get all goals with optional filters.
    Percentage field shows the latest calculated progress.
    """
    query = db.query(models.Goal).filter(models.Goal.person_id == person_id, not_deleted)

    if status_filter:
        query = query.filter(models.Goal.status == status_filter)

    if category_filter:
        query = query.filter(models.Goal.category == category_filter)

    return query.all()


@router.get('/deleted/person/{person_id}', response_model=List[schemas.Goal])
def get_deleted_goals(person_id: int, db: Session = Depends(get_db)):
    """Get all soft-deleted goals for a specific person"""
    return db.query(models.Goal).filter(models.Goal.person_id == person_id, models.Goal.deleted == True).all()


@router.get('/{goal_id}', response_model=schemas.Goal)
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    """Get a specific goal by ID with current progress percentage"""
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, not_deleted).first()
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
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, not_deleted).first()
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
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id, not_deleted).first()
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


@router.delete('/{goal_id}')
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    """Delete a goal and all associated tasks"""
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not db_goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if db_goal.deleted:
        db_goal.deleted = False
    else:
        db_goal.deleted = True
    db.commit()
    return {"message": "Goal deleted"}


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
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, not_deleted).first()
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
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, not_deleted).first()
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
    query = db.query(models.Goal).filter(models.Goal.person_id == person_id, not_deleted)

    if not include_completed:
        query = query.filter(models.Goal.status != 'completed')

    return query.all()


@router.post('/{goal_id}/complete', response_model=schemas.Goal)
def mark_goal_complete(goal_id: int, db: Session = Depends(get_db)):
    """
    Mark a goal as completed.
    Sets status to 'completed' and percentage to 100.
    """
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id, not_deleted).first()
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
    query = db.query(models.Goal).filter(not_deleted)

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


@router.get('/statistics/person/{person_id}')
def get_goals_statistics_by_person(person_id: int, db: Session = Depends(get_db)):
    """
    Get detailed statistics of all goals for a specific person.

    Returns:
    - Summary: total goals, by status, by category, average completion
    - Per-goal breakdown: tasks, milestones, progress, target vs current value
    """
    all_goals = db.query(models.Goal).filter(
        models.Goal.person_id == person_id
    ).all()

    deleted_goals = sum(1 for g in all_goals if g.deleted)
    goals = [g for g in all_goals if not g.deleted]

    if not all_goals:
        return {
            'person_id': person_id,
            'total_goals': 0,
            'active_goals': 0,
            'deleted_goals': 0,
            'by_status': {},
            'by_category': {},
            'average_completion': 0,
            'total_tasks': 0,
            'total_completed_tasks': 0,
            'overall_task_completion': 0,
            'total_milestones': 0,
            'total_achieved_milestones': 0,
            'goals': []
        }

    by_status = {}
    by_category = {}
    total_percentage = 0
    total_tasks = 0
    total_completed_tasks = 0
    total_milestones = 0
    total_achieved_milestones = 0
    goals_detail = []

    for goal in goals:
        # Count by status
        by_status[goal.status] = by_status.get(goal.status, 0) + 1

        # Count by category
        cat = goal.category or 'uncategorized'
        by_category[cat] = by_category.get(cat, 0) + 1

        total_percentage += goal.percentage

        # Task stats for this goal
        goal_total_tasks = db.query(func.count(models.Task.id)).filter(
            models.Task.goal_id == goal.id,
            or_(models.Task.deleted == False, models.Task.deleted.is_(None))
        ).scalar()
        goal_completed_tasks = db.query(func.count(models.Task.id)).filter(
            models.Task.goal_id == goal.id,
            models.Task.completed == True,
            or_(models.Task.deleted == False, models.Task.deleted.is_(None))
        ).scalar()

        total_tasks += goal_total_tasks
        total_completed_tasks += goal_completed_tasks

        # Milestone stats for this goal
        goal_total_milestones = db.query(func.count(models.Milestone.id)).filter(
            models.Milestone.goal_id == goal.id,
            models.Milestone.deleted == False
        ).scalar()
        goal_achieved_milestones = db.query(func.count(models.Milestone.id)).filter(
            models.Milestone.goal_id == goal.id,
            models.Milestone.achieved == True,
            models.Milestone.deleted == False
        ).scalar()

        total_milestones += goal_total_milestones
        total_achieved_milestones += goal_achieved_milestones

        goals_detail.append({
            'id': goal.id,
            'name': goal.name,
            'category': goal.category,
            'status': goal.status,
            'priority': goal.priority,
            'percentage': goal.percentage,
            'target_value': goal.target_value,
            'current_value': goal.current_value,
            'total_tasks': goal_total_tasks,
            'completed_tasks': goal_completed_tasks,
            'task_completion': round((goal_completed_tasks / goal_total_tasks * 100), 2) if goal_total_tasks > 0 else 0,
            'total_milestones': goal_total_milestones,
            'achieved_milestones': goal_achieved_milestones,
            'start_date': goal.start_date,
            'target_date': goal.target_date,
        })

    avg_completion = round(total_percentage / len(goals), 2)

    return {
        'person_id': person_id,
        'total_goals': len(all_goals),
        'active_goals': len(goals),
        'deleted_goals': deleted_goals,
        'by_status': by_status,
        'by_category': by_category,
        'average_completion': avg_completion,
        'total_tasks': total_tasks,
        'total_completed_tasks': total_completed_tasks,
        'overall_task_completion': round((total_completed_tasks / total_tasks * 100), 2) if total_tasks > 0 else 0,
        'total_milestones': total_milestones,
        'total_achieved_milestones': total_achieved_milestones,
        'goals': goals_detail
    }
