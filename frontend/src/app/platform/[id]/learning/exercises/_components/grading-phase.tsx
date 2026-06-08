'use client'

import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export function GradingPhase() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-24"
        >
            <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin" />
                <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-amber-300" />
            </div>
            <p className="mt-6 text-sm text-white/60">AI is grading your sentences…</p>
            <p className="mt-1 text-xs text-white/30">Usually 3–6 seconds</p>
        </motion.div>
    )
}
