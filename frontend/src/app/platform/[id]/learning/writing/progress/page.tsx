'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    ArrowLeft, TrendingUp, Trophy, AlertTriangle, Filter, ChevronRight,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useEssayStats, useEssayErrors, type EssayError } from '@/lib/hooks/use-essays'

const LEVEL_COLOR: Record<string, string> = {
    A1: 'text-green-400 bg-green-500/10 border-green-500/20',
    A2: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    B1: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    B2: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    C1: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    C2: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
}

const ISSUE_COLOR: Record<string, string> = {
    grammar: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    vocab: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    style: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    cohesion: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    clarity: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    task_response: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    upgrade: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
}

const ISSUE_LABEL: Record<string, string> = {
    grammar: 'Grammar',
    vocab: 'Vocabulary',
    style: 'Style',
    cohesion: 'Cohesion',
    clarity: 'Clarity',
    task_response: 'Task response',
    upgrade: 'Word upgrade',
}

export default function WritingProgressPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const [days, setDays] = useState(60)
    const [kindFilter, setKindFilter] = useState<string | null>(null)

    const { data: stats, isLoading } = useEssayStats(days)
    const { data: errors = [], isLoading: errorsLoading } = useEssayErrors({
        kind: kindFilter ?? undefined,
        limit: 30,
    })

    const errorKinds = useMemo(() => {
        const c = stats?.error_counts || {}
        return Object.entries(c).sort((a, b) => b[1] - a[1])
    }, [stats?.error_counts])

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

                <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <TrendingUp className="w-8 h-8 text-amber-400" />
                            Writing progress
                        </h1>
                        <p className="text-white/50 mt-1">
                            {stats?.total_essays ?? 0} essays · {stats?.total_attempts ?? 0} graded attempts
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {[14, 30, 60, 180].map(d => (
                            <button
                                key={d}
                                onClick={() => setDays(d)}
                                className={
                                    days === d
                                        ? 'px-3 py-1.5 text-xs rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                        : 'px-3 py-1.5 text-xs rounded-md bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                                }
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>

                {/* Headline scores */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <Card className="p-5 bg-white/2.5 border border-amber-500/20">
                        <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Avg deep score</p>
                        <p className="text-4xl font-bold text-amber-400">
                            {stats?.avg_deep ?? '—'}
                            {stats?.avg_deep !== null && stats?.avg_deep !== undefined && <span className="text-white/30 text-lg">/100</span>}
                        </p>
                    </Card>
                    <Card className="p-5 bg-white/2.5 border border-white/10">
                        <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Avg quick score</p>
                        <p className="text-4xl font-bold text-white/80">
                            {stats?.avg_quick ?? '—'}
                            {stats?.avg_quick !== null && stats?.avg_quick !== undefined && <span className="text-white/30 text-lg">/100</span>}
                        </p>
                    </Card>
                    <Card className="p-5 bg-white/2.5 border border-white/10">
                        <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Total errors flagged</p>
                        <p className="text-4xl font-bold text-rose-300">
                            {Object.values(stats?.error_counts || {}).reduce((a, b) => a + b, 0)}
                        </p>
                    </Card>
                </div>

                {/* Timeline */}
                <Card className="p-6 mb-8 bg-white/2.5 border border-white/10">
                    <h2 className="text-sm uppercase tracking-wider text-white/60 mb-4">Score timeline</h2>
                    {!stats || stats.timeline.length === 0 ? (
                        <p className="text-sm text-white/40">No attempts yet in this window.</p>
                    ) : (
                        <TimelineChart points={stats.timeline} />
                    )}
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* By level */}
                    <Card className="p-5 bg-white/2.5 border border-white/10 lg:col-span-1">
                        <h3 className="text-sm uppercase tracking-wider text-white/60 mb-3">Average by level</h3>
                        {stats && Object.keys(stats.by_level_avg).length > 0 ? (
                            <div className="space-y-2">
                                {Object.entries(stats.by_level_avg)
                                    .sort((a, b) => a[0].localeCompare(b[0]))
                                    .map(([lvl, v]) => (
                                        <div key={lvl} className="flex items-center justify-between">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${LEVEL_COLOR[lvl] || 'text-white/60 border-white/10'}`}>{lvl}</span>
                                            <div className="text-right">
                                                <span className="text-xl font-bold text-white">{v.avg}</span>
                                                <span className="text-xs text-white/40 ml-2">{v.count} essay{v.count === 1 ? '' : 's'}</span>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        ) : (
                            <p className="text-sm text-white/40">No graded essays yet.</p>
                        )}
                    </Card>

                    {/* Error categories */}
                    <Card className="p-5 bg-white/2.5 border border-white/10 lg:col-span-2">
                        <h3 className="text-sm uppercase tracking-wider text-white/60 mb-3 flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3 text-rose-300" /> Error categories
                        </h3>
                        {errorKinds.length === 0 ? (
                            <p className="text-sm text-white/40">No errors recorded yet.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setKindFilter(null)}
                                    className={
                                        kindFilter === null
                                            ? 'px-3 py-1.5 text-xs rounded-md bg-white/10 text-white border border-white/20'
                                            : 'px-3 py-1.5 text-xs rounded-md bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                                    }
                                >
                                    All ({errorKinds.reduce((a, [, n]) => a + n, 0)})
                                </button>
                                {errorKinds.map(([k, n]) => (
                                    <button
                                        key={k}
                                        onClick={() => setKindFilter(k)}
                                        className={
                                            kindFilter === k
                                                ? `px-3 py-1.5 text-xs rounded-md border ${ISSUE_COLOR[k] || 'bg-white/10 text-white border-white/20'}`
                                                : 'px-3 py-1.5 text-xs rounded-md bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                                        }
                                    >
                                        {ISSUE_LABEL[k] || k} <span className="text-white/40">{n}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Error library */}
                <Card className="p-6 bg-white/2.5 border border-white/10 mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm uppercase tracking-wider text-white/60 flex items-center gap-2">
                            <Filter className="w-3 h-3" />
                            {kindFilter ? `${ISSUE_LABEL[kindFilter] || kindFilter} errors` : 'Recent errors'}
                        </h2>
                        <span className="text-xs text-white/40">{errors.length} shown</span>
                    </div>
                    {errorsLoading ? (
                        <p className="text-sm text-white/40">Loading…</p>
                    ) : errors.length === 0 ? (
                        <p className="text-sm text-white/40">
                            {kindFilter ? `No ${kindFilter} errors recorded.` : 'Run a deep review on any essay to populate this.'}
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {errors.map(e => <ErrorRow key={e.id} err={e} />)}
                        </div>
                    )}
                </Card>

                {/* Recent essays */}
                {stats?.recent_essays && stats.recent_essays.length > 0 && (
                    <div>
                        <h2 className="text-sm uppercase tracking-wider text-white/60 mb-3">Recent essays</h2>
                        <div className="space-y-2">
                            {stats.recent_essays.map(e => (
                                <Card
                                    key={e.id}
                                    onClick={() => router.push(`/platform/${params.id}/learning/writing/${e.id}`)}
                                    className="p-4 bg-white/2.5 border border-white/5 hover:border-amber-500/20 hover:bg-white/5 cursor-pointer transition-all flex items-center justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${LEVEL_COLOR[e.level] || ''}`}>{e.level}</span>
                                            <span className="text-[10px] uppercase tracking-wider text-white/40">{e.status}</span>
                                        </div>
                                        <p className="text-sm text-white/80 truncate">{e.title || e.prompt}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {e.score !== null && (
                                            <span className="text-xl font-bold text-amber-400">{e.score}</span>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-white/30" />
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {isLoading && (
                    <p className="text-sm text-white/40 text-center py-8">Loading progress…</p>
                )}
            </div>
        </div>
    )
}

function ErrorRow({ err }: { err: EssayError }) {
    return (
        <div className={`p-3 rounded-md border ${ISSUE_COLOR[err.kind] || 'border-white/10 bg-white/2.5'}`}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider opacity-80">{ISSUE_LABEL[err.kind] || err.kind}</span>
                <span className="text-[10px] text-white/40">{new Date(err.created_at).toLocaleDateString()}</span>
            </div>
            {err.original && <p className="text-sm italic opacity-90">&ldquo;{err.original}&rdquo;</p>}
            {err.explanation && <p className="text-xs text-white/60 mt-1">{err.explanation}</p>}
            {err.suggestion && (
                <p className="text-sm text-emerald-300 mt-1">→ {err.suggestion}</p>
            )}
        </div>
    )
}

function TimelineChart({ points }: { points: { id: number; score: number; kind: string; created_at: string }[] }) {
    const W = 720
    const H = 180
    const PAD = 24

    if (points.length === 0) return null

    const times = points.map(p => new Date(p.created_at).getTime())
    const tMin = Math.min(...times)
    const tMax = Math.max(...times)
    const tRange = tMax - tMin || 1

    const xs = points.map((p, i) =>
        points.length === 1 ? W / 2 : PAD + ((new Date(p.created_at).getTime() - tMin) / tRange) * (W - PAD * 2)
    )
    const ys = points.map(p => H - PAD - (p.score / 100) * (H - PAD * 2))

    const path = points
        .map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`)
        .join(' ')

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
            {/* Grid */}
            {[0, 25, 50, 75, 100].map(s => {
                const y = H - PAD - (s / 100) * (H - PAD * 2)
                return (
                    <g key={s}>
                        <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(255,255,255,0.05)" />
                        <text x={4} y={y + 3} fontSize={9} fill="rgba(255,255,255,0.3)">{s}</text>
                    </g>
                )
            })}
            {/* Line */}
            <path d={path} fill="none" stroke="rgb(251, 191, 36)" strokeWidth={2} />
            {/* Dots */}
            {points.map((p, i) => (
                <circle
                    key={p.id}
                    cx={xs[i]}
                    cy={ys[i]}
                    r={p.kind === 'deep' ? 4 : 3}
                    fill={p.kind === 'deep' ? 'rgb(251, 191, 36)' : 'rgba(255,255,255,0.5)'}
                    stroke="rgba(0,0,0,0.6)"
                    strokeWidth={1.5}
                >
                    <title>{p.kind} · {p.score} · {new Date(p.created_at).toLocaleString()}</title>
                </circle>
            ))}
        </svg>
    )
}
