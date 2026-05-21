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
                <Sidebar weather={weather} />
            </Suspense>

            <div className="relative z-10 lg:pl-60">
                <Suspense fallback={null}>
                    <Header />
                </Suspense>
                <main className="h-[92.9vh]">
                    {children}
                </main>
            </div>

            {/* Weather widget center-top on desktop only — on mobile the
                hamburger sits at top-left and the platform header occupies
                that strip, so the widget is rendered inside the sidebar
                drawer instead (see <Sidebar weather=… />). */}
            {weather && (
                <div className="hidden lg:block fixed top-4 left-[calc(50%+120px)] -translate-x-1/2 z-30">
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
