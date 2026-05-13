'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { ReactNode, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// Proactive refresh cadence. Backend access tokens default to 30 min; we
// rotate every 25 min so the cookie never expires while the tab is open
// (and so a transient refresh failure never surfaces to the user as a
// hard sign-out — they only see /auth if both proactive and reactive
// refresh attempts fail).
const PROACTIVE_REFRESH_INTERVAL_MS = 25 * 60 * 1000

function CookieBridge() {
    const { data: session, status } = useSession()
    const queryClient = useQueryClient()
    // Install backend cookies at most once per AuthProvider mount.
    const installed = useRef(false)

    useEffect(() => {
        if (status !== 'authenticated' || installed.current) return
        if (!session) return

        installed.current = true

        // Convert the NextAuth-managed refresh token into backend httpOnly
        // cookies. After this call, all backend requests rely on cookies
        // and the NextAuth session is no longer the source of truth.
        fetch('/api/auth/install-cookies', {
            method: 'POST',
            credentials: 'include',
        })
            .then((res) => {
                if (res.ok) {
                    queryClient.invalidateQueries({ queryKey: ['user'] })
                }
            })
            .catch(() => {
                // Non-fatal: use-http will trigger /auth/refresh on the next 401.
            })
    }, [status, session, queryClient])

    // Proactive refresh: keep the backend access cookie fresh while the tab
    // is open. We intentionally don't import refreshSession() here — it has
    // a NextAuth fallback that would loop into install-cookies on every
    // tick, defeating the purpose. Just hit /auth/refresh directly; if it
    // fails, the next user action will trigger the full reactive recovery.
    useEffect(() => {
        if (status !== 'authenticated') return

        let cancelled = false

        const tick = async () => {
            if (cancelled) return
            try {
                await fetch(API_ENDPOINTS.AUTH.REFRESH, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                })
                // We don't care about the body — the cookie has been rotated
                // on the response. Swallow non-OK results too: the reactive
                // path will handle them when the user makes a real request.
            } catch {
                // Network blip; try again on the next interval.
            }
        }

        const interval = setInterval(tick, PROACTIVE_REFRESH_INTERVAL_MS)

        // Also refresh when the tab regains focus after being idle for a
        // while — covers the case where setInterval throttles in a
        // background tab and the user comes back to an expired cookie.
        const onVisible = () => {
            if (document.visibilityState === 'visible') void tick()
        }
        document.addEventListener('visibilitychange', onVisible)

        return () => {
            cancelled = true
            clearInterval(interval)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [status])

    return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <CookieBridge />
            {children}
        </SessionProvider>
    )
}
