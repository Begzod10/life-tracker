import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Proxy for the backend's POST /auth/refresh endpoint.
// Next.js App Router serves specific static routes BEFORE dynamic catch-alls,
// so this file intercepts POST /api/auth/refresh before NextAuth's
// [...nextauth]/route.ts ever sees it.
//
// The browser sends its refresh_token httpOnly cookie; we forward it to
// FastAPI and pass back whatever Set-Cookie headers FastAPI returns so the
// rotated access + refresh cookies land on the browser.
export async function POST(req: NextRequest) {
    const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
    if (!apiUrl) {
        return NextResponse.json({ error: 'API_URL_MISSING' }, { status: 500 })
    }

    // Forward the caller's Cookie header so the backend can read refresh_token.
    const cookieStore = await cookies()
    const cookieHeader = cookieStore.toString()

    let body: string
    try {
        const text = await req.text()
        body = text || '{}'
    } catch {
        body = '{}'
    }

    let upstream: Response
    try {
        upstream = await fetch(`${apiUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            },
            body,
        })
    } catch (err) {
        console.error('[auth/refresh proxy] upstream unreachable', err)
        return NextResponse.json({ error: 'UPSTREAM_UNREACHABLE' }, { status: 502 })
    }

    const response = NextResponse.json(
        upstream.ok ? { ok: true } : { error: 'REFRESH_FAILED' },
        { status: upstream.status },
    )

    // Forward rotated Set-Cookie headers back to the browser.
    try {
        const setCookies = (upstream.headers as any).getSetCookie?.()
            ?? upstream.headers.get('set-cookie')?.split(/,(?=\s*\w+=)/)
            ?? []
        for (const c of setCookies) response.headers.append('set-cookie', c)
    } catch { /* best-effort */ }

    return response
}
