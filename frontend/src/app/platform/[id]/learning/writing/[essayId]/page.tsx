'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    ArrowLeft, Save, Sparkles, ZapIcon, CheckCircle2, AlertTriangle, Target as TargetIcon,
    Clock, Trophy, Lightbulb,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    useEssay, useEssayUpdate, useEssayQuickCheck, useEssayDeepReview, useEssayAttempts,
    type Essay, type EssayDeepSentence, type EssayAttempt,
} from '@/lib/hooks/use-essays'

const LEVEL_COLOR: Record<string, string> = {
    A1: 'text-green-400', A2: 'text-emerald-400',
    B1: 'text-blue-400', B2: 'text-indigo-400',
    C1: 'text-purple-400', C2: 'text-rose-400',
}

const ISSUE_COLOR: Record<string, string> = {
    grammar: 'border-rose-500/30 bg-rose-500/5',
    vocab: 'border-amber-500/30 bg-amber-500/5',
    style: 'border-sky-500/30 bg-sky-500/5',
    cohesion: 'border-violet-500/30 bg-violet-500/5',
    clarity: 'border-emerald-500/30 bg-emerald-500/5',
}

function countWords(s: string) {
    if (!s) return 0
    const m = s.match(/\b[\w'\-]+\b/g)
    return m ? m.length : 0
}

export default function EssayEditorPage() {
    const params = useParams<{ id: string; essayId: string }>()
    const router = useRouter()
    const essayId = Number(params.essayId)

    const { data: essay, isLoading } = useEssay(essayId)
    const { data: attempts = [] } = useEssayAttempts(essayId)
    const { mutate: update, isPending: saving } = useEssayUpdate()
    const { mutate: quickCheck, isPending: checking, error: quickError } = useEssayQuickCheck()
    const { mutate: deepReview, isPending: reviewing, error: deepError } = useEssayDeepReview()

    const [body, setBody] = useState('')
    const [title, setTitle] = useState('')
    const [dirty, setDirty] = useState(false)
    const tickRef = useRef<number>(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (essay && !dirty) {
            setBody(essay.body || '')
            setTitle(essay.title || '')
        }
    }, [essay, dirty])

    // Time tracker — runs while page is open
    useEffect(() => {
        if (!essay) return
        timerRef.current = setInterval(() => { tickRef.current += 1 }, 1000)
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [essay])

    const wordCount = useMemo(() => countWords(body), [body])
    const target = essay?.target_word_count || 0
    const progress = target > 0 ? Math.min(100, Math.round((wordCount / target) * 100)) : 0

    const usedTargets = useMemo(() => {
        if (!essay?.target_words?.length) return new Set<string>()
        const lower = body.toLowerCase()
        return new Set(essay.target_words.filter(w => lower.includes(w.toLowerCase())).map(w => w.toLowerCase()))
    }, [body, essay?.target_words])

    const persistedTimeRef = useRef(0)
    useEffect(() => {
        if (essay) persistedTimeRef.current = essay.time_spent_seconds
    }, [essay])

    const handleSave = () => {
        if (!essay) return
        const elapsed = tickRef.current
        update(
            {
                id: essay.id,
                data: {
                    body,
                    title: title || null,
                    time_spent_seconds: persistedTimeRef.current + elapsed,
                },
            },
            {
                onSuccess: () => {
                    persistedTimeRef.current += elapsed
                    tickRef.current = 0
                    setDirty(false)
                },
            },
        )
    }

    const handleQuickCheck = () => {
        if (!essay) return
        // Save first
        update(
            {
                id: essay.id,
                data: { body, title: title || null, time_spent_seconds: persistedTimeRef.current + tickRef.current },
            },
            { onSuccess: () => quickCheck(essay.id) },
        )
    }

    const handleDeepReview = () => {
        if (!essay) return
        update(
            {
                id: essay.id,
                data: {
                    body,
                    title: title || null,
                    time_spent_seconds: persistedTimeRef.current + tickRef.current,
                    status: 'submitted',
                },
            },
            { onSuccess: () => deepReview(essay.id) },
        )
    }

    if (isLoading || !essay) {
        return (
            <div className="min-h-screen p-8">
                <p className="text-white/40">Loading…</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-6xl mx-auto">
                <button
                    onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                    className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Writing</span>
                </button>

                {/* Prompt header */}
                <Card className="p-5 mb-6 bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-semibold ${LEVEL_COLOR[essay.level]}`}>{essay.level}</span>
                                <span className="text-xs text-white/30">•</span>
                                <span className="text-xs text-white/50 capitalize">{essay.status}</span>
                            </div>
                            <p className="text-white/90 leading-relaxed">{essay.prompt}</p>
                        </div>
                        {target > 0 && (
                            <div className="text-right shrink-0">
                                <p className="text-2xl font-bold text-white">{wordCount}<span className="text-white/30 text-sm">/{target}</span></p>
                                <p className="text-[10px] uppercase tracking-wider text-white/40">words</p>
                            </div>
                        )}
                    </div>

                    {/* Target words */}
                    {essay.target_words && essay.target_words.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-amber-500/10">
                            <p className="text-xs uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1">
                                <TargetIcon className="w-3 h-3" /> Try to use
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {essay.target_words.map(w => {
                                    const used = usedTargets.has(w.toLowerCase())
                                    return (
                                        <span
                                            key={w}
                                            className={
                                                used
                                                    ? 'px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                                    : 'px-2 py-0.5 rounded text-xs bg-white/5 text-white/60 border border-white/10'
                                            }
                                        >
                                            {used && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                            {w}
                                        </span>
                                    )
                                })}
                            </div>
                            <p className="text-[10px] text-white/30 mt-2">
                                {usedTargets.size}/{essay.target_words.length} used
                            </p>
                        </div>
                    )}

                    {target > 0 && (
                        <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-amber-400"
                            />
                        </div>
                    )}
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Editor */}
                    <div className="lg:col-span-2 space-y-4">
                        <input
                            type="text"
                            placeholder="Title (optional)"
                            value={title}
                            onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
                            className="w-full bg-transparent text-2xl font-semibold text-white placeholder:text-white/30 outline-none border-b border-transparent focus:border-amber-500/30 pb-2"
                        />

                        <textarea
                            value={body}
                            onChange={(e) => { setBody(e.target.value); setDirty(true) }}
                            placeholder="Start writing…"
                            rows={20}
                            className="w-full bg-[#0f0f1a] border border-[#2a2b36] focus:border-amber-500/40 rounded-lg p-4 text-white placeholder:text-white/30 resize-y leading-relaxed outline-none transition-colors"
                            style={{ minHeight: '420px' }}
                        />

                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-3 text-xs text-white/50">
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {Math.floor((persistedTimeRef.current + tickRef.current) / 60)}m
                                </span>
                                <span>{wordCount} words</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="ghost"
                                    onClick={handleSave}
                                    disabled={saving || !dirty}
                                    className="text-white/70 hover:text-white"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {saving ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
                                </Button>
                                <Button
                                    onClick={handleQuickCheck}
                                    disabled={checking || !body.trim()}
                                    className="bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
                                >
                                    <ZapIcon className="w-4 h-4 mr-2" />
                                    {checking ? 'Checking…' : 'Quick check'}
                                </Button>
                                <Button
                                    onClick={handleDeepReview}
                                    disabled={reviewing || !body.trim()}
                                    className="bg-amber-500 hover:bg-amber-500/90 text-black"
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {reviewing ? 'Reviewing…' : 'Deep review'}
                                </Button>
                            </div>
                        </div>

                        {(quickError || deepError) && (
                            <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300">
                                {(quickError || deepError)?.message}
                            </div>
                        )}
                    </div>

                    {/* Feedback panel */}
                    <div className="space-y-4">
                        {attempts.length > 0 && <AttemptHistory attempts={attempts} />}
                        {essay.deep_score !== null && essay.deep_review ? (
                            <DeepReviewPanel essay={essay} />
                        ) : essay.quick_score !== null && essay.quick_feedback ? (
                            <QuickFeedbackPanel essay={essay} />
                        ) : (
                            <Card className="p-6 bg-white/2.5 border border-white/5 text-center">
                                <Lightbulb className="w-8 h-8 text-amber-400/50 mx-auto mb-2" />
                                <p className="text-sm text-white/60">
                                    Quick check gives a fast score and 3 suggestions.<br />
                                    Deep review gives sentence-by-sentence feedback.
                                </p>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function QuickFeedbackPanel({ essay }: { essay: Essay }) {
    const fb = essay.quick_feedback!
    return (
        <Card className="p-5 bg-white/2.5 border border-amber-500/20">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    Quick check
                </h3>
                <div className="text-right">
                    <p className="text-3xl font-bold text-amber-400">{essay.quick_score}</p>
                    {fb.level_estimate && (
                        <p className="text-[10px] text-white/40">est. {fb.level_estimate}</p>
                    )}
                </div>
            </div>

            <Section title="Strengths" items={fb.strengths} color="text-emerald-300" Icon={CheckCircle2} />
            <Section title="Improvements" items={fb.improvements} color="text-rose-300" Icon={AlertTriangle} />
            <Section title="Suggestions" items={fb.suggestions} color="text-sky-300" Icon={Lightbulb} />
        </Card>
    )
}

function Section({ title, items, color, Icon }: { title: string; items: string[]; color: string; Icon: React.ComponentType<{ className?: string }> }) {
    if (!items || items.length === 0) return null
    return (
        <div className="mb-4 last:mb-0">
            <p className={`text-xs uppercase tracking-wider ${color} mb-2 flex items-center gap-1`}>
                <Icon className="w-3 h-3" /> {title}
            </p>
            <ul className="space-y-1.5">
                {items.map((s, i) => (
                    <li key={i} className="text-sm text-white/80 leading-relaxed">• {s}</li>
                ))}
            </ul>
        </div>
    )
}

function DeepReviewPanel({ essay }: { essay: Essay }) {
    const review = essay.deep_review!
    return (
        <div className="space-y-4">
            <Card className="p-5 bg-white/2.5 border border-amber-500/30">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        Deep review
                    </h3>
                    <div className="text-right">
                        <p className="text-3xl font-bold text-amber-400">{essay.deep_score}</p>
                        {review.level_estimate && (
                            <p className="text-[10px] text-white/40">est. {review.level_estimate}</p>
                        )}
                    </div>
                </div>

                {review.overall && (
                    <p className="text-sm text-white/80 leading-relaxed mb-4">{review.overall}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                    <CriterionBar label="Task response" value={review.criteria.task_response} />
                    <CriterionBar label="Coherence" value={review.criteria.coherence_cohesion} />
                    <CriterionBar label="Vocabulary" value={review.criteria.vocabulary} />
                    <CriterionBar label="Grammar" value={review.criteria.grammar} />
                </div>
            </Card>

            {review.sentences && review.sentences.length > 0 && (
                <Card className="p-5 bg-white/2.5 border border-white/10">
                    <h4 className="text-sm uppercase tracking-wider text-white/60 mb-3">Sentence fixes</h4>
                    <div className="space-y-3">
                        {review.sentences.map((s: EssayDeepSentence, i: number) => (
                            <div key={i} className={`p-3 rounded-md border ${ISSUE_COLOR[s.issue] || 'border-white/10 bg-white/2.5'}`}>
                                <span className="text-[10px] uppercase tracking-wider text-white/40">{s.issue || 'note'}</span>
                                <p className="text-sm text-white/80 mt-1 italic">&ldquo;{s.original}&rdquo;</p>
                                <p className="text-xs text-white/60 mt-1">{s.explanation}</p>
                                {s.suggestion && (
                                    <p className="text-sm text-emerald-300 mt-2">→ {s.suggestion}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {review.vocabulary_upgrades && review.vocabulary_upgrades.length > 0 && (
                <Card className="p-5 bg-white/2.5 border border-white/10">
                    <h4 className="text-sm uppercase tracking-wider text-white/60 mb-3">Vocab upgrades</h4>
                    <div className="space-y-2">
                        {review.vocabulary_upgrades.map((u, i) => (
                            <div key={i} className="text-sm">
                                <span className="text-rose-300">{u.from}</span>
                                <span className="text-white/30 mx-2">→</span>
                                <span className="text-emerald-300 font-medium">{u.to}</span>
                                {u.why && <p className="text-xs text-white/50 mt-0.5 ml-1">{u.why}</p>}
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    )
}

function CriterionBar({ label, value }: { label: string; value: number }) {
    const pct = Math.round((value / 25) * 100)
    return (
        <div>
            <div className="flex justify-between text-xs mb-1">
                <span className="text-white/60">{label}</span>
                <span className="text-white/80 font-medium">{value}/25</span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
            </div>
        </div>
    )
}

function AttemptHistory({ attempts }: { attempts: EssayAttempt[] }) {
    const sorted = [...attempts].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const latest = sorted[sorted.length - 1]
    const first = sorted[0]
    const delta = sorted.length > 1 ? latest.score - first.score : null

    return (
        <Card className="p-4 bg-white/2.5 border border-white/10">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs uppercase tracking-wider text-white/60">Score history</h4>
                {delta !== null && (
                    <span className={delta >= 0 ? 'text-xs font-semibold text-emerald-400' : 'text-xs font-semibold text-rose-400'}>
                        {delta >= 0 ? '+' : ''}{delta} since first
                    </span>
                )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
                {sorted.map((a, i) => {
                    const isLast = i === sorted.length - 1
                    return (
                        <div key={a.id} className="flex items-center gap-1">
                            <div
                                title={`${a.kind} — ${new Date(a.created_at).toLocaleString()}`}
                                className={
                                    a.kind === 'deep'
                                        ? 'min-w-[2.5rem] px-2 py-1.5 rounded text-center text-sm font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300'
                                        : 'min-w-[2.5rem] px-2 py-1.5 rounded text-center text-sm font-semibold bg-white/5 border border-white/10 text-white/80'
                                }
                            >
                                {a.score}
                            </div>
                            {!isLast && <span className="text-white/30 text-xs">→</span>}
                        </div>
                    )
                })}
            </div>
            <p className="text-[10px] text-white/40 mt-2">
                {sorted.length} attempt{sorted.length === 1 ? '' : 's'}
                <span className="ml-2">
                    <span className="inline-block w-2 h-2 rounded bg-amber-500/40 mr-1" />deep
                    <span className="inline-block w-2 h-2 rounded bg-white/20 ml-2 mr-1" />quick
                </span>
            </p>
        </Card>
    )
}
