'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { AuthTokens } from '@/lib/utils/auth'

export function useAuthCheck(redirectTo: string = '/auth') {
    const { data: session, status } = useSession()
    const router = useRouter()

    useEffect(() => {
        if (status === 'loading') return

        if (status === 'unauthenticated') {
            AuthTokens.clearTokens()
            router.push(redirectTo)
        }
    }, [status, router, redirectTo])

    return {
        isAuthenticated: status === 'authenticated',
        isLoading: status === 'loading',
        session,
    }
}
