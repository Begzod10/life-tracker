// src/lib/providers/auth-provider.tsx
'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { ReactNode, useEffect } from 'react'
import { AuthTokens } from '@/lib/utils/auth'
import { useQueryClient } from '@tanstack/react-query'

function AuthSync() {
    const { data: session } = useSession()
    const queryClient = useQueryClient()

    useEffect(() => {
        if (session?.accessToken && session?.refreshToken) {
            // Синхронизируем NextAuth session с localStorage
            console.log('🔄 Синхронизируем токены с localStorage')
            AuthTokens.setTokens(session.accessToken, session.refreshToken)

            // Также сохраняем в cookies для middleware
            document.cookie = `access_token=${session.accessToken}; path=/; max-age=${60 * 60 * 24 * 30}` // 30 дней

            // Обновляем запрос пользователя, чтобы useUser подхватил токен
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