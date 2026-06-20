'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { StatusBar, CommandGrid } from '@/components/hud'
import { ArrowLeft, CheckCircle2, XCircle, TrendingUp, BarChart2, BookOpen, AlertTriangle, ChevronDown, CalendarRange, X } from 'lucide-react'
import {
    useExerciseStats,
    useExerciseAnalytics,
    useExerciseHistory,
    type ExerciseAttempt,
    type ExerciseType,
} from '@/lib/hooks/use-exercises'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
    sentence: 'Sentence',
    constrained_sentence: 'Constrained',
    paraphrase: 'Paraphrase',
    prompt_response: 'Prompt',
    meaning_mc: 'Meaning MC',
    reverse_mc: 'Reverse MC',
    cloze: 'Fill-blank',
    spelling: 'Spelling',
    anagram: 'Anagram',
    match: 'Match',
    cloze_bank: 'Cloze bank',
    word_formation: 'Word form',
    synonym_antonym: 'Synonym/ant.',
    odd_one_out: 'Odd one out',
    error_correction: 'Error fix',
}

const PERIOD_OPTIONS = [
    { label: '7d', value: 7 },
    { label: '14d', value: 14 },
    { label: '30d', value: 30 },
    { label: '60d', value: 60 },
    { label: '90d', value: 90 },
]

type Filter = 'all' | 'correct' | 'wrong'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string | null): string {
    if (!iso) return ''
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    const d = Math.floor(diff / 86400)
    return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString()
}

function accuracyColor(pct: number): string {
    if (pct >= 80) return 'text-emerald-400'
    if (pct >= 60) return 'text-cyan-400'
    return 'text-red-400'
}

function accuracyBg(pct: number): string {
    if (pct >= 80) return 'bg-emerald-500'
    if (pct >= 60) return 'bg-cyan-500'
    return 'bg-red-500'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-white/4 px-4 py-3">
            <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
            <span className="text-2xl font-bold text-white">{value}</span>
            {sub && <span className="text-xs text-white/40">{sub}</span>}
        </div>
    )
}

function TrendBar({ date, accuracy, attempts }: { date: string; accuracy: number; attempts: number }) {
    const label = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return (
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${label}: ${accuracy}% (${attempts} attempts)`}>
            <div className="w-full flex items-end justify-center" style={{ height: 48 }}>
                <div
                    className={`w-full rounded-t transition-all ${accuracyBg(accuracy)}`}
                    style={{ height: `${Math.max(4, accuracy / 100 * 48)}px`, opacity: 0.7 + attempts * 0.03 > 1 ? 1 : 0.7 + attempts * 0.03 }}
                />
            </div>
            <span className="text-[9px] text-white/30 truncate w-full text-center">{label}</span>
        </div>
    )
}

function AttemptRow({ attempt }: { attempt: ExerciseAttempt }) {
    const [expanded, setExpanded] = useState(false)
    const hasDetails = !!(attempt.feedback || attempt.suggested_revision)

    return (
        <div className={`rounded-xl border transition-colors ${
            attempt.is_correct
                ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                : 'border-red-500/20 bg-red-500/[0.04]'
        }`}>
            <button
                className="w-full text-left p-3 flex items-start gap-3"
                onClick={() => hasDetails && setExpanded(e => !e)}
            >
                <div className="mt-0.5 shrink-0">
                    {attempt.is_correct
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <XCircle className="w-4 h-4 text-red-400" />}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white truncate">
                            {attempt.word ?? `word #${attempt.word_id}`}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/40">
                            {TYPE_LABELS[attempt.exercise_type] ?? attempt.exercise_type}
                        </span>
                        {attempt.usage_score !== null && (
                            <span className={`text-[10px] font-semibold ${accuracyColor(attempt.usage_score)}`}>
                                {attempt.usage_score}/100
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-white/55 mt-1 line-clamp-2 break-words">
                        {attempt.response || '—'}
                    </p>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[10px] text-white/30">{relTime(attempt.created_at)}</span>
                    {hasDetails && (
                        <ChevronDown className={`w-3 h-3 text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    )}
                </div>
            </button>

            {expanded && hasDetails && (
                <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
                    {attempt.feedback && (
                        <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Feedback</p>
                            <p className="text-xs text-white/65">{attempt.feedback}</p>
                        </div>
                    )}
                    {attempt.suggested_revision && (
                        <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Suggested revision</p>
                            <p className="text-xs text-emerald-300/80 italic">{attempt.suggested_revision}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExerciseHistoryPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [period, setPeriod] = useState(30)
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [filter, setFilter] = useState<Filter>('all')
    const [historyLimit, setHistoryLimit] = useState(50)

    const dateRangeActive = !!(fromDate && toDate)

    const { data: stats } = useExerciseStats()
    const { data: analytics, isLoading: analyticsLoading } = useExerciseAnalytics(
        period,
        dateRangeActive ? fromDate : undefined,
        dateRangeActive ? toDate : undefined,
    )
    const { data: history = [], isLoading: historyLoading } = useExerciseHistory(
        historyLimit,
        undefined,
        dateRangeActive ? fromDate : undefined,
        dateRangeActive ? toDate : undefined,
    )

    const filtered = history.filter(a =>
        filter === 'all' ? true : filter === 'correct' ? a.is_correct : !a.is_correct
    )

    return (
        <div className="min-h-screen text-white">
            <CommandGrid className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
                <StatusBar section="Exercise History" />

                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <button
                        onClick={() => router.push(`/platform/${params.id}/learning/exercises`)}
                        className="text-white/50 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold">Exercise History</h1>
                        <p className="text-xs text-white/40">All-time performance &amp; attempt log</p>
                    </div>
                </div>

                {/* All-time stat cards */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        <StatCard label="Accuracy" value={`${stats.accuracy}%`} sub="all time" />
                        <StatCard label="Attempts" value={stats.total} sub="all time" />
                        <StatCard label="Correct" value={stats.correct} sub="all time" />
                        <StatCard label="Last 7 days" value={stats.last_7d_total} sub={`${stats.last_7d_correct} correct`} />
                    </div>
                )}

                {/* Period + date range filter */}
                <div className="space-y-2 mb-5">
                    <div className={`flex items-center gap-2 ${dateRangeActive ? 'opacity-40 pointer-events-none' : ''}`}>
                        <TrendingUp className="w-4 h-4 text-white/30 shrink-0" />
                        <span className="text-xs text-white/40 mr-1">Period:</span>
                        {PERIOD_OPTIONS.map(o => (
                            <button
                                key={o.value}
                                onClick={() => setPeriod(o.value)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    period === o.value
                                        ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40'
                                        : 'text-white/40 hover:text-white/70 border border-white/10'
                                }`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <CalendarRange className="w-4 h-4 text-white/30 shrink-0" />
                        <span className="text-xs text-white/40">Range:</span>
                        <input
                            type="date"
                            value={fromDate}
                            max={toDate || undefined}
                            onChange={e => setFromDate(e.target.value)}
                            className="bg-white/5 border border-white/12 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-indigo-500/50 [color-scheme:dark]"
                        />
                        <span className="text-xs text-white/30">—</span>
                        <input
                            type="date"
                            value={toDate}
                            min={fromDate || undefined}
                            onChange={e => setToDate(e.target.value)}
                            className="bg-white/5 border border-white/12 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-indigo-500/50 [color-scheme:dark]"
                        />
                        {dateRangeActive && (
                            <button
                                onClick={() => { setFromDate(''); setToDate('') }}
                                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors ml-1"
                                title="Clear date range"
                            >
                                <X className="w-3 h-3" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Analytics section */}
                {analyticsLoading ? (
                    <div className="h-32 rounded-xl border border-white/8 bg-white/4 animate-pulse mb-6" />
                ) : analytics && (
                    <div className="space-y-4 mb-6">
                        {/* Period summary */}
                        {(() => {
                            const sub = dateRangeActive
                                ? `${fromDate} → ${toDate}`
                                : `last ${period}d`
                            return (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <StatCard label="Accuracy" value={`${analytics.overall_accuracy}%`} sub={sub} />
                                    <StatCard label="Attempts" value={analytics.total_attempts} sub={sub} />
                                    <StatCard label="Correct" value={analytics.total_correct} sub={sub} />
                                    {analytics.avg_usage_score !== null && (
                                        <StatCard label="Avg score" value={analytics.avg_usage_score} sub="usage score" />
                                    )}
                                </div>
                            )
                        })()}

                        {/* Daily accuracy trend */}
                        {analytics.accuracy_trend.length > 0 && (
                            <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <BarChart2 className="w-4 h-4 text-white/30" />
                                    <span className="text-xs text-white/50 font-medium">Daily accuracy</span>
                                </div>
                                <div className="flex items-end gap-1">
                                    {analytics.accuracy_trend.map(pt => (
                                        <TrendBar
                                            key={pt.date}
                                            date={pt.date}
                                            accuracy={pt.accuracy}
                                            attempts={pt.attempts}
                                        />
                                    ))}
                                </div>
                                <div className="flex justify-between mt-2">
                                    <span className="text-[9px] text-white/20">0%</span>
                                    <span className="text-[9px] text-white/20">100%</span>
                                </div>
                            </div>
                        )}

                        {/* Exercise type breakdown */}
                        {analytics.exercise_type_stats.length > 0 && (
                            <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <BookOpen className="w-4 h-4 text-white/30" />
                                    <span className="text-xs text-white/50 font-medium">By exercise type</span>
                                </div>
                                <div className="space-y-2">
                                    {[...analytics.exercise_type_stats]
                                        .sort((a, b) => b.attempts - a.attempts)
                                        .map(t => (
                                            <div key={t.type} className="flex items-center gap-3">
                                                <span className="text-xs text-white/60 w-24 shrink-0">
                                                    {TYPE_LABELS[t.type] ?? t.type}
                                                </span>
                                                <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${accuracyBg(t.accuracy)}`}
                                                        style={{ width: `${t.accuracy}%` }}
                                                    />
                                                </div>
                                                <span className={`text-xs font-medium w-10 text-right ${accuracyColor(t.accuracy)}`}>
                                                    {t.accuracy}%
                                                </span>
                                                <span className="text-[10px] text-white/30 w-16 text-right">
                                                    {t.correct}/{t.attempts}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Grammar weak areas */}
                        {analytics.grammar_weak_areas.length > 0 && (
                            <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle className="w-4 h-4 text-rose-400/60" />
                                    <span className="text-xs text-rose-300/60 font-medium">Grammar weak areas</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {analytics.grammar_weak_areas.map(g => (
                                        <span
                                            key={g.type}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-xs text-rose-300/80"
                                        >
                                            {g.label}
                                            <span className="text-rose-400/60 font-semibold">{g.count}×</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Attempt log */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-white/80">Attempt log</h2>
                        <div className="flex gap-1">
                            {(['all', 'correct', 'wrong'] as Filter[]).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors ${
                                        filter === f
                                            ? f === 'correct'
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                : f === 'wrong'
                                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                    : 'bg-white/10 text-white border border-white/20'
                                            : 'text-white/40 hover:text-white/60 border border-transparent'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {historyLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="h-16 rounded-xl border border-white/8 bg-white/4 animate-pulse" />
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-xl border border-white/8 bg-white/4 p-8 text-center text-sm text-white/30">
                            No {filter === 'all' ? '' : filter} attempts yet.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map(a => <AttemptRow key={a.id} attempt={a} />)}
                        </div>
                    )}

                    {/* Load more */}
                    {filtered.length >= historyLimit && (
                        <button
                            onClick={() => setHistoryLimit(l => l + 50)}
                            className="mt-4 w-full py-2.5 rounded-xl border border-white/10 text-xs text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors"
                        >
                            Load more
                        </button>
                    )}
                </div>
            </CommandGrid>
        </div>
    )
}
