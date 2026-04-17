'use client'

import { useState } from 'react'
import { Header } from '@/components/layouts/header'
import { Suspense } from 'react'
import { AICoach } from '@/components/features/ai-coach/ai-coach'
import { useWeather } from '@/lib/hooks/use-weather'
import { WeatherBackground } from '@/components/features/weather/weather-background'

function PlatformLayoutInner({ children }: { children: React.ReactNode }) {
    const { data: weather } = useWeather()

    return (
        <div className="dark bg-[#0a0a0f] relative min-h-screen">
            <WeatherBackground theme={weather?.theme ?? 'unknown'} />
            <div className="relative z-10">
                <Suspense fallback={null}>
                    <Header />
                </Suspense>
                <main className="h-[92.9vh]">
                    {children}
                </main>
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
