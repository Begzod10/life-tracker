'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { StatusBar, CommandGrid } from '@/components/hud'
import { ArrowLeft, RefreshCw, PencilLine, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    useMiniBuildStart,
    useMiniBuildGrade,
    useMiniBuildStats,
    type MiniBuildStart,
    type MiniBuildGradeResult,
} from '@/lib/hooks/use-mini-build'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'writing' | 'loading' | 'result'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MiniBuildPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [phase, setPhase]       = useState<Phase>('setup')
    const [session, setSession]   = useState<MiniBuildStart | null>(null)
    const [response, setResponse] = useState('')
    const [result, setResult]     = useState<MiniBuildGradeResult | null>(null)

    const { data: stats }                           = useMiniBuildStats()
    const { mutate: startSession, isPending: starting } = useMiniBuildStart()
    const { mutate: grade, isPending: grading }         = useMiniBuildGrade()

    const wordCount   = response.trim() ? response.trim().split(/\s+/).length : 0
    const canSubmit   = response.trim().length >= 15 && !grading

    const handleStart = useCallback(() => {
        startSession(undefined, {
            onSuccess: (data) => {
                setSession(data)
                setResponse('')
                setResult(null)
                setPhase('writing')
            },
        })
    }, [startSession])

    const handleSubmit = useCallback(() => {
        if (!session || !canSubmit) return
        setPhase('loading')
        grade(
            {
                question: session.question,
                question_type: session.question_type,
                required_words: session.required_words,
                response: response.trim(),
            },
            {
                onSuccess: (data) => {
                    setResult(data)
                    setPhase('result')
                },
                onError: () => setPhase('writing'),
            },
        )
    }, [session, canSubmit, grade, response])

    const handleTryAnother = useCallback(() => {
        setSession(null)
        setResponse('')
        setResult(null)
        setPhase('setup')
    }, [])

    return (
        <CommandGrid className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto">
                <StatusBar section="Mini Build" />

                <button
                    onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                    className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Writing</span>
                </button>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
                        <PencilLine className="w-6 h-6 sm:w-8 sm:h-8 text-violet-400" />
                        Mini Build — Intro Drill
                    </h1>
                    <p className="text-white/50 mt-1 text-sm">Write a 2-sentence intro: paraphrase + position.</p>
                </motion.div>

                {/* Stats bar */}
                {stats && stats.total > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs">
                            <span className="text-violet-200/80">Total drills</span>
                            <span className="font-semibold tabular-nums text-violet-300">{stats.total}</span>
                        </div>
                        {stats.avg_total !== null && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs">
                                <span className="text-violet-200/80">Avg score</span>
                                <span className={`font-semibold tabular-nums ${
                                    stats.avg_total >= 5 ? 'text-emerald-400' :
                                    stats.avg_total >= 3 ? 'text-amber-400'   : 'text-rose-400'
                                }`}>
                                    {stats.avg_total.toFixed(1)}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Instruction card */}
                <Card className="p-4 sm:p-5 mb-4 bg-violet-500/10 border border-violet-500/20">
                    <div className="space-y-1.5 text-sm text-violet-200/80">
                        <p><span className="text-violet-300 font-medium">1.</span> Paraphrase the question in your own words</p>
                        <p><span className="text-violet-300 font-medium">2.</span> State your position clearly</p>
                        <p><span className="text-violet-300 font-medium">3.</span> Use BOTH required vocabulary words</p>
                    </div>
                </Card>

                {/* Setup phase */}
                <AnimatePresence mode="wait">
                    {phase === 'setup' && (
                        <motion.div
                            key="setup"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            <Button
                                onClick={handleStart}
                                disabled={starting}
                                className="w-full sm:w-auto bg-violet-500/20 text-violet-200 hover:bg-violet-500/30 border border-violet-500/30 h-12 px-8 text-base"
                            >
                                {starting
                                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Loading…</>
                                    : <><Sparkles className="w-4 h-4 mr-2" />Get a question</>
                                }
                            </Button>
                        </motion.div>
                    )}

                    {(phase === 'writing' || phase === 'loading') && session && (
                        <motion.div
                            key="writing"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="space-y-4"
                        >
                            {/* Question */}
                            <Card className="p-4 sm:p-5 bg-white/3 border border-white/10">
                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 uppercase tracking-wider">
                                        {session.question_type}
                                    </span>
                                </div>
                                <p className="text-white/90 leading-relaxed text-sm sm:text-base">
                                    {session.question}
                                </p>
                            </Card>

                            {/* Required vocabulary */}
                            {session.required_words.length > 0 && (
                                <div>
                                    <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Required vocabulary</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {session.required_words.map((w) => (
                                            <div
                                                key={w.word}
                                                className="rounded-lg bg-violet-500/8 border border-violet-500/20 px-3 py-2"
                                            >
                                                <p className="text-sm font-semibold text-violet-200">{w.word}</p>
                                                <p className="text-xs text-violet-300/60 mt-0.5">{w.definition}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Textarea */}
                            <div>
                                <textarea
                                    value={response}
                                    onChange={(e) => setResponse(e.target.value)}
                                    placeholder="Write your two-sentence introduction here…"
                                    rows={5}
                                    disabled={phase === 'loading'}
                                    className="w-full bg-white/3 border border-white/10 rounded-xl p-4 text-white placeholder:text-white/20 resize-none outline-none focus:border-violet-500/40 text-sm leading-relaxed transition-colors disabled:opacity-50"
                                />
                                <div className="flex items-center justify-between mt-2">
                                    <span className={`text-xs tabular-nums ${
                                        wordCount >= 30 ? 'text-emerald-400' :
                                        wordCount >= 15 ? 'text-amber-400'   : 'text-white/30'
                                    }`}>
                                        {wordCount} word{wordCount === 1 ? '' : 's'} · aim for 30–50
                                    </span>
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={!canSubmit || phase === 'loading'}
                                        className="bg-violet-500/20 text-violet-200 hover:bg-violet-500/30 border border-violet-500/30"
                                    >
                                        {phase === 'loading'
                                            ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Grading…</>
                                            : 'Submit'
                                        }
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {phase === 'result' && result && session && (
                        <motion.div
                            key="result"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="space-y-4"
                        >
                            {/* Score breakdown */}
                            <div className="grid grid-cols-3 gap-2">
                                <ScorePill label="Paraphrase" score={result.paraphrase_score} max={3} />
                                <ScorePill label="Vocabulary" score={result.vocab_score}      max={2} />
                                <ScorePill label="Position"   score={result.position_score}   max={2} />
                            </div>

                            {/* Total score badge */}
                            <div className="flex items-center justify-center py-3">
                                <div className={`flex items-center gap-2 px-5 py-2 rounded-full border text-lg font-bold ${
                                    result.total_score >= 5
                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                        : result.total_score >= 3
                                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                        : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                }`}>
                                    Total: {result.total_score}/7
                                </div>
                            </div>

                            {/* Feedback */}
                            {result.feedback && (
                                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                                    <p className="text-xs text-violet-400/70 uppercase tracking-wider mb-1.5">Feedback</p>
                                    <p className="text-sm text-white/80 leading-relaxed">{result.feedback}</p>
                                </div>
                            )}

                            {/* Model answer */}
                            {result.model_answer && (
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
                                    <p className="text-xs text-blue-400/70 uppercase tracking-wider mb-1.5">Model answer</p>
                                    <p className="text-sm text-blue-100/90 leading-relaxed">{result.model_answer}</p>
                                </div>
                            )}

                            <Button
                                onClick={handleTryAnother}
                                className="w-full bg-violet-500/20 text-violet-200 hover:bg-violet-500/30 border border-violet-500/30"
                            >
                                Try Another
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </CommandGrid>
    )
}

// ─── Score Pill ───────────────────────────────────────────────────────────────

function ScorePill({ label, score, max }: { label: string; score: number; max: number }) {
    const pct = max > 0 ? score / max : 0
    const color = pct >= 0.67 ? 'text-emerald-400' : pct >= 0.34 ? 'text-amber-400' : 'text-rose-400'

    return (
        <div className="rounded-xl bg-white/3 border border-white/8 p-3 text-center">
            <p className="text-xs text-white/40 mb-1 truncate">{label}</p>
            <p className={`text-xl font-bold tabular-nums ${color}`}>
                {score}<span className="text-sm font-normal text-white/30">/{max}</span>
            </p>
        </div>
    )
}
