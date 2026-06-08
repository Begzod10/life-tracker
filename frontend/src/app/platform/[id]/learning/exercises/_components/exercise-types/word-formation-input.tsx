'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'

interface Props {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}

export function WordFormationInput({ item, value, onChange, disabled }: Props) {
    return (
        <div className="space-y-3">
            <p className="text-sm font-medium text-white/90 leading-relaxed">{item.prompt}</p>
            {item.instruction && (
                <p className="text-xs text-white/40 italic">{item.instruction}</p>
            )}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder={`Enter the ${item.form_type ?? 'form'} form…`}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 disabled:opacity-50"
                autoComplete="off"
                spellCheck={false}
            />
        </div>
    )
}
