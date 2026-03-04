import { NextResponse } from 'next/server'
import { mockProgressLogs } from '@/lib/data/mock'
import { ProgressLog } from '@/types'

export async function POST(request: Request) {
    try {
        const body = await request.json()

        // Basic validation
        if (!body.goal_id || !body.log_date) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        const newLog: ProgressLog = {
            id: Math.floor(Math.random() * 1000000), // Simple ID generation
            created_at: new Date().toISOString(),
            ...body
        }

        // Add to mock data
        mockProgressLogs.push(newLog)

        return NextResponse.json(newLog, { status: 201 })
    } catch (error) {
        console.error('Error creating progress log:', error)
        return NextResponse.json(
            { error: 'Failed to create progress log' },
            { status: 500 }
        )
    }
}
