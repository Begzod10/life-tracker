import { NextRequest, NextResponse } from 'next/server'
import { sign } from 'jsonwebtoken'

// src/app/api/auth/google/route.ts

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { token: googleIdToken } = body

        if (!googleIdToken) {
            return NextResponse.json(
                { error: 'Токен не предоставлен' },
                { status: 400 }
            )
        }

        // В реальном приложении здесь нужно:
        // 1. Проверить googleIdToken через Google API
        // 2. Получить email и данные пользователя из токена

        // MOCK: Декодируем токен (в реальности нужно верифицировать подпись)
        // Для демонстрации просто создаем mock пользователя

        // Генерируем случайный ID для пользователя или берем из "базы"
        const mockUser = {
            id: 'google-mock-user-id',
            name: 'Google User',
            surname: 'Test',
            email: 'user@gmail.com', // В реальности берем из токена
            avatar: null
        }

        // Создание JWT токена
        const accessToken = sign(
            {
                userId: mockUser.id,
                email: mockUser.email,
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        // Создание ответа с cookie
        const response = NextResponse.json(
            {
                success: true,
                access_token: accessToken,
                refresh_token: accessToken, // Для упрощения используем тот же токен
                user: mockUser
            },
            { status: 200 }
        )

        // Установка HTTP-only cookie с токеном
        response.cookies.set('auth-token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 дней
            path: '/',
        })

        return response

    } catch (error) {
        console.error('Google Auth Error:', error)
        return NextResponse.json(
            { error: 'Ошибка авторизации Google' },
            { status: 500 }
        )
    }
}
