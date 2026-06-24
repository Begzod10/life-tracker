'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { StatusBar, CommandGrid } from '@/components/hud'
import {
    ArrowLeft, BookOpen, CheckCircle2, XCircle, RefreshCw, Lightbulb,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    useParaphraseNext,
    useParaphraseGrade,
    useParaphraseStats,
    type ParaphraseGradeResult,
    type ParaphraseNext,
} from '@/lib/hooks/use-paraphrase'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'loading' | 'result'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParaphrasePage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [phase, setPhase]       = useState<Phase>('idle')
    const [response, setResponse] = useState('')
    const [result, setResult]     = useState<ParaphraseGradeResult | null>(null)

    const { data: next, isLoading: loadingNext, refetch } = useParaphraseNext()
    const { data: stats = [] }                             = useParaphraseStats()
    const { mutate: grade, isPending: grading }            = useParaphraseGrade()

    const wordCount = response.trim() ? response.trim().split(/\s+/).length : 0
    const canSubmit = response.trim().length >= 15 && !grading

    const handleSubmit = useCallback(() => {
        if (!next || !canSubmit) return
        setPhase('loading')
        grade(
            { sentence_id: next.sentence_id, technique: next.technique_key, response },
            {
                onSuccess: (data) => {
                    setResult(data)
                    setPhase('result')
                },
                onError: () => setPhase('idle'),
            },
        )
    }, [next, canSubmit, grade, response])

    const handleNext = useCallback(() => {
        setResponse('')
        setResult(null)
        setPhase('idle')
        refetch()
    }, [refetch])

    return (
        <CommandGrid className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto">
                <StatusBar section="Paraphrase Drills" />

                <button
                    onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                    className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Writing</span>
                </button>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
                        <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400" />
                        Paraphrase Drills
                    </h1>
                    <p className="text-white/50 mt-1 text-sm">Master 7 IELTS Task 2 intro paraphrasing techniques.</p>
                </motion.div>

                {/* Stats bar */}
                {stats.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                        {stats.map((s) => (
                            <div
                                key={s.technique_key}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs"
                            >
                                <span className="text-amber-200/80 truncate max-w-[8rem]">{s.technique_name}</span>
                                <span className={`font-semibold tabular-nums ${
                                    s.accuracy >= 70 ? 'text-emerald-400' :
                                    s.accuracy >= 40 ? 'text-amber-400'   : 'text-rose-400'
                                }`}>
                                    {s.total > 0 ? `${Math.round(s.accuracy)}%` : '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {loadingNext && (
                    <div className="flex items-center justify-center py-20 gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
                        <p className="text-sm text-white/40">Loading next drill…</p>
                    </div>
                )}

                {!loadingNext && next && (
                    <div className="space-y-4">
                        {/* Technique card */}
                        <Card className="p-4 sm:p-5 bg-amber-500/10 border border-amber-500/20">
                            <h2 className="text-lg font-bold text-amber-200 mb-1">{next.technique_name}</h2>
                            <p className="text-sm text-amber-300/70 mb-4">{next.technique_description}</p>

                            <div className="rounded-lg bg-amber-500/10 border border-amber-500/15 p-3 mb-3">
                                <p className="text-xs text-amber-400/60 uppercase tracking-wider mb-1">How to apply</p>
                                <p className="text-sm text-amber-100/80 leading-relaxed">{next.technique_instruction}</p>
                            </div>

                            <div className="rounded-lg bg-black/20 border border-amber-500/10 p-3 space-y-2">
                                <p className="text-xs text-white/40 uppercase tracking-wider">Example</p>
                                <div className="space-y-1.5 text-sm">
                                    <p className="text-white/60"><span className="text-white/30 mr-1">Original:</span>{next.example_original}</p>
                                    <p className="text-amber-200/80"><span className="text-white/30 mr-1">Paraphrase:</span>{next.example_paraphrase}</p>
                                </div>
                            </div>
                        </Card>

                        {/* Sentence to paraphrase */}
                        <Card className="p-4 sm:p-5 bg-white/3 border border-white/10">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20 uppercase tracking-wider">
                                    #{next.sentence_id}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/10">
                                    {next.topic}
                                </span>
                            </div>
                            <p className="text-white/90 leading-relaxed text-sm sm:text-base">
                                "{next.original_sentence}"
                            </p>
                        </Card>

                        {/* Textarea */}
                        <div>
                            <textarea
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                                placeholder={`Write your paraphrase here using the ${next.technique_name} technique…`}
                                rows={5}
                                disabled={phase === 'result'}
                                className="w-full bg-white/3 border border-white/10 rounded-xl p-4 text-white placeholder:text-white/20 resize-none outline-none focus:border-amber-500/40 text-sm leading-relaxed transition-colors disabled:opacity-50"
                            />
                            <div className="flex items-center justify-between mt-2">
                                <span className={`text-xs tabular-nums ${
                                    wordCount >= 10 ? 'text-emerald-400' : 'text-white/30'
                                }`}>
                                    {wordCount} word{wordCount === 1 ? '' : 's'}
                                </span>
                                {phase !== 'result' && (
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={!canSubmit}
                                        className="bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/30"
                                    >
                                        {phase === 'loading'
                                            ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Grading…</>
                                            : 'Submit'
                                        }
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Result section */}
                        <AnimatePresence>
                            {phase === 'result' && result && (
                                <ResultSection result={result} onNext={handleNext} />
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </CommandGrid>
    )
}

// ─── Result Section ───────────────────────────────────────────────────────────

function ResultSection({
    result,
    onNext,
}: {
    result: ParaphraseGradeResult
    onNext: () => void
}) {
    const correct = result.applied_correctly === true

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
        >
            {/* Result banner */}
            <div className={`flex items-center gap-3 rounded-xl border p-4 ${
                correct
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-rose-500/10 border-rose-500/20'
            }`}>
                {correct
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    : <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                }
                <p className={`font-semibold ${correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {correct ? 'Correct!' : 'Needs work'}
                </p>
            </div>

            {/* Technique check */}
            {result.technique_check && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-xs text-amber-400/70 uppercase tracking-wider mb-1.5">Technique check</p>
                    <p className="text-sm text-white/80 leading-relaxed">{result.technique_check}</p>
                </div>
            )}

            {/* Feedback */}
            {result.feedback && (
                <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-4 h-4 text-white/40" />
                        <p className="text-xs text-white/40 uppercase tracking-wider">Feedback</p>
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed">{result.feedback}</p>
                </div>
            )}

            {/* Model answer */}
            {result.model_answer && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
                    <p className="text-xs text-blue-400/70 uppercase tracking-wider mb-1.5">
                        A correct paraphrase using this technique
                    </p>
                    <p className="text-sm text-blue-100/90 leading-relaxed">{result.model_answer}</p>
                </div>
            )}

            <Button
                onClick={onNext}
                className="w-full bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/30"
            >
                Next Drill
            </Button>
        </motion.div>
    )
}
