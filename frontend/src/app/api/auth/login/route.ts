import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { sign } from 'jsonwebtoken'

// src/app/api/auth/login/route.ts

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, password } = body

        // Валидация
        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email и пароль обязательны' },
                { status: 400 }
            )
        }

        // TODO: Найти пользователя в базе данных
        // const user = await db.person.findUnique({
        //     where: { email },
        //     select: {
        //         id: true,
        //         name: true,
        //         surname: true,
        //         email: true,
        //         password: true,
        //     }
        // })
        //
        // if (!user) {
        //     return NextResponse.json(
        //         { error: 'Неверный email или пароль' },
        //         { status: 401 }
        //     )
        // }

        // TODO: Проверить пароль
        // const isPasswordValid = await compare(password, user.password)
        // if (!isPasswordValid) {
        //     return NextResponse.json(
        //         { error: 'Неверный email или пароль' },
        //         { status: 401 }
        //     )
        // }

        // Временный mock пользователя для примера
        // В реальном проекте замените на настоящую проверку
        const user = {
            id: 'temp-user-id',
            name: 'Иван',
            surname: 'Петров',
            email: email,
        }

        // Создание JWT токена
        const token = sign(
            {
                userId: user.id,
                email: user.email,
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        // Создание ответа с cookie
        const response = NextResponse.json(
            {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    surname: user.surname,
                    email: user.email,
                },
            },
            { status: 200 }
        )

        // Установка HTTP-only cookie с токеном
        response.cookies.set('auth-token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 дней
            path: '/',
        })

        return response
    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json(
            { error: 'Ошибка при входе' },
            { status: 500 }
        )
    }
}