"""
Progress Calculation Service
Handles calculation of goal progress based on task completion
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from app import models


class ProgressService:
    """Service for calculating and updating goal progress"""

    @staticmethod
    def calculate_task_completion_percentage(goal_id: int, db: Session) -> float:
        """
        Calculate goal progress based on completed tasks.

        Args:
            goal_id: The ID of the goal
            db: Database session

        Returns:
            Float representing completion percentage (0-100)
        """
        # Get total task count for this goal
        total_tasks = db.query(func.count(models.Task.id)) \
            .filter(models.Task.goal_id == goal_id) \
            .scalar()

        if total_tasks == 0:
            return 0.0

        # Get completed task count
        completed_tasks = db.query(func.count(models.Task.id)) \
            .filter(
            models.Task.goal_id == goal_id,
            models.Task.completed == True
        ).scalar()

        # Calculate percentage
        percentage = (completed_tasks / total_tasks) * 100
        return round(percentage, 2)

    @staticmethod
    def calculate_weighted_task_percentage(goal_id: int, db: Session) -> float:
        """
        Calculate goal progress with weighted tasks (by priority).
        High priority = 3 points, Medium = 2, Low = 1

        Args:
            goal_id: The ID of the goal
            db: Database session

        Returns:
            Float representing weighted completion percentage (0-100)
        """
        # Define priority weights
        priority_weights = {
            'high': 3,
            'medium': 2,
            'low': 1
        }

        # Get all tasks for this goal
        tasks = db.query(models.Task) \
            .filter(models.Task.goal_id == goal_id) \
            .all()

        if not tasks:
            return 0.0

        total_weight = 0
        completed_weight = 0

        for task in tasks:
            weight = priority_weights.get(task.priority.lower(), 1)
            total_weight += weight

            if task.completed:
                completed_weight += weight

        if total_weight == 0:
            return 0.0

        percentage = (completed_weight / total_weight) * 100
        return round(percentage, 2)

    @staticmethod
    def calculate_progress_with_subtasks(goal_id: int, db: Session) -> float:
        """
        Calculate progress considering both tasks and subtasks.

        Args:
            goal_id: The ID of the goal
            db: Database session

        Returns:
            Float representing completion percentage (0-100)
        """
        # Get all tasks for this goal
        tasks = db.query(models.Task) \
            .filter(models.Task.goal_id == goal_id) \
            .all()

        if not tasks:
            return 0.0

        total_items = 0
        completed_items = 0

        for task in tasks:
            # Check if task has subtasks
            subtasks = db.query(models.SubTasks) \
                .filter(models.SubTasks.task_id == task.id) \
                .all()

            if subtasks:
                # Task has subtasks - count subtask completion
                total_items += len(subtasks)
                completed_items += sum(1 for st in subtasks if st.completed)
            # else:
            #     # Task has no subtasks - count task itself
            #     total_items += 1
            #     if task.completed:
            #         completed_items += 1

        if total_items == 0:
            return 0.0

        percentage = (completed_items / total_items) * 100
        return round(percentage, 2)

    @staticmethod
    def calculate_hybrid_percentage(goal_id: int, db: Session) -> float:
        """
        Hybrid approach: Use manual progress if available,
        otherwise calculate from tasks.

        Args:
            goal_id: The ID of the goal
            db: Database session

        Returns:
            Float representing completion percentage (0-100)
        """
        goal = db.query(models.Goal) \
            .filter(models.Goal.id == goal_id) \
            .first()

        if not goal:
            return 0.0

        # If target_value exists, use current_value/target_value
        if goal.target_value and goal.target_value > 0:
            manual_percentage = (goal.current_value / goal.target_value) * 100
            return round(min(manual_percentage, 100.0), 2)

        # Otherwise, calculate from tasks
        return ProgressService.calculate_task_completion_percentage(goal_id, db)

    @staticmethod
    def update_goal_percentage(goal_id: int, db: Session,
                               method: str = 'simple') -> Optional[float]:
        """
        Update the stored percentage field in the goal.

        Args:
            goal_id: The ID of the goal
            db: Database session
            method: Calculation method ('simple', 'weighted', 'subtasks', 'hybrid')

        Returns:
            The calculated percentage, or None if goal not found
        """
        goal = db.query(models.Goal) \
            .filter(models.Goal.id == goal_id) \
            .first()

        if not goal:
            return None

        # Calculate based on method
        if method == 'weighted':
            percentage = ProgressService.calculate_weighted_task_percentage(goal_id, db)
        elif method == 'subtasks':
            percentage = ProgressService.calculate_progress_with_subtasks(goal_id, db)
        elif method == 'hybrid':
            percentage = ProgressService.calculate_hybrid_percentage(goal_id, db)
        else:  # 'simple' is default
            percentage = ProgressService.calculate_task_completion_percentage(goal_id, db)

        # Update the goal's percentage field
        goal.percentage = percentage
        db.commit()
        db.refresh(goal)

        return percentage

    @staticmethod
    def get_goal_progress_details(goal_id: int, db: Session) -> dict:
        """
        Get detailed progress information for a goal.

        Args:
            goal_id: The ID of the goal
            db: Database session

        Returns:
            Dictionary with detailed progress information
        """
        goal = db.query(models.Goal) \
            .filter(models.Goal.id == goal_id) \
            .first()

        if not goal:
            return {}

        # Get task statistics
        total_tasks = db.query(func.count(models.Task.id)) \
            .filter(models.Task.goal_id == goal_id) \
            .scalar()

        completed_tasks = db.query(func.count(models.Task.id)) \
            .filter(
            models.Task.goal_id == goal_id,
            models.Task.completed == True
        ).scalar()

        # Get tasks by priority
        high_priority = db.query(func.count(models.Task.id)) \
            .filter(
            models.Task.goal_id == goal_id,
            models.Task.priority == 'high'
        ).scalar()

        high_priority_completed = db.query(func.count(models.Task.id)) \
            .filter(
            models.Task.goal_id == goal_id,
            models.Task.priority == 'high',
            models.Task.completed == True
        ).scalar()

        # Calculate different percentage methods
        simple_percentage = ProgressService.calculate_task_completion_percentage(goal_id, db)
        weighted_percentage = ProgressService.calculate_weighted_task_percentage(goal_id, db)
        subtasks_percentage = ProgressService.calculate_progress_with_subtasks(goal_id, db)
        hybrid_percentage = ProgressService.calculate_hybrid_percentage(goal_id, db)

        return {
            'goal_id': goal_id,
            'goal_name': goal.name,
            'total_tasks': total_tasks,
            'completed_tasks': completed_tasks,
            'remaining_tasks': total_tasks - completed_tasks,
            'high_priority_tasks': high_priority,
            'high_priority_completed': high_priority_completed,
            'percentages': {
                'simple': simple_percentage,
                'weighted': weighted_percentage,
                'with_subtasks': subtasks_percentage,
                'hybrid': hybrid_percentage,
                'stored': goal.percentage
            },
            'target_value': goal.target_value,
            'current_value': goal.current_value,
            'status': goal.status
        }