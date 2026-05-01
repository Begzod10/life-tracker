'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { ReactNode, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

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
