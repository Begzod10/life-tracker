import { Header } from '@/components/layouts/header'
import { Suspense } from 'react'
import { AICoach } from '@/components/features/ai-coach/ai-coach'

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="dark bg-background">
            <Suspense fallback={null}>
                <Header />
            </Suspense>
            <main className="h-[92.9vh]">
                {children}
            </main>
            <AICoach />
        </div>
    )
}
