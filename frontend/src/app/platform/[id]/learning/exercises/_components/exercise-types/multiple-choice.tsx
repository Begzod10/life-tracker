'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'

interface Props {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}

export function MultipleChoice({ item, value, onChange, disabled }: Props) {
    const options = item.options ?? []

    return (
        <div className="space-y-3">
            <p className="text-sm font-medium text-white/90 leading-relaxed">{item.prompt}</p>
            <div className="grid grid-cols-1 gap-2">
                {options.map((opt) => (
                    <button
                        key={opt}
                        onClick={() => !disabled && onChange(opt)}
                        disabled={disabled}
                        className={`px-4 py-3 rounded-lg border text-left text-sm transition-colors ${
                            value === opt
                                ? 'border-amber-500/60 bg-amber-500/15 text-white'
                                : 'border-white/10 hover:border-white/20 bg-white/2.5 text-white/80'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    )
}
