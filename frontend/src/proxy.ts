import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const protectedPaths = ['/platform', '/api/profile', '/api/profiles']

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path))

    if (!isProtectedPath) {
        return NextResponse.next()
    }

    let isAuthenticated = false
    try {
        const authToken = request.cookies.get('auth-token')?.value
        const accessToken = request.cookies.get('access_token')?.value
        const nextAuthToken = await getToken({
            req: request,
            secret: process.env.NEXTAUTH_SECRET,
        })
        isAuthenticated = !!(authToken || nextAuthToken || accessToken)
    } catch {
        isAuthenticated = false
    }

    if (!isAuthenticated) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth'
        return NextResponse.redirect(url)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
