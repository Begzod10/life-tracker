// src/lib/hooks/use-auth-check.ts
'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { AuthTokens } from '@/lib/utils/auth'

export function useAuthCheck(redirectTo: string = '/auth') {
    const { data: session, status } = useSession()
    const router = useRouter()

    useEffect(() => {
        // Проверяем NextAuth session ИЛИ localStorage токены
        const hasNextAuthSession = status === 'authenticated'
        const hasLocalStorageTokens = !!(AuthTokens.getAccessToken() && AuthTokens.getRefreshToken())

        const isAuthenticated = hasNextAuthSession || hasLocalStorageTokens

        if (status !== 'loading' && !isAuthenticated) {
            router.push(redirectTo)
        }
    }, [session, status, router, redirectTo])

    return {
        isAuthenticated: status === 'authenticated' || !!(AuthTokens.getAccessToken()),
        isLoading: status === 'loading',
        session,
    }
}