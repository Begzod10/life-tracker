'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { StreakTier } from './use-streak'

// ─── StreakIndicator ──────────────────────────────────────────────────────────

interface StreakIndicatorProps {
    streak: number
}

export function StreakIndicator({ streak }: StreakIndicatorProps) {
    const reduced = useReducedMotion()

    if (streak < 3) return null

    return (
        <motion.div
            key={streak}
            initial={reduced ? false : { scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30"
        >
            <span className="text-sm leading-none" role="img" aria-label="flame">🔥</span>
            <span className="text-xs font-bold text-amber-300 tabular-nums">{streak}</span>
        </motion.div>
    )
}

// ─── StreakCelebration ────────────────────────────────────────────────────────

interface StreakCelebrationProps {
    tier: StreakTier | null
    onDismiss: () => void
}

export function StreakCelebration({ tier, onDismiss }: StreakCelebrationProps) {
    const reduced = useReducedMotion()

    useEffect(() => {
        if (!tier) return
        const timer = setTimeout(onDismiss, 1500)
        return () => clearTimeout(timer)
    }, [tier, onDismiss])

    return (
        <AnimatePresence>
            {tier && (
                <motion.div
                    key={tier.at}
                    className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                    initial={reduced
                        ? { opacity: 0 }
                        : { opacity: 0, y: -16, scale: 0.88 }}
                    animate={reduced
                        ? { opacity: 1 }
                        : { opacity: 1, y: 0, scale: 1 }}
                    exit={reduced
                        ? { opacity: 0 }
                        : { opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                >
                    <div className="px-5 py-2.5 rounded-full bg-amber-500 text-white font-bold text-sm shadow-xl shadow-amber-500/30 whitespace-nowrap">
                        {tier.label}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
