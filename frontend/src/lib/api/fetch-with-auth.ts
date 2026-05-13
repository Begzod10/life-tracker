import { signOut } from 'next-auth/react'
import { refreshSession } from '@/lib/hooks/use-http'

// Auth-aware fetch that mirrors the JSON path in use-http: on 401, run the
// shared refreshSession() (which also falls back to NextAuth install-cookies
// when the backend refresh cookie is gone) and retry once. Returns the raw
// Response so callers can stream binaries, read headers, etc.
export async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const config: RequestInit = {
        credentials: 'include',
        ...init,
    }

    const first = await fetch(input, config)
    if (first.status !== 401) return first

    try {
        await refreshSession()
    } catch (err: unknown) {
        if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
            signOut({ redirect: false }).finally(() => {
                window.location.replace('/auth')
            })
        }
        throw err
    }

    return fetch(input, config)
}
