'use client'

import { Suspense } from 'react'
import { Header } from '@/components/layouts/header'
import { Sidebar } from '@/components/layouts/sidebar'
import { AICoach } from '@/components/features/ai-coach/ai-coach'
import { useWeather } from '@/lib/hooks/use-weather'
import { WeatherBackground, WeatherWidget } from '@/components/features/weather/weather-background'
import { useUser } from '@/lib/hooks/use-auth'
import { useVoiceGreeting } from '@/lib/hooks/use-voice-greeting'

function PlatformLayoutInner({ children }: { children: React.ReactNode }) {
    const { data: weather } = useWeather()
    const activeTheme = weather?.theme ?? 'unknown'
    const { data: user } = useUser()
    useVoiceGreeting(user?.name)

    return (
        <div className="dark relative min-h-screen">
            <WeatherBackground theme={activeTheme} />

            <Suspense fallback={null}>
                <Sidebar />
            </Suspense>

            <div className="relative z-10 lg:pl-60">
                <Suspense fallback={null}>
                    <Header />
                </Suspense>
                <main className="h-[92.9vh]">
                    {children}
                </main>
            </div>

            {/* Weather widget center-top — offset by half-sidebar on lg so
                it stays optically centered above the content area. */}
            {weather && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 lg:left-[calc(50%+120px)] z-30">
                    <WeatherWidget data={weather} />
                </div>
            )}

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
