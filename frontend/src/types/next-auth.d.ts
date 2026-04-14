// src/types/next-auth.d.ts
// Расширение типов NextAuth для добавления кастомных полей

import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
    interface Session {
        accessToken: string
        refreshToken: string
        user: {
            id: number
            name: string
            email: string
            timezone: string
            is_active: boolean
            is_verified: boolean
            created_at: string
            last_login: string
        }
    }

    interface User {
        accessToken?: string
        refreshToken?: string
        backendUser?: any
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        accessToken?: string
        refreshToken?: string
        backendUser?: any
    }
}