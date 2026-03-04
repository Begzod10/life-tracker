import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// src/middleware.ts

// Публичные пути, которые не требуют авторизации
const publicPaths = [
    '/auth',
    '/api/auth',  // ← ДОБАВИЛИ - все NextAuth endpoints
    '/api/auth/login',
    '/api/auth/register'
]

// Пути которые требуют авторизации
const protectedPaths = ['/platform', '/api/profile', '/api/profiles']

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Проверяем, является ли путь публичным
    const isPublicPath = publicPaths.some(path => pathname.startsWith(path))
    const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path))

    // Если путь не защищенный - пропускаем
    if (!isProtectedPath) {
        return NextResponse.next()
    }

    // Проверяем авторизацию (3 способа):

    // 1. Старый auth-token (email/password)
    const authToken = request.cookies.get('auth-token')?.value

    // 2. NextAuth session (OAuth)
    const nextAuthToken = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
    })

    // 3. access_token (если сохраняем в cookies)
    const accessToken = request.cookies.get('access_token')?.value

    // Если есть ЛЮБОЙ токен - авторизован
    const isAuthenticated = !!(authToken || nextAuthToken || accessToken)

    // Если путь защищенный и НЕТ токена - редирект на /auth
    if (isProtectedPath && !isAuthenticated) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth'
        return NextResponse.redirect(url)
    }

    // Если авторизован и пытается попасть на /auth - редирект на /platform
    if (isAuthenticated && pathname === '/auth') {
        const url = request.nextUrl.clone()
        url.pathname = '/platform'
        return NextResponse.redirect(url)
    }

    return NextResponse.next()
}

// Настройка matcher для применения middleware
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}