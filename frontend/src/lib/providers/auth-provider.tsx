'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { ReactNode, useLayoutEffect, useRef } from 'react'
import { AuthTokens } from '@/lib/utils/auth'
import { useQueryClient } from '@tanstack/react-query'

function AuthSync() {
    const { data: session } = useSession()
    const queryClient = useQueryClient()
    // Track whether we've already seeded localStorage in this browser session.
    // Prevents overwriting freshly-rotated tokens on every window-focus refetch.
    const seeded = useRef(false)

    useLayoutEffect(() => {
        if (!session?.accessToken || !session?.refreshToken) return

        // Only seed from the NextAuth session when localStorage is empty (e.g. fresh login
        // or cleared storage). After use-http.ts rotates tokens, those stay authoritative.
        const alreadyHasToken = !!AuthTokens.getRefreshToken()
        if (!alreadyHasToken && !seeded.current) {
            AuthTokens.setTokens(session.accessToken, session.refreshToken)
            seeded.current = true
        }
        queryClient.invalidateQueries({ queryKey: ['user'] })
    }, [session, queryClient])

    return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
    return (
        // refetchOnWindowFocus=false: prevents SessionProvider from creating a new session
        // reference on every focus event, which would re-trigger AuthSync and potentially
        // overwrite rotated tokens with stale ones from the original login.
        <SessionProvider refetchOnWindowFocus={false}>
            <AuthSync />
            {children}
        </SessionProvider>
    )
}