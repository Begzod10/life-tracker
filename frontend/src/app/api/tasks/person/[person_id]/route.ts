import { NextRequest, NextResponse } from 'next/server'

// src/app/api/tasks/person/[person_id]/route.ts

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ person_id: string }> }
) {
    const personId = (await context.params).person_id

    // Mock data - same as in the main tasks route but supposedly filtered by person
    const tasks = [
        {
            id: 1,
            name: "Complete Project Proposal",
            description: "Draft and finalize the project proposal for the new client.",
            task_type: "weekly",
            due_date: "2026-02-20",
            priority: "high",
            estimated_duration: 120,
            goal_id: 1,
            completed: false,
            completed_at: null,
            created_at: "2026-02-15T10:00:00Z",
            person_id: Number(personId) // Assigning to requested person for mock purposes
        },
        {
            id: 2,
            name: "Gym Workout",
            description: "Leg day routine.",
            task_type: "daily",
            due_date: "2026-02-17",
            priority: "medium",
            estimated_duration: 60,
            goal_id: 3,
            completed: true,
            completed_at: "2026-02-17T09:00:00Z",
            created_at: "2026-02-16T08:00:00Z",
            person_id: Number(personId)
        },
        {
            id: 3,
            name: "Read 30 pages",
            description: "Read 'Atomic Habits'.",
            task_type: "daily",
            due_date: "2026-02-17",
            priority: "low",
            estimated_duration: 45,
            goal_id: 5,
            completed: false,
            completed_at: null,
            created_at: "2026-02-16T20:00:00Z",
            person_id: Number(personId)
        },
        {
            id: 4,
            name: "Weekly Review",
            description: "Review progress for the week and plan next week.",
            task_type: "weekly",
            due_date: "2026-02-22",
            priority: "medium",
            estimated_duration: 30,
            goal_id: 1,
            completed: false,
            completed_at: null,
            created_at: "2026-02-15T11:00:00Z",
            person_id: Number(personId)
        }
    ]

    return NextResponse.json(tasks)
}
