'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'

interface Props {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}

export function SpellingInput({ item, value, onChange, disabled }: Props) {
    return (
        <div className="space-y-3">
            <p className="text-sm text-white/80 leading-relaxed">{item.prompt}</p>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder="Type the word…"
                autoFocus
                className="w-full bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
            />
            <p className="text-[11px] text-white/40">Type the word exactly</p>
        </div>
    )
}
