import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { sign } from 'jsonwebtoken'

// Пример: src/app/api/auth/register/route.ts

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { name, surname, email, password } = body

        // Валидация
        if (!name || !surname || !email || !password) {
            return NextResponse.json(
                { error: 'Все поля обязательны' },
                { status: 400 }
            )
        }

        if (password.length < 8) {
            return NextResponse.json(
                { error: 'Пароль должен быть минимум 8 символов' },
                { status: 400 }
            )
        }

        // Проверка email формата
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'Неверный формат email' },
                { status: 400 }
            )
        }

        // TODO: Проверка существования пользователя в БД
        // const existingUser = await db.person.findUnique({
        //     where: { email }
        // })
        // if (existingUser) {
        //     return NextResponse.json(
        //         { error: 'Пользователь с таким email уже существует' },
        //         { status: 409 }
        //     )
        // }

        // Хеширование пароля
        const hashedPassword = await hash(password, 12)

        // TODO: Создание пользователя в БД
        // const user = await db.person.create({
        //     data: {
        //         name,
        //         surname,
        //         email,
        //         password: hashedPassword,
        //         timezone: 'UTC',
        //         initial_balance: 0,
        //     }
        // })

        // Временный mock пользователя для примера
        const user = {
            id: 'temp-user-id',
            name,
            surname,
            email,
            created_at: new Date().toISOString(),
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
            { status: 201 }
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
        console.error('Registration error:', error)
        return NextResponse.json(
            { error: 'Ошибка при регистрации' },
            { status: 500 }
        )
    }
}