'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'

interface Props {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}

export function AnagramInput({ item, value, onChange, disabled }: Props) {
    return (
        <div className="space-y-3">
            <div className="text-center py-2">
                <p className="text-2xl font-bold tracking-widest text-amber-300">{item.prompt.replace('Unscramble: ', '')}</p>
            </div>
            {item.hint && (
                <p className="text-xs text-white/40 text-center">{item.hint}</p>
            )}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder="Unscramble and type the word…"
                autoFocus
                className="w-full bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
            />
        </div>
    )
}
