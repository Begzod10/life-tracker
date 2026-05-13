'use client'

import { useState } from 'react'
import { Suspense } from 'react'
import { Header } from '@/components/layouts/header'
import { AICoach } from '@/components/features/ai-coach/ai-coach'
import { useWeather, type WeatherTheme } from '@/lib/hooks/use-weather'
import { WeatherBackground, WeatherWidget } from '@/components/features/weather/weather-background'
import { useUser } from '@/lib/hooks/use-auth'
import { useVoiceGreeting } from '@/lib/hooks/use-voice-greeting'

const WEATHER_THEMES = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'rain', 'snow', 'thunder'] as const
const WEATHER_EMOJI: Record<string, string> = {
    clear: '☀️', 'partly-cloudy': '⛅', cloudy: '☁️',
    fog: '🌫️', rain: '🌧️', snow: '❄️', thunder: '⛈️',
}

function PlatformLayoutInner({ children }: { children: React.ReactNode }) {
    const { data: weather } = useWeather()
    const [previewTheme, setPreviewTheme] = useState<WeatherTheme | null>(null)
    const activeTheme = previewTheme ?? weather?.theme ?? 'unknown'
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

            {/* Weather theme tester — slotted into the header bar to the left
                of the weather widget (which is `fixed top-4 left-1/2`). Sits
                at the same vertical level as the Back button. */}
            <div
                className="fixed top-3 left-28 z-50 flex gap-1 p-1 rounded-full backdrop-blur-md border border-white/10 overflow-x-auto max-w-[min(46rem,calc(50vw-12rem))] scrollbar-none"
                style={{ background: 'rgba(0,0,0,0.55)' }}
            >
                {WEATHER_THEMES.map(t => (
                    <button
                        key={t}
                        onClick={() => setPreviewTheme(previewTheme === t ? null : t)}
                        title={t}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap ${
                            activeTheme === t ? 'bg-white/20 text-white' : 'text-white/45 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {WEATHER_EMOJI[t]} {t}
                    </button>
                ))}
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
