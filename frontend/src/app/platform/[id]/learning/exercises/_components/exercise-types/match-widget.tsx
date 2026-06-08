'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'

interface MatchWidgetProps {
    items: ExerciseItem[]
    answers: Record<number, string>
    setAnswer: (wordId: number, value: string) => void
}

export function MatchWidget({ items, answers, setAnswer }: MatchWidgetProps) {
    const payload = items[0]?.question_payload
    const defs = payload?.definitions ?? []

    if (defs.length === 0) return null

    return (
        <div className="space-y-5">
            <p className="text-xs uppercase tracking-wider text-amber-300/60 font-medium">
                Match each word to its definition
            </p>

            {items.map((item) => {
                const selected = answers[item.word_id] ?? ''
                return (
                    <div key={item.word_id} className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white min-w-[7rem]">
                                {item.word}
                            </span>
                            {item.part_of_speech && (
                                <span className="text-[11px] text-white/30 italic">
                                    {item.part_of_speech}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {defs.map((def) => (
                                <button
                                    key={def}
                                    onClick={() => setAnswer(item.word_id, def)}
                                    className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors leading-relaxed ${
                                        selected === def
                                            ? 'border-amber-500/50 bg-amber-500/15 text-amber-100'
                                            : 'border-white/8 bg-white/3 text-white/65 hover:border-white/20 hover:bg-white/6'
                                    }`}
                                >
                                    {def}
                                </button>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
