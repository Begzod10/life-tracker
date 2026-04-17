'use client'

import { useState } from 'react'
import { Header } from '@/components/layouts/header'
import { Suspense } from 'react'
import { AICoach } from '@/components/features/ai-coach/ai-coach'
import { useWeather, type WeatherTheme } from '@/lib/hooks/use-weather'
import { WeatherBackground } from '@/components/features/weather/weather-background'

const THEMES = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'rain', 'snow', 'thunder'] as const
const EMOJI: Record<string, string> = {
    clear: '☀️', 'partly-cloudy': '⛅', cloudy: '☁️',
    fog: '🌫️', rain: '🌧️', snow: '❄️', thunder: '⛈️',
}

function PlatformLayoutInner({ children }: { children: React.ReactNode }) {
    const { data: weather } = useWeather()
    const [previewTheme, setPreviewTheme] = useState<WeatherTheme | null>(null)
    const activeTheme = previewTheme ?? weather?.theme ?? 'unknown'

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

            {/* Weather theme tester — fixed, works on all pages */}
            <div
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex gap-1 p-1.5 rounded-2xl backdrop-blur-md border border-white/10"
                style={{ background: 'rgba(0,0,0,0.55)' }}
            >
                {THEMES.map(t => (
                    <button
                        key={t}
                        onClick={() => setPreviewTheme(previewTheme === t ? null : t)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                            activeTheme === t
                                ? 'bg-white/20 text-white'
                                : 'text-white/45 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {EMOJI[t]} {t}
                    </button>
                ))}
            </div>

            <AICoach />
        </div>
    )
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={null}>
            <PlatformLayoutInner>{children}</PlatformLayoutInner>
        </Suspense>
    )
}
