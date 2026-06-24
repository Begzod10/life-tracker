'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { StatusBar, CommandGrid } from '@/components/hud'
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    useErrorHuntNext,
    useErrorHuntGrade,
    type ErrorHuntGradeResult,
} from '@/lib/hooks/use-error-hunt'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'loading' | 'result'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ErrorHuntPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [phase, setPhase]       = useState<Phase>('idle')
    const [response, setResponse] = useState('')
    const [result, setResult]     = useState<ErrorHuntGradeResult | null>(null)

    const { data: next, isLoading: loadingNext, refetch } = useErrorHuntNext()
    const { mutate: grade, isPending: grading }            = useErrorHuntGrade()

    const canSubmit = response.trim().length >= 5 && !grading

    const handleSubmit = useCallback(() => {
        if (!next || !canSubmit) return
        setPhase('loading')
        grade(
            { grammar_point_id: next.grammar_point_id, response: response.trim() },
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
                <StatusBar section="Error Hunt" />

                <button
                    onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                    className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Writing</span>
                </button>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
                        <Search className="w-6 h-6 sm:w-8 sm:h-8 text-rose-400" />
                        Error Hunt
                    </h1>
                    <p className="text-white/50 mt-1 text-sm">Find and fix the grammar error in each sentence.</p>
                </motion.div>

                {loadingNext && (
                    <div className="flex items-center justify-center py-20 gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-spin" />
                        <p className="text-sm text-white/40">Loading next drill…</p>
                    </div>
                )}

                {!loadingNext && next && (
                    <div className="space-y-4">
                        {/* Grammar point card */}
                        <Card className="p-4 sm:p-5 bg-rose-500/10 border border-rose-500/20">
                            <h2 className="text-lg font-bold text-rose-200 mb-2">{next.grammar_point_name}</h2>
                            <div className="rounded-lg bg-rose-500/10 border border-rose-500/15 p-3">
                                <p className="text-xs text-rose-400/60 uppercase tracking-wider mb-1">Rule</p>
                                <p className="text-sm text-rose-100/80 leading-relaxed">{next.rule}</p>
                            </div>
                        </Card>

                        {/* Errored sentence */}
                        <Card className="p-4 sm:p-5 bg-white/3 border border-white/10">
                            <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Find and fix the error</p>
                            <div className="rounded-lg bg-rose-500/8 border border-rose-500/20 p-4">
                                <p className="text-white/90 leading-relaxed text-sm sm:text-base">
                                    &ldquo;{next.errored_sentence}&rdquo;
                                </p>
                            </div>
                        </Card>

                        {/* Textarea */}
                        <div>
                            <textarea
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                                placeholder="Type the corrected sentence here…"
                                rows={3}
                                disabled={phase === 'result'}
                                className="w-full bg-white/3 border border-white/10 rounded-xl p-4 text-white placeholder:text-white/20 resize-none outline-none focus:border-rose-500/40 text-sm leading-relaxed transition-colors disabled:opacity-50"
                            />
                            {phase !== 'result' && (
                                <div className="flex justify-end mt-2">
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={!canSubmit}
                                        className="bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 border border-rose-500/30"
                                    >
                                        {phase === 'loading'
                                            ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Checking…</>
                                            : 'Submit'
                                        }
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Result */}
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
    result: ErrorHuntGradeResult
    onNext: () => void
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
        >
            {/* Banner */}
            <div className={`flex items-center gap-3 rounded-xl border p-4 ${
                result.is_correct
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-rose-500/10 border-rose-500/20'
            }`}>
                {result.is_correct
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    : <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                }
                <p className={`font-semibold ${result.is_correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {result.is_correct ? 'Correct!' : 'Not quite'}
                </p>
            </div>

            {/* Correct sentence */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs text-emerald-400/70 uppercase tracking-wider mb-1.5">Correct sentence</p>
                <p className="text-sm text-white/90 leading-relaxed">&ldquo;{result.correct_sentence}&rdquo;</p>
            </div>

            {/* Rule reminder */}
            <div className="rounded-xl border border-rose-500/15 bg-rose-500/5 p-4">
                <p className="text-xs text-rose-400/60 uppercase tracking-wider mb-1.5">Rule — {result.grammar_point_name}</p>
                <p className="text-sm text-white/70 leading-relaxed">{result.rule}</p>
            </div>

            <Button
                onClick={onNext}
                className="w-full bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 border border-rose-500/30"
            >
                Next Error
            </Button>
        </motion.div>
    )
}
