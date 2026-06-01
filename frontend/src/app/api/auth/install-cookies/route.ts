import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth.config'

// Bridges NextAuth-managed OAuth login to the backend's httpOnly auth cookies.
// Called once after sign-in by AuthProvider; uses the refresh token stored
// in the NextAuth session to ask the backend for a fresh token pair, then
// forwards the backend's Set-Cookie headers to the browser.
export async function POST() {
    let session: any
    try {
        session = await getServerSession(authOptions)
    } catch (err) {
        // Malformed/undecryptable next-auth.session-token (rotated NEXTAUTH_SECRET,
        // stale cookie from a previous deploy). Treat as no session — the client
        // will fall back to /auth instead of looping on a 500.
        console.error('[install-cookies] getServerSession threw', err)
        return NextResponse.json({ error: 'SESSION_INVALID' }, { status: 401 })
    }

    const refreshToken = session?.refreshToken as string | undefined
    if (!refreshToken) {
        return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 })
    }

    const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
    if (!apiUrl) {
        console.error('[install-cookies] API_URL / NEXT_PUBLIC_API_URL is not configured')
        return NextResponse.json({ error: 'API_URL_MISSING' }, { status: 500 })
    }

    let upstream: Response
    try {
        upstream = await fetch(`${apiUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        })
    } catch (err) {
        // DNS failure, TLS error, backend down — surface as 502 so the client
        // knows it's a transient upstream problem, not a bad session.
        console.error('[install-cookies] upstream fetch failed', err)
        return NextResponse.json({ error: 'UPSTREAM_UNREACHABLE' }, { status: 502 })
    }

    if (!upstream.ok) {
        return NextResponse.json(
            { error: 'REFRESH_FAILED' },
            { status: upstream.status }
        )
    }

    const response = NextResponse.json({ ok: true })

    // Forward every Set-Cookie header from the backend so the browser stores
    // access_token + refresh_token on this origin. getSetCookie is available
    // in modern Next.js / Node fetch implementations; fall back to splitting
    // a combined header on commas that precede a "name=" pair.
    try {
        const setCookieHeaders = (upstream.headers as any).getSetCookie?.()
            ?? upstream.headers.get('set-cookie')?.split(/,(?=\s*\w+=)/)
            ?? []
        for (const cookie of setCookieHeaders) {
            response.headers.append('set-cookie', cookie)
        }
    } catch (err) {
        console.error('[install-cookies] failed to forward set-cookie', err)
        return NextResponse.json({ error: 'COOKIE_FORWARD_FAILED' }, { status: 502 })
    }

    return response
}
