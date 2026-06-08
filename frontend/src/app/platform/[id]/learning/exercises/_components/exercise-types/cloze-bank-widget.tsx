'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'

interface ClozeBankWidgetProps {
    items: ExerciseItem[]
    answers: Record<number, string>
    setAnswer: (wordId: number, value: string) => void
}

export function ClozeBankWidget({ items, answers, setAnswer }: ClozeBankWidgetProps) {
    const payload = items[0]?.question_payload
    const wordBank = payload?.word_bank ?? []

    if (wordBank.length === 0) return null

    const usedWords = new Set(Object.values(answers).filter(Boolean))

    return (
        <div className="space-y-4">
            {/* Word bank */}
            <div>
                <p className="text-xs uppercase tracking-wider text-amber-300/60 font-medium mb-2">
                    Word bank
                </p>
                <div className="flex flex-wrap gap-2">
                    {wordBank.map((word) => {
                        const used = usedWords.has(word)
                        return (
                            <span
                                key={word}
                                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                                    used
                                        ? 'border-white/5 bg-white/3 text-white/20 line-through'
                                        : 'border-white/15 bg-white/8 text-white/80'
                                }`}
                            >
                                {word}
                            </span>
                        )
                    })}
                </div>
            </div>

            {/* Sentences with selectors */}
            <div className="space-y-4">
                {items.map((item) => {
                    const selected = answers[item.word_id] ?? ''
                    // Show the gapped sentence; the blank is "_____"
                    const parts = item.prompt.split('_____')

                    return (
                        <div key={item.word_id} className="space-y-2">
                            <p className="text-sm text-white/80 leading-relaxed">
                                {parts[0]}
                                <span
                                    className={`inline-block min-w-[5rem] text-center rounded px-2 mx-1 border-b-2 transition-colors ${
                                        selected
                                            ? 'border-amber-500/60 text-amber-200 font-medium'
                                            : 'border-white/25 text-white/30'
                                    }`}
                                >
                                    {selected || '_____'}
                                </span>
                                {parts[1] ?? ''}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {wordBank.map((word) => (
                                    <button
                                        key={word}
                                        onClick={() => setAnswer(item.word_id, word)}
                                        className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                            selected === word
                                                ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                                                : 'border-white/10 bg-white/4 text-white/60 hover:border-white/20 hover:bg-white/8'
                                        }`}
                                    >
                                        {word}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
