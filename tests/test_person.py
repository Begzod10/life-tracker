"""
Test suite for progress tracking functionality
Tests automatic percentage calculation when tasks are created, updated, or deleted
"""
import pytest
from datetime import date


class TestProgressCalculation:
    """Test automatic progress calculation"""

    def test_goal_starts_at_zero_percent(self, client, sample_person):
        """New goal should start at 0% when no tasks exist"""
        response = client.post(
            "/api/goals/",
            json={
                "name": "Test Goal",
                "person_id": sample_person["id"],
                "category": "Learning"
            }
        )
        assert response.status_code == 201
        goal = response.json()
        assert goal["percentage"] == 0.0

    def test_adding_task_keeps_percentage_at_zero(self, client, sample_goal):
        """Adding an incomplete task should keep percentage at 0%"""
        response = client.post(
            "/api/tasks/",
            json={
                "name": "First Task",
                "goal_id": sample_goal["id"],
                "task_type": "daily"
            }
        )
        assert response.status_code == 200

        # Check goal percentage
        goal_response = client.get(f"/api/goals/{sample_goal['id']}")
        goal = goal_response.json()
        assert goal["percentage"] == 0.0

    def test_completing_one_of_two_tasks_shows_50_percent(self, client, sample_goal):
        """Completing 1 out of 2 tasks should show 50% progress"""
        # Create 2 tasks
        client.post("/api/tasks/", json={
            "name": "Task 1",
            "goal_id": sample_goal["id"],
            "task_type": "daily"
        })
        task2_response = client.post("/api/tasks/", json={
            "name": "Task 2",
            "goal_id": sample_goal["id"],
            "task_type": "daily"
        })
        task2 = task2_response.json()

        # Complete one task
        client.put(f"/api/tasks/{task2['id']}", json={"completed": True})

        # Check percentage
        goal_response = client.get(f"/api/goals/{sample_goal['id']}")
        goal = goal_response.json()
        assert goal["percentage"] == 50.0

    def test_completing_all_tasks_shows_100_percent(self, client, sample_goal):
        """Completing all tasks should show 100% progress"""
        # Create 3 tasks
        task_ids = []
        for i in range(3):
            response = client.post("/api/tasks/", json={
                "name": f"Task {i + 1}",
                "goal_id": sample_goal["id"],
                "task_type": "daily"
            })
            task_ids.append(response.json()["id"])

        # Complete all tasks
        for task_id in task_ids:
            client.put(f"/api/tasks/{task_id}", json={"completed": True})

        # Check percentage
        goal_response = client.get(f"/api/goals/{sample_goal['id']}")
        goal = goal_response.json()
        assert goal["percentage"] == 100.0

    def test_uncompleting_task_reduces_percentage(self, client, sample_goal):
        """Marking a completed task as incomplete should reduce percentage"""
        # Create and complete 2 tasks
        task_ids = []
        for i in range(2):
            response = client.post("/api/tasks/", json={
                "name": f"Task {i + 1}",
                "goal_id": sample_goal["id"]
            })
            task_id = response.json()["id"]
            task_ids.append(task_id)
            client.put(f"/api/tasks/{task_id}", json={"completed": True})

        # Should be 100%
        goal = client.get(f"/api/goals/{sample_goal['id']}").json()
        assert goal["percentage"] == 100.0

        # Uncomplete one task
        client.put(f"/api/tasks/{task_ids[0]}", json={"completed": False})

        # Should be 50%
        goal = client.get(f"/api/goals/{sample_goal['id']}").json()
        assert goal["percentage"] == 50.0

    def test_deleting_task_recalculates_percentage(self, client, sample_goal):
        """Deleting a task should recalculate percentage"""
        # Create 4 tasks, complete 2
        task_ids = []
        for i in range(4):
            response = client.post("/api/tasks/", json={
                "name": f"Task {i + 1}",
                "goal_id": sample_goal["id"]
            })
            task_id = response.json()["id"]
            task_ids.append(task_id)
            if i < 2:  # Complete first 2
                client.put(f"/api/tasks/{task_id}", json={"completed": True})

        # Should be 50% (2/4)
        goal = client.get(f"/api/goals/{sample_goal['id']}").json()
        assert goal["percentage"] == 50.0

        # Delete one incomplete task
        client.delete(f"/api/tasks/{task_ids[2]}")

        # Should be 66.67% (2/3)
        goal = client.get(f"/api/goals/{sample_goal['id']}").json()
        assert goal["percentage"] == pytest.approx(66.67, rel=0.01)

    def test_quick_complete_endpoint(self, client, sample_goal):
        """Test the quick complete endpoint updates percentage"""
        # Create a task
        response = client.post("/api/tasks/", json={
            "name": "Quick Task",
            "goal_id": sample_goal["id"]
        })
        task_id = response.json()["id"]

        # Use quick complete endpoint
        complete_response = client.post(f"/api/tasks/{task_id}/complete")
        assert complete_response.status_code == 200

        # Check percentage
        goal = client.get(f"/api/goals/{sample_goal['id']}").json()
        assert goal["percentage"] == 100.0

    def test_quick_uncomplete_endpoint(self, client, sample_goal):
        """Test the quick uncomplete endpoint updates percentage"""
        # Create and complete a task
        response = client.post("/api/tasks/", json={
            "name": "Quick Task",
            "goal_id": sample_goal["id"]
        })
        task_id = response.json()["id"]
        client.post(f"/api/tasks/{task_id}/complete")

        # Uncomplete it
        uncomplete_response = client.post(f"/api/tasks/{task_id}/uncomplete")
        assert uncomplete_response.status_code == 200

        # Check percentage
        goal = client.get(f"/api/goals/{sample_goal['id']}").json()
        assert goal["percentage"] == 0.0


class TestHybridCalculation:
    """Test hybrid calculation method (manual + tasks)"""

    def test_manual_percentage_with_target_value(self, client, sample_person):
        """Goal with target_value should use manual percentage"""
        response = client.post("/api/goals/", json={
            "name": "IELTS Goal",
            "person_id": sample_person["id"],
            "target_value": 6.5,
            "current_value": 5.5,
            "unit": "score"
        })
        goal = response.json()

        # Should calculate (5.5 / 6.5) * 100 = 84.62%
        assert goal["percentage"] == pytest.approx(84.62, rel=0.01)

    def test_updating_current_value_updates_percentage(self, client, sample_person):
        """Updating current_value should recalculate percentage"""
        # Create goal with target
        response = client.post("/api/goals/", json={
            "name": "IELTS Goal",
            "person_id": sample_person["id"],
            "target_value": 6.5,
            "current_value": 5.5
        })
        goal_id = response.json()["id"]

        # Update current_value
        client.put(f"/api/goals/{goal_id}", json={"current_value": 6.0})

        # Should be (6.0 / 6.5) * 100 = 92.31%
        goal = client.get(f"/api/goals/{goal_id}").json()
        assert goal["percentage"] == pytest.approx(92.31, rel=0.01)

    def test_goal_without_target_uses_task_completion(self, client, sample_person):
        """Goal without target_value should use task completion"""
        # Create goal without target_value
        response = client.post("/api/goals/", json={
            "name": "Learning Goal",
            "person_id": sample_person["id"]
        })
        goal_id = response.json()["id"]

        # Add and complete tasks
        for i in range(5):
            task_response = client.post("/api/tasks/", json={
                "name": f"Task {i + 1}",
                "goal_id": goal_id
            })
            if i < 3:  # Complete 3 out of 5
                task_id = task_response.json()["id"]
                client.put(f"/api/tasks/{task_id}", json={"completed": True})

        # Should be 60% (3/5)
        goal = client.get(f"/api/goals/{goal_id}").json()
        assert goal["percentage"] == 60.0


class TestProgressStatistics:
    """Test progress statistics endpoints"""

    def test_get_progress_details(self, client, sample_goal):
        """Test getting detailed progress statistics"""
        # Create tasks with different priorities
        tasks_data = [
            {"name": "High 1", "priority": "high", "goal_id": sample_goal["id"]},
            {"name": "High 2", "priority": "high", "goal_id": sample_goal["id"]},
            {"name": "Medium 1", "priority": "medium", "goal_id": sample_goal["id"]},
            {"name": "Low 1", "priority": "low", "goal_id": sample_goal["id"]},
        ]

        task_ids = []
        for task_data in tasks_data:
            response = client.post("/api/tasks/", json=task_data)
            task_ids.append(response.json()["id"])

        # Complete the two high priority tasks
        for task_id in task_ids[:2]:
            client.put(f"/api/tasks/{task_id}", json={"completed": True})

        # Get progress details
        response = client.get(f"/api/goals/{sample_goal['id']}/progress-details")
        stats = response.json()

        assert stats["total_tasks"] == 4
        assert stats["completed_tasks"] == 2
        assert stats["remaining_tasks"] == 2
        assert stats["high_priority_tasks"] == 2
        assert stats["high_priority_completed"] == 2
        assert "percentages" in stats
        assert stats["percentages"]["simple"] == 50.0

    def test_get_goal_with_stats(self, client, sample_goal):
        """Test getting goal with statistics"""
        # Create and complete some tasks
        for i in range(3):
            response = client.post("/api/tasks/", json={
                "name": f"Task {i + 1}",
                "goal_id": sample_goal["id"]
            })
            if i == 0:  # Complete only the first one
                task_id = response.json()["id"]
                client.put(f"/api/tasks/{task_id}", json={"completed": True})

        # Get goal with stats
        response = client.get(f"/api/goals/{sample_goal['id']}/with-stats")
        goal = response.json()

        assert goal["total_tasks"] == 3
        assert goal["completed_tasks"] == 1
        assert goal["task_completion_percentage"] == pytest.approx(33.33, rel=0.01)

    def test_task_statistics_endpoint(self, client, sample_goal):
        """Test the task statistics endpoint"""
        # Create tasks
        for i in range(6):
            priority = "high" if i < 2 else "medium" if i < 4 else "low"
            task_type = "daily" if i < 3 else "weekly"
            response = client.post("/api/tasks/", json={
                "name": f"Task {i + 1}",
                "goal_id": sample_goal["id"],
                "priority": priority,
                "task_type": task_type
            })
            if i % 2 == 0:  # Complete every other task
                task_id = response.json()["id"]
                client.put(f"/api/tasks/{task_id}", json={"completed": True})

        # Get statistics
        response = client.get(f"/api/tasks/goal/{sample_goal['id']}/statistics")
        stats = response.json()

        assert stats["total_tasks"] == 6
        assert stats["completed_tasks"] == 3
        assert "breakdown_by_priority" in stats
        assert "breakdown_by_type" in stats


class TestManualRecalculation:
    """Test manual recalculation endpoints"""

    def test_manual_recalculation_simple(self, client, sample_goal):
        """Test manually triggering simple recalculation"""
        # Create tasks
        for i in range(4):
            client.post("/api/tasks/", json={
                "name": f"Task {i + 1}",
                "goal_id": sample_goal["id"]
            })

        # Manually recalculate
        response = client.post(
            f"/api/goals/{sample_goal['id']}/recalculate-progress?method=simple"
        )
        assert response.status_code == 200
        goal = response.json()
        assert goal["percentage"] == 0.0

    def test_recalculation_with_different_methods(self, client, sample_goal):
        """Test recalculation with different methods"""
        # Create tasks with different priorities
        task_data = [
            {"name": "High", "priority": "high", "goal_id": sample_goal["id"]},
            {"name": "Medium", "priority": "medium", "goal_id": sample_goal["id"]},
            {"name": "Low", "priority": "low", "goal_id": sample_goal["id"]},
        ]

        for task in task_data:
            response = client.post("/api/tasks/", json=task)
            # Complete all tasks
            task_id = response.json()["id"]
            client.put(f"/api/tasks/{task_id}", json={"completed": True})

        # Simple method should be 100%
        response = client.post(
            f"/api/goals/{sample_goal['id']}/recalculate-progress?method=simple"
        )
        assert response.json()["percentage"] == 100.0

        # Weighted method should also be 100% (all completed)
        response = client.post(
            f"/api/goals/{sample_goal['id']}/recalculate-progress?method=weighted"
        )
        assert response.json()["percentage"] == 100.0


class TestEdgeCases:
    """Test edge cases and error handling"""

    def test_percentage_never_exceeds_100(self, client, sample_person):
        """Ensure percentage is clamped at 100%"""
        # Create goal with manual tracking
        response = client.post("/api/goals/", json={
            "name": "Test Goal",
            "person_id": sample_person["id"],
            "target_value": 10.0,
            "current_value": 15.0  # Over target
        })
        goal = response.json()

        # Should be clamped at 100%
        assert goal["percentage"] == 100.0

    def test_goal_with_no_tasks(self, client, sample_goal):
        """Goal with no tasks should have 0% progress"""
        response = client.get(f"/api/goals/{sample_goal['id']}")
        goal = response.json()
        assert goal["percentage"] == 0.0

    def test_marking_completed_task_as_completed_again_fails(self, client, sample_goal):
        """Trying to complete an already completed task should fail"""
        # Create and complete a task
        response = client.post("/api/tasks/", json={
            "name": "Task",
            "goal_id": sample_goal["id"]
        })
        task_id = response.json()["id"]
        client.post(f"/api/tasks/{task_id}/complete")

        # Try to complete again
        response = client.post(f"/api/tasks/{task_id}/complete")
        assert response.status_code == 400

    def test_marking_incomplete_task_as_incomplete_fails(self, client, sample_goal):
        """Trying to uncomplete an incomplete task should fail"""
        # Create a task (not completed)
        response = client.post("/api/tasks/", json={
            "name": "Task",
            "goal_id": sample_goal["id"]
        })
        task_id = response.json()["id"]

        # Try to uncomplete
        response = client.post(f"/api/tasks/{task_id}/uncomplete")
        assert response.status_code == 400


class TestGoalsOverview:
    """Test goals overview statistics"""

    def test_overview_with_multiple_goals(self, client, sample_person):
        """Test getting overview statistics for multiple goals"""
        # Create multiple goals with different statuses
        goals = [
            {"name": "Active Goal 1", "person_id": sample_person["id"], "status": "active"},
            {"name": "Active Goal 2", "person_id": sample_person["id"], "status": "active"},
            {"name": "Completed Goal", "person_id": sample_person["id"], "status": "completed"},
        ]

        for goal_data in goals:
            client.post("/api/goals/", json=goal_data)

        # Get overview
        response = client.get(f"/api/goals/statistics/overview?person_id={sample_person['id']}")
        stats = response.json()

        assert stats["total_goals"] == 3
        assert stats["by_status"]["active"] == 2
        assert stats["by_status"]["completed"] == 1

    def test_overview_calculates_average_completion(self, client, sample_person):
        """Test that overview calculates average completion correctly"""
        # Create goals with known percentages
        goal_ids = []
        for i in range(3):
            response = client.post("/api/goals/", json={
                "name": f"Goal {i + 1}",
                "person_id": sample_person["id"],
                "target_value": 10.0,
                "current_value": i * 2.5  # 0, 2.5, 5.0
            })
            goal_ids.append(response.json()["id"])

        # Get overview
        response = client.get(f"/api/goals/statistics/overview?person_id={sample_person['id']}")
        stats = response.json()

        # Average should be (0 + 25 + 50) / 3 = 25
        assert stats["average_completion"] == 25.0