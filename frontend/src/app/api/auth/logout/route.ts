import { NextRequest, NextResponse } from 'next/server'

// src/app/api/auth/logout/route.ts

export async function POST(request: NextRequest) {
    try {
        // Создание ответа
        const response = NextResponse.json(
            { success: true, message: 'Logged out successfully' },
            { status: 200 }
        )

        // Удаление auth cookie
        response.cookies.delete('auth-token')

        return response
    } catch (error) {
        console.error('Logout error:', error)
        return NextResponse.json(
            { error: 'Ошибка при выходе' },
            { status: 500 }
        )
    }
}