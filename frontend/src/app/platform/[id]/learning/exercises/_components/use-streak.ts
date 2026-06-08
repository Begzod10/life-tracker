'use client'

import { useCallback, useRef, useState } from 'react'

export const STREAK_TIERS = [
    { at: 5,  label: '🔥 5 in a row!' },
    { at: 10, label: '🔥🔥 On fire!' },
    { at: 15, label: '🔥🔥🔥 Unstoppable!' },
] as const

export type StreakTier = { at: number; label: string }

export function useStreak() {
    const [currentStreak, setCurrentStreak] = useState(0)
    const [bestStreak, setBestStreak] = useState(0)
    const [justUnlocked, setJustUnlocked] = useState<StreakTier | null>(null)

    // Refs track authoritative values synchronously so we don't rely on stale closure state
    const streakRef = useRef(0)
    const bestRef = useRef(0)
    // Guard against double-counting when results are replayed (e.g. idempotent retries)
    const countedIds = useRef<Set<number>>(new Set())

    const registerResult = useCallback((wordId: number, isCorrect: boolean) => {
        if (countedIds.current.has(wordId)) return
        countedIds.current.add(wordId)

        const next = isCorrect ? streakRef.current + 1 : 0
        streakRef.current = next
        bestRef.current = Math.max(bestRef.current, next)

        setCurrentStreak(next)
        setBestStreak(bestRef.current)

        if (isCorrect) {
            const tier = STREAK_TIERS.find((t) => t.at === next)
            if (tier) setJustUnlocked(tier)
        }
    }, [])

    const dismissCelebration = useCallback(() => setJustUnlocked(null), [])

    const reset = useCallback(() => {
        streakRef.current = 0
        bestRef.current = 0
        countedIds.current = new Set()
        setCurrentStreak(0)
        setBestStreak(0)
        setJustUnlocked(null)
    }, [])

    return { currentStreak, bestStreak, justUnlocked, registerResult, dismissCelebration, reset }
}
