import { NextRequest, NextResponse } from 'next/server'
import { verify } from 'jsonwebtoken'

// src/app/api/auth/me/route.ts

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this'

export async function GET(request: NextRequest) {
    try {
        // 1. Попытка получить токен из Authorization header
        const authHeader = request.headers.get('authorization')
        let token = authHeader?.split(' ')[1]

        // 2. Попытка получить из cookies (если нет в header)
        if (!token) {
            token = request.cookies.get('auth-token')?.value || request.cookies.get('access_token')?.value
        }

        if (!token) {
            return NextResponse.json(
                { error: 'Не авторизован' },
                { status: 401 }
            )
        }

        // MOCK: Верификация токена
        try {
            const decoded = verify(token, JWT_SECRET) as any

            // В реальности здесь нужно загрузить пользователя из БД по decoded.userId
            // Mock пользователь
            const user = {
                id: decoded.userId || 'mock-user-id',
                email: decoded.email || 'user@example.com',
                name: decoded.name || 'User', // Может быть undefined если не сохраняли
                surname: decoded.surname || 'Test',
                avatar: null,
                initial_balance: 0, // Пример поля
                created_at: new Date().toISOString()
            }

            return NextResponse.json(user)

        } catch (err) {
            return NextResponse.json(
                { error: 'Неверный токен' },
                { status: 401 }
            )
        }

    } catch (error) {
        console.error('Me API Error:', error)
        return NextResponse.json(
            { error: 'Ошибка сервера' },
            { status: 500 }
        )
    }
}
