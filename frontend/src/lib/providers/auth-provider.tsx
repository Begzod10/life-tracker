'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { ReactNode, useLayoutEffect } from 'react'
import { AuthTokens } from '@/lib/utils/auth'
import { useQueryClient } from '@tanstack/react-query'

function AuthSync() {
    const { data: session } = useSession()
    const queryClient = useQueryClient()

    useLayoutEffect(() => {
        if (session?.accessToken && session?.refreshToken) {
            AuthTokens.setTokens(session.accessToken, session.refreshToken)
            document.cookie = `access_token=${session.accessToken}; path=/; max-age=${60 * 60 * 24 * 30}`
            queryClient.invalidateQueries({ queryKey: ['user'] })
        }
    }, [session, queryClient])

    return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <AuthSync />
            {children}
        </SessionProvider>
    )
}