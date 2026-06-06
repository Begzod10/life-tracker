import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const response = await fetch('http://127.0.0.1:8030/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const data = await response.json()
        if (!response.ok) {
            return NextResponse.json(data, { status: response.status })
        }
        return NextResponse.json(data, { status: 200 })
    } catch (error) {
        console.error('Login proxy error:', error)
        return NextResponse.json({ error: 'Ошибка авторизации' }, { status: 500 })
    }
}