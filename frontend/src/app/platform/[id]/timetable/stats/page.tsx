'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, CheckCircle2, Flame, RefreshCw, TrendingUp, BarChart2, Calendar, XCircle } from 'lucide-react'
import { useTimetableStats } from '@/lib/hooks/use-timetable'

const CATEGORY_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
    work:     { bg: 'bg-indigo-500/15',  bar: 'bg-indigo-500',  text: 'text-indigo-300' },
    personal: { bg: 'bg-purple-500/15',  bar: 'bg-purple-500',  text: 'text-purple-300' },
    health:   { bg: 'bg-emerald-500/15', bar: 'bg-emerald-500', text: 'text-emerald-300' },
    learning: { bg: 'bg-amber-500/15',   bar: 'bg-amber-500',   text: 'text-amber-300' },
    social:   { bg: 'bg-pink-500/15',    bar: 'bg-pink-500',    text: 'text-pink-300' },
    other:    { bg: 'bg-slate-500/15',   bar: 'bg-slate-500',   text: 'text-slate-300' },
}
const cat = (c: string) => CATEGORY_COLORS[c] ?? CATEGORY_COLORS.other

const WEEK_OPTIONS = [1, 2, 4, 8, 12]

function StatCard({ icon, label, value, sub, color = 'text-white' }: {
    icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string
}) {
    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-white/40 text-xs font-semibold uppercase tracking-wider">
                {icon}{label}
            </div>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-white/35">{sub}</p>}
        </motion.div>
    )
}

export default function TimetableStatsPage() {
    const params   = useParams()
    const router   = useRouter()
    const personId = params.id as string
    const [weeks, setWeeks] = useState(4)
    const { data: stats, isLoading } = useTimetableStats(weeks)

    const maxCatHours  = Math.max(...(stats?.by_category.map(c => c.hours) ?? [1]), 1)
    const maxWdCount   = Math.max(...(stats?.by_weekday.map(d => d.count) ?? [1]), 1)
    const maxHourCount = Math.max(...(stats?.by_hour.map(h => h.count) ?? [1]), 1)

    // Build heatmap: daily_summary keyed by date string
    const dayMap = Object.fromEntries((stats?.daily_summary ?? []).map(d => [d.date, d]))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // Show N weeks back + N weeks forward (centered on today)
    const totalDays = weeks * 7 * 2
    const heatDays: Date[] = Array.from({ length: totalDays }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (weeks * 7) + i); return d
    })
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const hourLabel = (h: number) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`

    return (
        <div className="min-h-screen bg-[#09090f] text-white">
            <div className="fixed top-0 left-0 right-0 h-64 bg-gradient-to-b from-indigo-950/25 to-transparent pointer-events-none z-0" />

            <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button onClick={() => router.back()}
                            className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/20 transition-all">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                                    <BarChart2 className="w-4 h-4 text-indigo-400" />
                                </div>
                                <h1 className="text-2xl font-bold tracking-tight">Timetable Statistics</h1>
                            </div>
                            <p className="text-xs text-white/35 mt-0.5 ml-[42px]">
                                {stats ? `${stats.period.from} → ${stats.period.to}` : 'Loading…'}
                            </p>
                        </div>
                    </div>

                    {/* Week selector */}
                    <div className="flex items-center gap-1 bg-white/4 border border-white/8 rounded-xl p-1">
                        {WEEK_OPTIONS.map(w => (
                            <button key={w} onClick={() => setWeeks(w)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                                    ${weeks === w ? 'bg-indigo-600 text-white shadow-md' : 'text-white/40 hover:text-white'}`}>
                                {w}w
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : stats && (
                    <div className="space-y-6">

                        {/* ── Summary Cards ── */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard icon={<Clock className="w-3.5 h-3.5" />} label="Hours Scheduled"
                                value={`${stats.total_hours}h`} sub={`${stats.completed_hours}h completed`} color="text-indigo-300" />
                            <StatCard icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Completion Rate"
                                value={`${stats.completion_rate}%`}
                                sub={`${stats.completed_blocks} of ${stats.total_blocks} blocks`}
                                color={stats.completion_rate >= 70 ? 'text-emerald-400' : stats.completion_rate >= 40 ? 'text-amber-400' : 'text-red-400'} />
                            <StatCard icon={<XCircle className="w-3.5 h-3.5" />} label="Missed Blocks"
                                value={stats.missed_blocks}
                                sub={`${stats.missed_hours}h · ${stats.missed_rate}% of total`}
                                color={stats.missed_blocks === 0 ? 'text-emerald-400' : stats.missed_rate <= 20 ? 'text-amber-400' : 'text-red-400'} />
                            <StatCard icon={<Flame className="w-3.5 h-3.5" />} label="Active Streak"
                                value={`${stats.streak_days}d`} sub="consecutive days with blocks" color="text-amber-400" />
                        </div>

                        {/* ── Activity Heatmap ── */}
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-5 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />Activity — {weeks}w back · {weeks}w ahead
                            </h2>
                            <div className="flex gap-1 flex-wrap">
                                {heatDays.map((d, i) => {
                                    const ds     = fmt(d)
                                    const data   = dayMap[ds]
                                    const pct      = data ? data.completed / Math.max(data.total, 1) : 0
                                    const hasMissed = data && data.missed > 0
                                    const allMissed = data && data.missed === data.total
                                    const isT      = ds === fmt(today)
                                    const isFuture = d > today
                                    return (
                                        <div key={i} title={data ? `${ds}: ${data.total} blocks, ${data.completed} done${data.missed ? `, ${data.missed} missed` : ''}, ${data.hours.toFixed(1)}h` : ds}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-bold transition-all cursor-default
                                                ${isT ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[#09090f]' : ''}
                                                ${!data
                                                    ? isFuture ? 'bg-white/2 text-white/10' : 'bg-white/4 text-white/15'
                                                    : isFuture
                                                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                                        : allMissed ? 'bg-red-500/40 text-red-200'
                                                        : hasMissed ? 'bg-amber-500/35 text-amber-200'
                                                        : pct === 1 ? 'bg-emerald-500 text-white'
                                                        : pct >= 0.5 ? 'bg-emerald-500/50 text-emerald-200'
                                                        : 'bg-indigo-500/30 text-indigo-300'}`}>
                                            {data ? data.total : ''}
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5 text-xs text-white/30 flex-wrap">
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-white/4" />No blocks</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-indigo-500/30" />Partial</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500/50" />≥50% done</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" />All done</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500/35" />Some missed</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500/40" />All missed</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-indigo-500/20 border border-indigo-500/30" />Upcoming</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* ── Category Breakdown ── */}
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-5">Category Breakdown</h2>
                                {stats.by_category.length === 0
                                    ? <p className="text-white/25 text-sm text-center py-8">No data</p>
                                    : (
                                        <div className="space-y-3">
                                            {stats.by_category.map(c => {
                                                const style  = cat(c.category)
                                                const pct    = c.hours / maxCatHours * 100
                                                const donePct = c.count > 0 ? Math.round(c.completed / c.count * 100) : 0
                                                return (
                                                    <div key={c.category}>
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <span className={`text-sm font-medium capitalize ${style.text}`}>{c.category}</span>
                                                            <div className="flex items-center gap-3 text-xs text-white/40">
                                                                <span>{c.hours.toFixed(1)}h</span>
                                                                <span>{c.count} blocks</span>
                                                                <span className={donePct >= 70 ? 'text-emerald-400' : 'text-white/40'}>{donePct}% done</span>
                                                                {c.missed > 0 && <span className="text-red-400">{c.missed} missed</span>}
                                                            </div>
                                                        </div>
                                                        <div className="h-2 bg-white/6 rounded-full overflow-hidden">
                                                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                                                className={`h-full rounded-full ${style.bar}`} />
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                            </div>

                            {/* ── Weekday Pattern ── */}
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-5">Weekday Pattern</h2>
                                <div className="space-y-2.5">
                                    {stats.by_weekday.map(d => {
                                        const pct      = d.count / maxWdCount * 100
                                        const donePct  = d.count > 0 ? Math.round(d.completed / d.count * 100) : 0
                                        const missedPct = d.count > 0 ? Math.round(d.missed / d.count * 100) : 0
                                        return (
                                            <div key={d.weekday} className="flex items-center gap-3">
                                                <span className="text-xs text-white/40 w-8 shrink-0">{d.name.slice(0, 3)}</span>
                                                <div className="flex-1 h-6 bg-white/4 rounded-lg overflow-hidden relative">
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                                        transition={{ duration: 0.5, ease: 'easeOut' }}
                                                        className="h-full bg-indigo-500/50 rounded-lg" />
                                                    {d.count > 0 && (
                                                        <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white/60">
                                                            {d.count} blocks · {d.hours.toFixed(1)}h
                                                            {d.missed > 0 && <span className="text-red-400 ml-1.5">· {d.missed} missed</span>}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-end w-16 shrink-0">
                                                    <span className={`text-xs font-medium ${donePct >= 70 ? 'text-emerald-400' : donePct > 0 ? 'text-white/50' : 'text-white/20'}`}>
                                                        {d.count > 0 ? `${donePct}%` : '—'}
                                                    </span>
                                                    {d.missed > 0 && (
                                                        <span className="text-[10px] text-red-400">{missedPct}% miss</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* ── Peak Hours ── */}
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-5 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />Peak Hours
                            </h2>
                            <div className="flex items-end gap-1.5 h-28">
                                {stats.by_hour.map(h => {
                                    const pct = h.count / maxHourCount * 100
                                    const ispeak = h.count === maxHourCount && h.count > 0
                                    return (
                                        <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group">
                                            <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                                                <motion.div initial={{ height: 0 }} animate={{ height: `${pct}%` }}
                                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                                    title={`${hourLabel(h.hour)}: ${h.count} blocks`}
                                                    className={`w-full rounded-t-md transition-all
                                                        ${ispeak ? 'bg-indigo-500' : h.count > 0 ? 'bg-indigo-500/40' : 'bg-white/5'}`}
                                                    style={{ minHeight: h.count > 0 ? 4 : 0 }}
                                                />
                                            </div>
                                            <span className={`text-[9px] transition-colors ${ispeak ? 'text-indigo-400 font-bold' : 'text-white/20'}`}>
                                                {h.hour % 3 === 0 ? hourLabel(h.hour).replace(' ', '') : ''}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}
