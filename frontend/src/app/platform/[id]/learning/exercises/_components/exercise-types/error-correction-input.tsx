'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'

interface Props {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}

export function ErrorCorrectionInput({ item, value, onChange, disabled }: Props) {
    return (
        <div className="space-y-3">
            <p className="text-sm font-medium text-white/90 leading-relaxed">{item.prompt}</p>

            {/* Errored sentence — red tint signals something is wrong */}
            {item.source_sentence && (
                <blockquote className="px-3 py-2.5 rounded-lg bg-red-500/10 border-l-2 border-red-400/50 text-sm text-white/80 italic leading-relaxed">
                    &ldquo;{item.source_sentence}&rdquo;
                </blockquote>
            )}

            {item.instruction && (
                <p className="text-xs text-white/40 leading-relaxed">{item.instruction}</p>
            )}

            <textarea
                rows={3}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder="Write the corrected sentence…"
                className="w-full bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-500 transition-colors resize-none disabled:opacity-50"
            />
        </div>
    )
}
