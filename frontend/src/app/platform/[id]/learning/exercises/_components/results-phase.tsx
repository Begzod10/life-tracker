'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    formatUsageScore,
    type ExerciseGradeResult,
    type ExerciseItem,
    type ExerciseType,
} from '@/lib/hooks/use-exercises'

const DETERMINISTIC_TYPES = new Set<ExerciseType>([
    'meaning_mc', 'reverse_mc', 'cloze', 'spelling', 'anagram',
    'match', 'cloze_bank', 'word_formation', 'synonym_antonym', 'odd_one_out',
])

interface ResultsPhaseProps {
    results: ExerciseGradeResult[]
    items: ExerciseItem[]
    answers: Record<number, string>
    correctCount: number
    accuracy: number
    bestStreak: number
    onAgain: () => void
    onDone: () => void
}

export function ResultsPhase({
    results, items, answers, correctCount, accuracy, bestStreak, onAgain, onDone,
}: ResultsPhaseProps) {
    const ordered = useMemo(() => {
        const byId = new Map(results.map((r) => [r.word_id, r] as const))
        return items
            .filter((item) => (answers[item.word_id] ?? '').trim().length > 0)
            .map((item) => byId.get(item.word_id))
            .filter((r): r is ExerciseGradeResult => Boolean(r))
    }, [results, items, answers])

    const headline = accuracy >= 80
        ? 'Strong run.'
        : accuracy >= 50
        ? 'Solid — sharpen the misses.'
        : 'Plenty to learn from.'

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 pb-24"
        >
            <Card className="p-5 sm:p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/30">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-amber-300/80">Exercise results</p>
                        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">
                            {correctCount}/{ordered.length}
                            <span className="text-lg text-white/50 ml-2">· {accuracy}%</span>
                        </p>
                        <p className="text-sm text-white/60 mt-1">{headline}</p>
                        {bestStreak >= 3 && (
                            <p className="text-xs text-amber-300/70 mt-1">
                                Best streak: {bestStreak} {'🔥'}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={onAgain}
                            variant="outline"
                            className="border-white/20 text-white hover:bg-white/5"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Rewrite these
                        </Button>
                        <Button
                            onClick={onDone}
                            className="bg-amber-600 hover:bg-amber-500 text-white"
                        >
                            New set
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </Card>

            {ordered.map((r) => (
                <ResultCard key={r.word_id} result={r} />
            ))}
        </motion.div>
    )
}

function ResultCard({ result }: { result: ExerciseGradeResult }) {
    const tone = result.is_correct
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-red-500/30 bg-red-500/5'
    const Icon = result.is_correct ? Check : X
    const iconColor = result.is_correct ? 'text-emerald-300' : 'text-red-300'
    const isDeterministic = DETERMINISTIC_TYPES.has(result.exercise_type)

    return (
        <Card className={`p-4 sm:p-5 border ${tone}`}>
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${iconColor}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-white">{result.word}</h3>
                        <span className="text-[10px] uppercase tracking-wider text-white/30">
                            {result.exercise_type.replace(/_/g, ' ')}
                        </span>
                        {!isDeterministic && result.usage_score !== null && (
                            <span className="text-[11px] text-white/40">
                                usage {formatUsageScore(result.usage_score)}
                            </span>
                        )}
                    </div>

                    {/* Learner's response */}
                    <p className="text-sm text-white/80 mt-2 italic leading-relaxed">
                        &ldquo;{result.response}&rdquo;
                    </p>

                    {/* Correct answer for deterministic types when wrong */}
                    {isDeterministic && !result.is_correct && result.correct_answer && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                            <p className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">
                                Correct answer
                            </p>
                            <p className="text-sm text-white/85">{result.correct_answer}</p>
                        </div>
                    )}

                    {/* Feedback for production types */}
                    {result.feedback && (
                        <p className="text-sm text-white/70 mt-3 leading-relaxed">
                            {result.feedback}
                        </p>
                    )}

                    {/* Suggested revision for production types */}
                    {result.suggested_revision && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                            <p className="text-[11px] uppercase tracking-wide text-amber-300/80 mb-1">
                                Suggested revision
                            </p>
                            <p className="text-sm text-white/85 leading-relaxed">
                                {result.suggested_revision}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}
