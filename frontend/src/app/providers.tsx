// src/app/providers.tsx
// Провайдеры для приложения (NextAuth Session Provider)

'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
    return (
        // <SessionProvider>
        { children }
        // </SessionProvider>
    )
}