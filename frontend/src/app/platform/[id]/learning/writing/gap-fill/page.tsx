'use client'

import { useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { StatusBar, CommandGrid } from '@/components/hud'
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    useGapFillNext,
    useGapFillGrade,
    useGapFillStats,
    type GapFillGradeResult,
    type GapFillNext,
} from '@/lib/hooks/use-gap-fill'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'loading' | 'result'

// ─── Sentence parser ──────────────────────────────────────────────────────────

type SentencePart =
    | { kind: 'text'; value: string }
    | { kind: 'word_form'; optionA: string; optionB: string }
    | { kind: 'preposition' }

function parseSentence(sentence: string): SentencePart[] {
    // Pattern: ___ (A / B) → word form gap
    // Pattern: ___ without parens → preposition gap
    const parts: SentencePart[] = []
    // Split on both gap types; we process left-to-right
    const re = /___\s*\(([^/]+)\/([^)]+)\)|___/g
    let last = 0
    let match: RegExpExecArray | null

    while ((match = re.exec(sentence)) !== null) {
        if (match.index > last) {
            parts.push({ kind: 'text', value: sentence.slice(last, match.index) })
        }
        if (match[1] && match[2]) {
            parts.push({ kind: 'word_form', optionA: match[1].trim(), optionB: match[2].trim() })
        } else {
            parts.push({ kind: 'preposition' })
        }
        last = match.index + match[0].length
    }

    if (last < sentence.length) {
        parts.push({ kind: 'text', value: sentence.slice(last) })
    }

    return parts
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GapFillPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [phase, setPhase]           = useState<Phase>('idle')
    const [wordFormChoice, setChoice] = useState<string | null>(null)
    const [prepResponse, setPrep]     = useState('')
    const [result, setResult]         = useState<GapFillGradeResult | null>(null)

    const { data: next, isLoading: loadingNext, refetch } = useGapFillNext()
    const { data: stats }                                  = useGapFillStats()
    const { mutate: grade, isPending: grading }            = useGapFillGrade()

    const needsWordForm = next?.gap_type === 'word_form_only' || next?.gap_type === 'both'
    const needsPrep     = next?.gap_type === 'preposition_only' || next?.gap_type === 'both'

    const canSubmit = useMemo(() => {
        if (!next || grading) return false
        if (needsWordForm && !wordFormChoice) return false
        if (needsPrep && prepResponse.trim().length < 1) return false
        return true
    }, [next, grading, needsWordForm, needsPrep, wordFormChoice, prepResponse])

    const handleSubmit = useCallback(() => {
        if (!next || !canSubmit) return
        setPhase('loading')
        grade(
            {
                word_id: next.word_id,
                ...(needsWordForm && wordFormChoice ? { word_form_response: wordFormChoice } : {}),
                ...(needsPrep && prepResponse.trim() ? { preposition_response: prepResponse.trim() } : {}),
            },
            {
                onSuccess: (data) => {
                    setResult(data)
                    setPhase('result')
                },
                onError: () => setPhase('idle'),
            },
        )
    }, [next, canSubmit, grade, needsWordForm, needsPrep, wordFormChoice, prepResponse])

    const handleNext = useCallback(() => {
        setChoice(null)
        setPrep('')
        setResult(null)
        setPhase('idle')
        refetch()
    }, [refetch])

    const parts = useMemo(() => (next ? parseSentence(next.sentence) : []), [next])

    const gapTypeBadge = next?.gap_type === 'word_form_only'
        ? 'Word Form'
        : next?.gap_type === 'preposition_only'
        ? 'Preposition'
        : 'Word Form + Preposition'

    return (
        <CommandGrid className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto">
                <StatusBar section="Gap Fill Drills" />

                <button
                    onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                    className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Writing</span>
                </button>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
                        <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" />
                        Gap Fill Drills
                    </h1>
                    <p className="text-white/50 mt-1 text-sm">Fill the blank with the correct word form or preposition.</p>
                </motion.div>

                {/* Stats bar */}
                {stats && stats.total > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs">
                            <span className="text-emerald-200/80">Word Form</span>
                            <span className={`font-semibold tabular-nums ${
                                stats.word_form_accuracy >= 70 ? 'text-emerald-400' :
                                stats.word_form_accuracy >= 40 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                                {Math.round(stats.word_form_accuracy)}%
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs">
                            <span className="text-teal-200/80">Preposition</span>
                            <span className={`font-semibold tabular-nums ${
                                stats.preposition_accuracy >= 70 ? 'text-emerald-400' :
                                stats.preposition_accuracy >= 40 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                                {Math.round(stats.preposition_accuracy)}%
                            </span>
                        </div>
                    </div>
                )}

                {loadingNext && (
                    <div className="flex items-center justify-center py-20 gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
                        <p className="text-sm text-white/40">Loading next drill…</p>
                    </div>
                )}

                {!loadingNext && next && (
                    <div className="space-y-4">
                        {/* Word card */}
                        <Card className="p-4 sm:p-5 bg-emerald-500/10 border border-emerald-500/20">
                            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                <h2 className="text-lg font-bold text-emerald-200">{next.word}</h2>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider shrink-0">
                                    {gapTypeBadge}
                                </span>
                            </div>
                            <p className="text-sm text-emerald-300/70 leading-relaxed">{next.definition}</p>
                        </Card>

                        {/* Sentence with interactive gaps */}
                        <Card className="p-4 sm:p-5 bg-white/3 border border-white/10">
                            <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Fill in the gap(s)</p>
                            <div className="text-white/90 leading-loose text-sm sm:text-base flex flex-wrap items-center gap-y-2">
                                {parts.map((part, i) => {
                                    if (part.kind === 'text') {
                                        return <span key={i}>{part.value}</span>
                                    }
                                    if (part.kind === 'word_form') {
                                        return (
                                            <span key={i} className="inline-flex gap-1 mx-1">
                                                <button
                                                    disabled={phase === 'result'}
                                                    onClick={() => setChoice(part.optionA)}
                                                    className={`px-2 py-0.5 rounded border text-sm font-medium transition-colors ${
                                                        wordFormChoice === part.optionA
                                                            ? 'bg-emerald-500/30 border-emerald-400/50 text-emerald-200'
                                                            : 'bg-white/5 border-white/15 text-white/60 hover:border-emerald-500/40'
                                                    } disabled:cursor-default`}
                                                >
                                                    {part.optionA}
                                                </button>
                                                <button
                                                    disabled={phase === 'result'}
                                                    onClick={() => setChoice(part.optionB)}
                                                    className={`px-2 py-0.5 rounded border text-sm font-medium transition-colors ${
                                                        wordFormChoice === part.optionB
                                                            ? 'bg-emerald-500/30 border-emerald-400/50 text-emerald-200'
                                                            : 'bg-white/5 border-white/15 text-white/60 hover:border-emerald-500/40'
                                                    } disabled:cursor-default`}
                                                >
                                                    {part.optionB}
                                                </button>
                                            </span>
                                        )
                                    }
                                    // preposition
                                    return (
                                        <input
                                            key={i}
                                            type="text"
                                            value={prepResponse}
                                            onChange={(e) => setPrep(e.target.value)}
                                            disabled={phase === 'result'}
                                            placeholder="prep"
                                            className="mx-1 w-20 bg-white/5 border border-white/15 rounded px-2 py-0.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-emerald-500/40 transition-colors disabled:opacity-50 disabled:cursor-default"
                                        />
                                    )
                                })}
                            </div>
                        </Card>

                        {/* Submit */}
                        {phase !== 'result' && (
                            <Button
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                                className="bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-500/30"
                            >
                                {phase === 'loading'
                                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Grading…</>
                                    : 'Submit'
                                }
                            </Button>
                        )}

                        {/* Result */}
                        <AnimatePresence>
                            {phase === 'result' && result && (
                                <ResultSection
                                    result={result}
                                    next={next}
                                    wordFormChoice={wordFormChoice}
                                    prepResponse={prepResponse}
                                    onNext={handleNext}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </CommandGrid>
    )
}

// ─── Result Section ───────────────────────────────────────────────────────────

function GapBadge({ correct, given, answer }: { correct: boolean | null; given: string; answer: string | null }) {
    const ok = correct === true
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
            {ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{ok ? given : <>{given}<span className="opacity-60"> → correct: {answer}</span></>}</span>
        </div>
    )
}

function ResultSection({ result, next, wordFormChoice, prepResponse, onNext }: {
    result: GapFillGradeResult; next: GapFillNext
    wordFormChoice: string | null; prepResponse: string; onNext: () => void
}) {
    const hasWordForm = result.word_form_correct !== null
    const hasPrep     = result.preposition_correct !== null
    const allCorrect  = (!hasWordForm || result.word_form_correct === true) && (!hasPrep || result.preposition_correct === true)
    const explanation = result.explanation ?? next.explanation

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className={`flex items-center gap-3 rounded-xl border p-4 ${allCorrect ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                {allCorrect ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
                <p className={`font-semibold ${allCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>{allCorrect ? 'Correct!' : 'Not quite'}</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {hasWordForm && <GapBadge correct={result.word_form_correct} given={wordFormChoice ?? ''} answer={result.word_form_answer} />}
                {hasPrep     && <GapBadge correct={result.preposition_correct} given={`"${prepResponse}"`} answer={result.preposition_answer} />}
            </div>

            {explanation && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="text-xs text-emerald-400/70 uppercase tracking-wider mb-1.5">Explanation</p>
                    <p className="text-sm text-white/80 leading-relaxed">{explanation}</p>
                </div>
            )}

            <Button onClick={onNext} className="w-full bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-500/30">
                Next Drill
            </Button>
        </motion.div>
    )
}
