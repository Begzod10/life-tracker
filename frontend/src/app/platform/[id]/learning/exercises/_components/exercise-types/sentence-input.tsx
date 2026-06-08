'use client'

import { useMemo } from 'react'
import type { ExerciseItem } from '@/lib/hooks/use-exercises'
import { containsTargetWord } from '../shared'

interface Props {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}

export function SentenceInput({ item, value, onChange, disabled }: Props) {
    const wordUsed = useMemo(
        () => item.word ? containsTargetWord(value, item.word) : false,
        [value, item.word],
    )

    return (
        <div className="space-y-3">
            {item.prompt && (
                <p className="text-sm font-medium text-white/90 leading-relaxed">{item.prompt}</p>
            )}

            {/* Definition / instruction */}
            {item.instruction && (
                <p className="text-xs text-white/50 leading-relaxed">{item.instruction}</p>
            )}

            {/* Paraphrase source */}
            {item.source_sentence && (
                <blockquote className="px-3 py-2.5 rounded-lg bg-white/5 border-l-2 border-amber-400/40 text-sm text-white/70 italic leading-relaxed">
                    &ldquo;{item.source_sentence}&rdquo;
                </blockquote>
            )}

            <textarea
                rows={3}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder={`Your answer using "${item.word ?? 'the word'}"…`}
                className="w-full bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-500 transition-colors resize-none disabled:opacity-50"
            />

            {item.word && (
                <div className={`flex items-center gap-1.5 text-[11px] transition-colors ${
                    wordUsed ? 'text-emerald-400' : 'text-white/30'
                }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${wordUsed ? 'bg-emerald-400' : 'bg-white/20'}`} />
                    <span>&ldquo;{item.word}&rdquo; {wordUsed ? 'used' : 'not yet used'}</span>
                </div>
            )}
        </div>
    )
}
