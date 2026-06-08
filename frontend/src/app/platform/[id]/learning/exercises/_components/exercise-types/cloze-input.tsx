'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'

interface Props {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}

export function ClozeInput({ item, value, onChange, disabled }: Props) {
    return (
        <div className="space-y-3">
            <div className="px-4 py-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-sm text-white/90 leading-relaxed font-mono">{item.prompt}</p>
            </div>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder="Type the missing word…"
                autoFocus
                className="w-full bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
            />
            <p className="text-[11px] text-white/40">Fill in the blank</p>
        </div>
    )
}
