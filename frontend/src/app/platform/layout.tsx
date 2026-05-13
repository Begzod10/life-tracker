'use client'

import { Suspense } from 'react'
import { Header } from '@/components/layouts/header'
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
        <div className="dark bg-[#0a0a0f] relative min-h-screen">
            <WeatherBackground theme={activeTheme} />

            <div className="relative z-10">
                <Suspense fallback={null}>
                    <Header />
                </Suspense>
                <main className="h-[92.9vh]">
                    {children}
                </main>
            </div>

            {/* Weather widget center-top */}
            {weather && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30">
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
