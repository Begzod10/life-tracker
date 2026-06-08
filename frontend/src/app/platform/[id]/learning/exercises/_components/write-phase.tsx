'use client'

import { motion } from 'framer-motion'
import { Check, Loader2, Volume2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ExerciseWord } from '@/lib/hooks/use-exercises'
import { DIFF_COLOR, speak, containsTargetWord } from './shared'

interface WritePhaseProps {
    words: ExerciseWord[]
    sentences: Record<number, string>
    setSentences: (updater: (prev: Record<number, string>) => Record<number, string>) => void
    submitAll: () => void
    isSubmitting: boolean
    error: string | null
}

export function WritePhase({
    words, sentences, setSentences, submitAll, isSubmitting, error,
}: WritePhaseProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 pb-32"
        >
            <div className="mb-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                    Write a sentence for each word
                </h1>
                <p className="text-sm text-white/50 mt-1">
                    Use each target word in a complete, natural sentence. One per box.
                </p>
            </div>

            {words.map((w, i) => (
                <WordEntryCard
                    key={w.id}
                    index={i}
                    word={w}
                    value={sentences[w.id] ?? ''}
                    onChange={(v) => setSentences((prev) => ({ ...prev, [w.id]: v }))}
                />
            ))}

            {/* Sticky submit bar */}
            <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[640px] z-30">
                <div className="rounded-2xl border border-white/10 bg-[#0f1019]/95 backdrop-blur-md p-3 shadow-xl shadow-black/60">
                    {error && (
                        <p className="text-xs text-red-300 mb-2 px-1">{error}</p>
                    )}
                    <Button
                        onClick={submitAll}
                        disabled={isSubmitting}
                        className="w-full h-11 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Grading…
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Submit for grading
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}

function WordEntryCard({
    index, word, value, onChange,
}: {
    index: number
    word: ExerciseWord
    value: string
    onChange: (v: string) => void
}) {
    const used = containsTargetWord(value, word.word)
    const tooShort = value.trim().split(/\s+/).filter(Boolean).length < 3
    const ready = value.trim().length > 0 && used && !tooShort

    return (
        <Card className="p-4 sm:p-5 bg-white/2.5 border border-white/5">
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-white/30">#{index + 1}</span>
                        <h3 className="text-lg font-semibold text-white">{word.word}</h3>
                        {word.part_of_speech && (
                            <span className="text-[11px] uppercase tracking-wide text-white/40">
                                {word.part_of_speech}
                            </span>
                        )}
                        {word.difficulty && (
                            <span className={`text-[11px] font-medium ${DIFF_COLOR[word.difficulty] ?? 'text-white/40'}`}>
                                {word.difficulty}
                            </span>
                        )}
                        {word.phonetic && (
                            <span className="text-xs text-white/40">/{word.phonetic}/</span>
                        )}
                    </div>
                    <p className="text-sm text-white/70 mt-1.5 leading-relaxed">{word.definition}</p>
                </div>
                <button
                    type="button"
                    onClick={() => speak(word.word)}
                    title="Pronounce"
                    className="p-2 rounded-lg text-white/50 hover:text-amber-300 hover:bg-white/5 transition-colors shrink-0"
                >
                    <Volume2 className="w-4 h-4" />
                </button>
            </div>

            {word.examples?.length > 0 && (
                <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-white/30 hover:text-white/60 transition-colors">
                        Show example
                    </summary>
                    <ul className="mt-2 space-y-1">
                        {word.examples.slice(0, 2).map((ex, j) => (
                            <li key={j} className="text-xs text-white/50 italic">&ldquo;{ex}&rdquo;</li>
                        ))}
                    </ul>
                </details>
            )}

            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={`Write a sentence using "${word.word}"…`}
                rows={2}
                maxLength={400}
                className="mt-3 w-full bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-500 transition-colors resize-y min-h-[64px]"
            />

            <div className="flex items-center justify-between mt-1.5 px-1 text-[11px]">
                <div className="flex items-center gap-3">
                    <span className={used ? 'text-emerald-300' : 'text-white/30'}>
                        {used ? '✓ word used' : 'word not yet used'}
                    </span>
                    {value.trim().length > 0 && tooShort && (
                        <span className="text-amber-300/80">aim for a full sentence</span>
                    )}
                </div>
                <span className={`text-[11px] ${ready ? 'text-emerald-300' : 'text-white/30'}`}>
                    {value.length}/400
                </span>
            </div>
        </Card>
    )
}
