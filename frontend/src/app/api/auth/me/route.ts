import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth.config'

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')
        let token = authHeader?.split(' ')[1]

        if (!token) {
            token = request.cookies.get('auth-token')?.value ||
                request.cookies.get('access_token')?.value
        }

        if (!token) {
            const session = await getServerSession(authOptions)
            token = session?.accessToken as string
        }

        if (!token) {
            return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
        }

        const response = await fetch('http://127.0.0.1:8030/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        const data = await response.json()
        return NextResponse.json(data, { status: response.status })

    } catch (error) {
        console.error('Me proxy error:', error)
        return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
    }
}