'use client'

import { Suspense } from 'react'
import { Header } from '@/components/layouts/header'
import { Sidebar } from '@/components/layouts/sidebar'
import { AICoach } from '@/components/features/ai-coach/ai-coach'
import { useUser } from '@/lib/hooks/use-auth'
import { useVoiceGreeting } from '@/lib/hooks/use-voice-greeting'

function PlatformLayoutInner({ children }: { children: React.ReactNode }) {
    const { data: user } = useUser()
    useVoiceGreeting(user?.name)

    return (
        <div className="dark relative min-h-screen">
            <Suspense fallback={null}>
                <Sidebar />
            </Suspense>

            <div className="relative z-10 sidebar-push">
                <Suspense fallback={null}>
                    <Header />
                </Suspense>
                <main className="min-h-screen">
                    {children}
                </main>
            </div>

            <AICoach />
        </div>
    )
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
    return (
        <PlatformLayoutInner>
            {children}
        </PlatformLayoutInner>
    )
}
