import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth.config'

// Bridges NextAuth-managed OAuth login to the backend's httpOnly auth cookies.
// Called once after sign-in by AuthProvider; uses the refresh token stored
// in the NextAuth session to ask the backend for a fresh token pair, then
// forwards the backend's Set-Cookie headers to the browser.
export async function POST() {
    const session = await getServerSession(authOptions)
    const refreshToken = (session as any)?.refreshToken as string | undefined

    if (!refreshToken) {
        return NextResponse.json({ error: 'No session' }, { status: 401 })
    }

    const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
    if (!apiUrl) {
        return NextResponse.json({ error: 'API URL not configured' }, { status: 500 })
    }

    const upstream = await fetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!upstream.ok) {
        return NextResponse.json(
            { error: 'Refresh failed' },
            { status: upstream.status }
        )
    }

    const response = NextResponse.json({ ok: true })

    // Forward every Set-Cookie header from the backend so the browser stores
    // access_token + refresh_token on this origin. getSetCookie is
    // available in modern Next.js / Node fetch implementations.
    const setCookieHeaders = (upstream.headers as any).getSetCookie?.()
        ?? upstream.headers.get('set-cookie')?.split(/,(?=\s*\w+=)/)
        ?? []
    for (const cookie of setCookieHeaders) {
        response.headers.append('set-cookie', cookie)
    }

    return response
}
