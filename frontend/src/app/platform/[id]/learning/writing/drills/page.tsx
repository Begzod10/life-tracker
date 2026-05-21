'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, Target as TargetIcon, CheckCircle2, XCircle, Sparkles, Archive,
    BookOpen, Eye, Layers, RotateCcw,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    useEssayDrillsDue, useEssayDrillsSummary, useEssayDrillReview, useEssayDrillArchive,
    type EssayError,
} from '@/lib/hooks/use-essays'

const KIND_COLOR: Record<string, string> = {
    grammar: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    vocab: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    style: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    cohesion: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    clarity: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    upgrade: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    task_response: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

const KINDS: Array<{ value: string; label: string }> = [
    { value: '', label: 'All' },
    { value: 'grammar', label: 'Grammar' },
    { value: 'vocab', label: 'Vocab' },
    { value: 'style', label: 'Style' },
    { value: 'cohesion', label: 'Cohesion' },
    { value: 'clarity', label: 'Clarity' },
    { value: 'upgrade', label: 'Upgrades' },
]

export default function ErrorDrillsPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [kind, setKind] = useState<string>('')
    const { data: drills = [], isLoading, refetch } = useEssayDrillsDue({ kind: kind || undefined, limit: 50 })
    const { data: summary } = useEssayDrillsSummary()
    const { mutate: review, isPending: reviewing } = useEssayDrillReview()
    const { mutate: archive } = useEssayDrillArchive()

    const [index, setIndex] = useState(0)
    const [revealed, setRevealed] = useState(false)
    const [stats, setStats] = useState({ correct: 0, wrong: 0 })

    // Reset session when filter changes.
    useEffect(() => {
        setIndex(0)
        setRevealed(false)
        setStats({ correct: 0, wrong: 0 })
    }, [kind])

    const card = drills[index]
    const done = !isLoading && (drills.length === 0 || index >= drills.length)

    const handleReview = (correct: boolean) => {
        if (!card) return
        review(
            { id: card.id, correct },
            {
                onSuccess: () => {
                    setStats(s => correct ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 })
                    setRevealed(false)
                    setIndex(i => i + 1)
                },
            },
        )
    }

    const handleArchive = () => {
        if (!card) return
        archive(card.id, {
            onSuccess: () => {
                setRevealed(false)
                setIndex(i => i + 1)
            },
        })
    }

    const handleRestart = () => {
        setIndex(0)
        setRevealed(false)
        setStats({ correct: 0, wrong: 0 })
        refetch()
    }

    const remaining = Math.max(0, drills.length - index)

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-3xl mx-auto">
                <button
                    onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                    className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Writing</span>
                </button>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 sm:mb-8 flex items-end justify-between gap-4"
                >
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
                            <TargetIcon className="w-6 h-6 sm:w-8 sm:h-8 text-rose-400 shrink-0" />
                            Error drills
                        </h1>
                        <p className="text-xs sm:text-sm text-white/50 mt-1">
                            Spaced repetition over the mistakes deep review caught — turn errors into reflexes.
                        </p>
                    </div>
                    {summary && (
                        <div className="text-right shrink-0">
                            <p className="text-xl sm:text-2xl font-bold text-rose-300">{summary.due}</p>
                            <p className="text-[10px] uppercase tracking-wider text-white/40">due today</p>
                        </div>
                    )}
                </motion.div>

                <SummaryStrip summary={summary} />

                {/* Kind filter */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {KINDS.map(k => {
                        const active = kind === k.value
                        const count = k.value ? summary?.by_kind?.[k.value] : summary?.total
                        return (
                            <button
                                key={k.value || 'all'}
                                onClick={() => setKind(k.value)}
                                className={
                                    'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ' +
                                    (active
                                        ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                                        : 'bg-white/2.5 text-white/60 border-white/10 hover:text-white hover:bg-white/5')
                                }
                            >
                                {k.label}
                                {count !== undefined && count > 0 && (
                                    <span className="ml-1.5 text-[10px] text-white/40">{count}</span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Card */}
                {isLoading ? (
                    <Card className="p-10 bg-white/2.5 border border-white/5 text-center">
                        <p className="text-white/40">Loading drills…</p>
                    </Card>
                ) : done ? (
                    <CompletionCard
                        stats={stats}
                        had={drills.length}
                        onRestart={handleRestart}
                        onBack={() => router.push(`/platform/${params.id}/learning/writing`)}
                    />
                ) : card ? (
                    <DrillCard
                        card={card}
                        index={index}
                        total={drills.length}
                        revealed={revealed}
                        onReveal={() => setRevealed(true)}
                        onReview={handleReview}
                        onArchive={handleArchive}
                        reviewing={reviewing}
                    />
                ) : null}

                {/* Footer stats */}
                {!isLoading && !done && (
                    <div className="mt-6 flex items-center justify-between text-xs text-white/40">
                        <span>{remaining} card{remaining === 1 ? '' : 's'} left in this session</span>
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1 text-emerald-300">
                                <CheckCircle2 className="w-3 h-3" /> {stats.correct}
                            </span>
                            <span className="flex items-center gap-1 text-rose-300">
                                <XCircle className="w-3 h-3" /> {stats.wrong}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function SummaryStrip({ summary }: { summary: { total: number; due: number; learned: number } | undefined }) {
    if (!summary) return null
    return (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            <StatTile icon={<Layers className="w-4 h-4" />} label="Total cards" value={summary.total} accent="text-white/80" />
            <StatTile icon={<TargetIcon className="w-4 h-4" />} label="Due now" value={summary.due} accent="text-rose-300" />
            <StatTile icon={<Sparkles className="w-4 h-4" />} label="Mastering" value={summary.learned} accent="text-emerald-300" />
        </div>
    )
}

function StatTile({ icon, label, value, accent }: {
    icon: React.ReactNode
    label: string
    value: number
    accent: string
}) {
    return (
        <Card className="p-2.5 sm:p-3 bg-white/2.5 border border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                <span className="text-[10px] sm:text-xs text-white/50 flex items-center gap-1 sm:gap-1.5 min-w-0">
                    <span className="shrink-0">{icon}</span>
                    <span className="truncate">{label}</span>
                </span>
                <span className={`text-base sm:text-lg font-bold ${accent}`}>{value}</span>
            </div>
        </Card>
    )
}

function DrillCard({ card, index, total, revealed, onReveal, onReview, onArchive, reviewing }: {
    card: EssayError
    index: number
    total: number
    revealed: boolean
    onReveal: () => void
    onReview: (correct: boolean) => void
    onArchive: () => void
    reviewing: boolean
}) {
    const isUpgrade = card.kind === 'upgrade'
    const kindStyle = KIND_COLOR[card.kind] || 'bg-white/5 text-white/60 border-white/10'

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
            >
                <Card className="p-6 bg-white/2.5 border border-white/10">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${kindStyle}`}>
                                {card.kind}
                            </span>
                            {card.level && (
                                <span className="text-[10px] uppercase tracking-wider text-white/40">{card.level}</span>
                            )}
                            <span className="text-[10px] text-white/30">
                                {card.review_count > 0
                                    ? `${card.correct_count}/${card.review_count} correct · interval ${card.interval_days}d`
                                    : 'new card'}
                            </span>
                        </div>
                        <span className="text-xs text-white/40">{index + 1} / {total}</span>
                    </div>

                    <p className="text-xs uppercase tracking-wider text-white/40 mb-2">
                        {isUpgrade ? 'What stronger phrase fits here?' : 'What\'s wrong with this and how would you fix it?'}
                    </p>
                    <p className="text-lg text-white/90 italic leading-relaxed mb-4">
                        &ldquo;{card.original}&rdquo;
                    </p>

                    <AnimatePresence>
                        {revealed && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-3 border-t border-white/5 pt-4">
                                    {card.explanation && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Why</p>
                                            <p className="text-sm text-white/80 leading-relaxed">{card.explanation}</p>
                                        </div>
                                    )}
                                    {card.suggestion && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-emerald-300 mb-1">Better</p>
                                            <p className="text-sm text-emerald-200 leading-relaxed">{card.suggestion}</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="mt-5 flex items-center justify-between gap-3">
                        <button
                            onClick={onArchive}
                            className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors"
                            title="Dismiss this card from drills"
                        >
                            <Archive className="w-3 h-3" />
                            Archive
                        </button>

                        {!revealed ? (
                            <Button
                                onClick={onReveal}
                                className="bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
                            >
                                <Eye className="w-4 h-4 mr-2" />
                                Show answer
                            </Button>
                        ) : (
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => onReview(false)}
                                    disabled={reviewing}
                                    className="bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
                                >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Missed it
                                </Button>
                                <Button
                                    onClick={() => onReview(true)}
                                    disabled={reviewing}
                                    className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                                >
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Got it
                                </Button>
                            </div>
                        )}
                    </div>
                </Card>
            </motion.div>
        </AnimatePresence>
    )
}

function CompletionCard({ stats, had, onRestart, onBack }: {
    stats: { correct: number; wrong: number }
    had: number
    onRestart: () => void
    onBack: () => void
}) {
    const total = stats.correct + stats.wrong
    const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0
    return (
        <Card className="p-8 bg-white/2.5 border border-emerald-500/20 text-center">
            <Sparkles className="w-10 h-10 text-emerald-400/70 mx-auto mb-3" />
            <h2 className="text-xl font-semibold text-white mb-1">
                {had === 0 ? 'No drills due right now' : 'Session complete'}
            </h2>
            <p className="text-sm text-white/60 mb-5">
                {had === 0
                    ? 'Write more essays and run deep review to grow your drill deck.'
                    : `You answered ${stats.correct}/${total} correctly (${pct}%).`}
            </p>
            <div className="flex justify-center gap-2">
                <Button
                    variant="ghost"
                    onClick={onBack}
                    className="text-white/70 hover:text-white border border-white/10"
                >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Back to writing
                </Button>
                {had > 0 && (
                    <Button
                        onClick={onRestart}
                        className="bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reload due cards
                    </Button>
                )}
            </div>
        </Card>
    )
}
