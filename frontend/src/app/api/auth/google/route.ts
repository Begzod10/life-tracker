import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const response = await fetch('http://127.0.0.1:8030/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        const data = await response.json()
        if (!response.ok) {
            return NextResponse.json(data, { status: response.status })
        }
        const nextResponse = NextResponse.json(data, { status: 200 })
        if (data.access_token) {
            nextResponse.cookies.set('auth-token', data.access_token, {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7,
                path: '/',
            })
        }
        return nextResponse
    } catch (error) {
        console.error('Google Auth Proxy Error:', error)
        return NextResponse.json({ error: 'Ошибка авторизации Google' }, { status: 500 })
    }
}