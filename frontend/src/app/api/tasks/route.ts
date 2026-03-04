import { NextRequest, NextResponse } from 'next/server'

// src/app/api/tasks/route.ts

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const personId = searchParams.get('person_id')
    const goalId = searchParams.get('goal_id')

    // Mock data
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
            created_at: "2026-02-15T10:00:00Z"
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
            created_at: "2026-02-16T08:00:00Z"
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
            created_at: "2026-02-16T20:00:00Z"
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
            created_at: "2026-02-15T11:00:00Z"
        }
    ]

    // Simple filtering simulation
    let filteredTasks = tasks

    if (goalId) {
        filteredTasks = filteredTasks.filter(t => t.goal_id === Number(goalId))
    }

    // In a real app, we would filter by person_id (user ownership) as well.
    // Since this is mock data, we'll just return it all if person_id is present,
    // assuming the mocked tasks belong to this person.

    return NextResponse.json(filteredTasks)
}

export async function POST(request: NextRequest) {
    const body = await request.json()

    // Mock creation
    const newTask = {
        id: Math.floor(Math.random() * 1000) + 10,
        ...body,
        created_at: new Date().toISOString(),
        completed: false,
        completed_at: null
    }

    return NextResponse.json(newTask)
}
