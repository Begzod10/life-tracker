import { NextRequest, NextResponse } from 'next/server'

// src/app/api/tasks/[id]/route.ts

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // Исправлено: params теперь Promise в Next.js 15+
) {
    const id = (await context.params).id

    // Mock data based on user request example
    const task = {
        id: Number(id),
        name: "dsfsdf",
        description: "sdfsdf",
        task_type: "weekly",
        due_date: "2026-02-10",
        priority: "high",
        estimated_duration: 30,
        goal_id: 6,
        completed: false,
        completed_at: null,
        created_at: "2026-01-31T13:13:32.705438"
    }

    return NextResponse.json(task)
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const id = (await context.params).id
    const body = await request.json()

    // В реальности здесь было бы обновление в БД
    console.log(`Updating task ${id} with data:`, body)

    // Возвращаем обновленные данные (mock)
    return NextResponse.json({
        id: Number(id),
        ...body,
        updated_at: new Date().toISOString()
    })
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const id = (await context.params).id

    // В реальности удаление из БД
    console.log(`Deleting task ${id}`)

    return NextResponse.json({ success: true })
}
