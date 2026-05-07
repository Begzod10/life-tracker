'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, CheckCircle2, Flame, TrendingUp, BarChart2, Calendar, XCircle, Sparkles, Target, Pencil, Check, X, MoveRight, Trash2 } from 'lucide-react'
import { useTimetableStats, useDailyConclusions, useCategoryBudgets, useCategoryBudgetUpsert, useCategoryBudgetDelete, useBulkReschedule } from '@/lib/hooks/use-timetable'
import { useQueryClient } from '@tanstack/react-query'
import { useHttp } from '@/lib/hooks/use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

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

function toLocalDateString(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function getWeekBounds() {
    const today = new Date()
    const day = today.getDay() // 0=Sun … 6=Sat
    const diffToMonday = day === 0 ? -6 : 1 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + diffToMonday)
    const saturday = new Date(monday)
    saturday.setDate(monday.getDate() + 5)
    return { monday: toLocalDateString(monday), saturday: toLocalDateString(saturday) }
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

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

function LineChart({
    data,
    fromDate,
    toDate,
}: {
    data: { date: string; completed: number; missed: number; total: number }[]
    fromDate: string
    toDate: string
}) {
    const fmtDate = (d: Date) => toLocalDateString(d)

    // Build full day-by-day range between fromDate and toDate
    const start = new Date(fromDate + 'T00:00:00')
    const end = new Date(toDate + 'T00:00:00')
    const dayRange: { date: string; completed: number; missed: number }[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = fmtDate(new Date(d))
        const found = data.find(x => x.date === ds)
        dayRange.push({ date: ds, completed: found?.completed ?? 0, missed: found?.missed ?? 0 })
    }

    const hasAnyData = dayRange.some(d => d.completed > 0 || d.missed > 0)
    if (!hasAnyData) return <p className="text-white/25 text-sm text-center py-8">No data for this period</p>

    const W = 800, H = 140, PAD = { t: 12, b: 28, l: 28, r: 12 }
    const chartW = W - PAD.l - PAD.r
    const chartH = H - PAD.t - PAD.b
    const maxVal = Math.max(...dayRange.map(d => Math.max(d.completed, d.missed)), 1)
    const n = dayRange.length

    const xOf = (i: number) => PAD.l + (i / Math.max(n - 1, 1)) * chartW
    const yOf = (v: number) => PAD.t + chartH - (v / maxVal) * chartH

    const pathFor = (key: 'completed' | 'missed') =>
        dayRange.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(d[key]).toFixed(1)}`).join(' ')

    const areaFor = (key: 'completed' | 'missed') => {
        const line = pathFor(key)
        return `${line} L ${xOf(n - 1).toFixed(1)} ${(PAD.t + chartH).toFixed(1)} L ${PAD.l.toFixed(1)} ${(PAD.t + chartH).toFixed(1)} Z`
    }

    const yTicks = [0, Math.round(maxVal / 2), maxVal]

    // X labels spaced every ~7 days
    const step = Math.max(1, Math.floor(n / 8))
    const xLabels = dayRange.map((d, i) => {
        const show = i === 0 || i === n - 1 || i % step === 0
        return show ? { i, label: d.date.slice(5) } : null
    }).filter(Boolean) as { i: number; label: string }[]

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
            {/* Grid lines */}
            {yTicks.map(v => (
                <g key={v}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)}
                        stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                    <text x={PAD.l - 4} y={yOf(v) + 4} textAnchor="end"
                        fontSize="9" fill="rgba(255,255,255,0.25)">{v}</text>
                </g>
            ))}

            {/* Area fills */}
            <path d={areaFor('completed')} fill="rgba(34,197,94,0.08)" />
            <path d={areaFor('missed')}    fill="rgba(239,68,68,0.08)" />

            {/* Lines */}
            <path d={pathFor('completed')} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={pathFor('missed')}    fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {/* Dots — only where there's data */}
            {dayRange.map((d, i) => (
                (d.completed > 0 || d.missed > 0) && (
                    <g key={i}>
                        <circle cx={xOf(i)} cy={yOf(d.completed)} r="3" fill="#22c55e" />
                        <circle cx={xOf(i)} cy={yOf(d.missed)}    r="3" fill="#ef4444" />
                        <title>{d.date}: {d.completed} done, {d.missed} not finished</title>
                    </g>
                )
            ))}

            {/* X labels */}
            {xLabels.map(({ i, label }) => (
                <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle"
                    fontSize="9" fill="rgba(255,255,255,0.3)">{label}</text>
            ))}
        </svg>
    )
}

export default function TimetableStatsPage() {
    const params   = useParams()
    const router   = useRouter()
    const personId = params.id as string
    const [weeks, setWeeks] = useState(4)
    const [generating, setGenerating] = useState(false)

    // Filter mode: 'weeks' | 'month' | 'year' | 'custom'
    const _today = new Date()
    type FilterMode = 'weeks' | 'month' | 'year' | 'custom'
    const [filterMode, setFilterMode] = useState<FilterMode>('weeks')
    // Month mode state
    const [filterMonth, setFilterMonth] = useState(_today.getMonth())   // 0-indexed
    const [filterMonthYear, setFilterMonthYear] = useState(_today.getFullYear())
    // Year mode state
    const [filterYear, setFilterYear] = useState(_today.getFullYear())
    // Custom mode — pre-fill with current week Mon → Sat
    const { monday: initMonday, saturday: initSaturday } = getWeekBounds()
    const [customFrom, setCustomFrom] = useState(initMonday)
    const [customTo, setCustomTo]     = useState(initSaturday)

    // Derive from_date / to_date from current mode
    const { activeFrom, activeTo } = (() => {
        if (filterMode === 'month') {
            const first = new Date(filterMonthYear, filterMonth, 1)
            const last  = new Date(filterMonthYear, filterMonth + 1, 0)
            return { activeFrom: toLocalDateString(first), activeTo: toLocalDateString(last) }
        }
        if (filterMode === 'year') {
            return { activeFrom: `${filterYear}-01-01`, activeTo: `${filterYear}-12-31` }
        }
        if (filterMode === 'custom' && customFrom && customTo && customFrom <= customTo) {
            return { activeFrom: customFrom, activeTo: customTo }
        }
        return { activeFrom: undefined, activeTo: undefined }
    })()

    const { data: stats, isLoading } = useTimetableStats(weeks, activeFrom, activeTo)
    const conclusionDays = filterMode === 'weeks' ? weeks * 7 : 90
    const { data: conclusions, isLoading: conclusionsLoading } = useDailyConclusions(conclusionDays)
    const { data: budgets, isLoading: budgetsLoading } = useCategoryBudgets()
    const { request } = useHttp()
    const queryClient = useQueryClient()
    const upsertBudget = useCategoryBudgetUpsert()
    const deleteBudget = useCategoryBudgetDelete()
    const bulkReschedule = useBulkReschedule()

    // Budget editing state
    const [editingBudget, setEditingBudget] = useState<string | null>(null)
    const [budgetInput, setBudgetInput] = useState('')
    const [newBudgetCategory, setNewBudgetCategory] = useState('')
    const [newBudgetHours, setNewBudgetHours] = useState('')

    // Bulk reschedule state
    const [rescheduleFrom, setRescheduleFrom] = useState('')
    const [rescheduleTo, setRescheduleTo] = useState('')

    const [generateError, setGenerateError] = useState<string | null>(null)
    const generateConclusion = useCallback(async () => {
        setGenerating(true)
        setGenerateError(null)
        try {
            await request(API_ENDPOINTS.TIMETABLE.GENERATE_CONCLUSION, { method: 'POST' })
            queryClient.invalidateQueries({ queryKey: ['timetable', 'conclusions'] })
        } catch (e) {
            setGenerateError(e instanceof Error ? e.message : 'Failed to generate conclusion')
        } finally {
            setGenerating(false)
        }
    }, [request, queryClient])

    const handleBulkReschedule = useCallback(() => {
        if (!rescheduleFrom || !rescheduleTo) return
        bulkReschedule.mutate(
            { from_date: rescheduleFrom, to_date: rescheduleTo },
            {
                onSuccess: (data: any) => {
                    alert(`Moved ${data.moved} block${data.moved !== 1 ? 's' : ''} to ${rescheduleTo}`)
                    setRescheduleFrom('')
                    setRescheduleTo('')
                },
                onError: () => alert('Failed to reschedule blocks.'),
            }
        )
    }, [rescheduleFrom, rescheduleTo, bulkReschedule])

    const maxCatHours  = Math.max(...(stats?.by_category.map(c => c.hours) ?? [1]), 1)
    const maxWdCount   = Math.max(...(stats?.by_weekday.map(d => d.count) ?? [1]), 1)
    const maxHourCount = Math.max(...(stats?.by_hour.map(h => h.count) ?? [1]), 1)

    // Build heatmap: daily_summary keyed by date string
    const dayMap = Object.fromEntries((stats?.daily_summary ?? []).map(d => [d.date, d]))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const fmt = (d: Date) => toLocalDateString(d)
    // Use the actual period returned by the backend
    const heatStart = stats ? new Date(stats.period.from + 'T00:00:00') : new Date(today)
    const heatEnd   = stats ? new Date(stats.period.to   + 'T00:00:00') : new Date(today)
    const heatDays: Date[] = []
    for (let d = new Date(heatStart); d <= heatEnd; d.setDate(d.getDate() + 1)) {
        heatDays.push(new Date(d))
    }

    const hourLabel = (h: number) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`

    return (
        <div className="min-h-screen text-white">
            <div className="fixed top-0 left-0 right-0 h-64 bg-gradient-to-b from-indigo-950/25 to-transparent pointer-events-none z-0" />

            <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

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

                    {/* Period selector */}
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {/* Week presets */}
                        <div className="flex items-center gap-1 bg-white/4 border border-white/8 rounded-xl p-1">
                            {WEEK_OPTIONS.map(w => (
                                <button key={w}
                                    onClick={() => { setWeeks(w); setFilterMode('weeks') }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                                        ${filterMode === 'weeks' && weeks === w ? 'bg-indigo-600 text-white shadow-md' : 'text-white/40 hover:text-white'}`}>
                                    {w}w
                                </button>
                            ))}
                        </div>
                        {/* Month / Year / Custom */}
                        <div className="flex items-center gap-1 bg-white/4 border border-white/8 rounded-xl p-1">
                            {(['month', 'year', 'custom'] as FilterMode[]).map(mode => (
                                <button key={mode}
                                    onClick={() => setFilterMode(m => m === mode ? 'weeks' : mode)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all
                                        ${filterMode === mode ? 'bg-indigo-600 text-white shadow-md' : 'text-white/40 hover:text-white'}`}>
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sub-filter row */}
                {filterMode !== 'weeks' && (
                    <motion.div
                        key={filterMode}
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 flex-wrap mb-6 p-4 rounded-2xl border border-white/8 bg-white/[0.03]">

                        {filterMode === 'month' && (
                            <div className="flex items-center gap-3">
                                <button onClick={() => {
                                    if (filterMonth === 0) { setFilterMonth(11); setFilterMonthYear(y => y - 1) }
                                    else setFilterMonth(m => m - 1)
                                }} className="w-7 h-7 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all text-sm">‹</button>
                                <span className="text-sm font-semibold text-white min-w-[140px] text-center">
                                    {MONTHS[filterMonth]} {filterMonthYear}
                                </span>
                                <button onClick={() => {
                                    if (filterMonth === 11) { setFilterMonth(0); setFilterMonthYear(y => y + 1) }
                                    else setFilterMonth(m => m + 1)
                                }} className="w-7 h-7 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all text-sm">›</button>
                                <span className="text-xs text-white/35 ml-2">
                                    {toLocalDateString(new Date(filterMonthYear, filterMonth, 1))} → {toLocalDateString(new Date(filterMonthYear, filterMonth + 1, 0))}
                                </span>
                            </div>
                        )}

                        {filterMode === 'year' && (
                            <div className="flex items-center gap-3">
                                <button onClick={() => setFilterYear(y => y - 1)}
                                    className="w-7 h-7 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all text-sm">‹</button>
                                <span className="text-sm font-semibold text-white min-w-[60px] text-center">{filterYear}</span>
                                <button onClick={() => setFilterYear(y => y + 1)}
                                    className="w-7 h-7 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all text-sm">›</button>
                                <span className="text-xs text-white/35 ml-2">{filterYear}-01-01 → {filterYear}-12-31</span>
                            </div>
                        )}

                        {filterMode === 'custom' && (
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-white/35 uppercase tracking-wider">From</label>
                                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                        className="px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-white [color-scheme:dark]" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-white/35 uppercase tracking-wider">To</label>
                                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                        className="px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-white [color-scheme:dark]" />
                                </div>
                                {customFrom && customTo && customFrom > customTo && (
                                    <p className="text-xs text-red-400 self-end mb-2">From must be before To</p>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}

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
                            <StatCard icon={<XCircle className="w-3.5 h-3.5" />} label="Not Finished"
                                value={stats.missed_blocks}
                                sub={`${stats.missed_hours}h · ${stats.missed_rate}% of total`}
                                color={stats.missed_blocks === 0 ? 'text-emerald-400' : stats.missed_rate <= 20 ? 'text-amber-400' : 'text-red-400'} />
                            <StatCard icon={<Flame className="w-3.5 h-3.5" />} label="Active Streak"
                                value={`${stats.streak_days}d`} sub="consecutive days with blocks" color="text-amber-400" />
                        </div>

                        {/* ── Daily Progress Line Chart ── */}
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4" />Daily Progress
                                </h2>
                                <div className="flex items-center gap-4 text-xs text-white/40">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-0.5 rounded-full bg-emerald-500" />
                                        Completed
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-0.5 rounded-full bg-red-500" />
                                        Not Finished
                                    </div>
                                </div>
                            </div>
                            <LineChart
                                data={stats.daily_summary}
                                fromDate={stats.period.from}
                                toDate={stats.period.to}
                            />
                        </div>

                        {/* ── Activity Heatmap ── */}
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-5 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Activity — {stats.period.from} → {stats.period.to}
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

                        {/* ── AI Daily Conclusions ── */}
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-indigo-400" />AI Daily Conclusions
                                </h2>
                                <button onClick={generateConclusion} disabled={generating}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium hover:bg-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Sparkles className={`w-3 h-3 ${generating ? 'animate-pulse' : ''}`} />
                                    {generating ? 'Generating…' : 'Generate for today'}
                                </button>
                            </div>

                            {generateError && (
                                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                                    {generateError}
                                </div>
                            )}

                            {conclusionsLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : !conclusions || conclusions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                        <Sparkles className="w-5 h-5 text-indigo-400/50" />
                                    </div>
                                    <p className="text-sm text-white/30">No conclusions yet.</p>
                                    <p className="text-xs text-white/20">Generated automatically at 22:30 each day, or click the button above.</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {conclusions.map((c, idx) => {
                                        const d = new Date(c.date + 'T00:00:00')
                                        const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                                        return (
                                            <motion.div key={c.date}
                                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.04 }}
                                                className="flex gap-4">
                                                <div className="flex flex-col items-center gap-1 shrink-0">
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />
                                                    {idx < conclusions.length - 1 && (
                                                        <div className="w-px flex-1 bg-white/6 mt-1" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 pb-4">
                                                    <p className="text-xs text-indigo-400/70 font-semibold mb-1.5">{label}</p>
                                                    <p className="text-sm text-white/70 leading-relaxed">{c.conclusion}</p>
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ── Completion Rate Distribution ── */}
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-5 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />Daily Completion Distribution
                            </h2>
                            {(() => {
                                const days = stats.daily_summary.filter(d => d.total > 0)
                                if (days.length === 0) return <p className="text-white/25 text-sm text-center py-8">No data</p>
                                const tiers = [
                                    { label: 'Perfect (100%)', min: 100, max: 100, color: 'bg-emerald-500', text: 'text-emerald-400' },
                                    { label: 'Good (75–99%)', min: 75, max: 99, color: 'bg-emerald-500/50', text: 'text-emerald-300' },
                                    { label: 'Partial (50–74%)', min: 50, max: 74, color: 'bg-amber-500/60', text: 'text-amber-300' },
                                    { label: 'Low (25–49%)', min: 25, max: 49, color: 'bg-orange-500/50', text: 'text-orange-300' },
                                    { label: 'Poor (<25%)', min: 0, max: 24, color: 'bg-red-500/50', text: 'text-red-300' },
                                ]
                                return (
                                    <div className="space-y-3">
                                        {tiers.map(tier => {
                                            const count = days.filter(d => {
                                                const pct = Math.round(d.completed / d.total * 100)
                                                return pct >= tier.min && pct <= tier.max
                                            }).length
                                            const pct = Math.round(count / days.length * 100)
                                            return (
                                                <div key={tier.label} className="flex items-center gap-3">
                                                    <span className={`text-xs w-36 shrink-0 ${tier.text}`}>{tier.label}</span>
                                                    <div className="flex-1 h-5 bg-white/4 rounded-lg overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${pct}%` }}
                                                            transition={{ duration: 0.5, ease: 'easeOut' }}
                                                            className={`h-full rounded-lg ${tier.color}`}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-white/40 w-16 text-right shrink-0">{count}d · {pct}%</span>
                                                </div>
                                            )
                                        })}
                                        <p className="text-xs text-white/25 pt-2">Based on {days.length} days with blocks in the selected period</p>
                                    </div>
                                )
                            })()}
                        </div>

                        {/* ── Category Time Budgets ── */}
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
                                    <Target className="w-4 h-4" />Weekly Time Budgets
                                </h2>
                            </div>
                            {budgetsLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(budgets ?? []).map(b => {
                                        const pct = b.weekly_hours_target > 0
                                            ? Math.min(100, (b.actual_hours / b.weekly_hours_target) * 100)
                                            : 0
                                        const over = b.actual_hours > b.weekly_hours_target && b.weekly_hours_target > 0
                                        const style = CATEGORY_COLORS[b.category] ?? CATEGORY_COLORS.other
                                        return (
                                            <div key={b.category} className="rounded-xl bg-white/4 p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className={`text-sm font-medium capitalize ${style.text}`}>{b.category}</span>
                                                    <div className="flex items-center gap-2">
                                                        {editingBudget === b.category ? (
                                                            <>
                                                                <input
                                                                    type="number"
                                                                    value={budgetInput}
                                                                    onChange={e => setBudgetInput(e.target.value)}
                                                                    className="w-16 px-2 py-0.5 rounded bg-white/10 border border-white/20 text-xs text-white text-center"
                                                                    min="0" step="0.5"
                                                                    autoFocus
                                                                />
                                                                <span className="text-xs text-white/40">h/wk</span>
                                                                <button onClick={() => {
                                                                    upsertBudget.mutate({ category: b.category, weekly_hours_target: parseFloat(budgetInput) || 0 })
                                                                    setEditingBudget(null)
                                                                }} className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400">
                                                                    <Check className="w-3 h-3" />
                                                                </button>
                                                                <button onClick={() => setEditingBudget(null)} className="p-1 rounded hover:bg-white/10 text-white/40">
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className={`text-xs ${over ? 'text-amber-400' : 'text-white/50'}`}>
                                                                    {b.actual_hours.toFixed(1)} / {b.weekly_hours_target}h
                                                                </span>
                                                                <button onClick={() => { setEditingBudget(b.category); setBudgetInput(String(b.weekly_hours_target)) }}
                                                                    className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white transition-all">
                                                                    <Pencil className="w-3 h-3" />
                                                                </button>
                                                                <button onClick={() => deleteBudget.mutate(b.category)}
                                                                    className="p-1 rounded hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all">
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${pct}%` }}
                                                        transition={{ duration: 0.5, ease: 'easeOut' }}
                                                        className={`h-full rounded-full ${over ? 'bg-amber-500' : style.bar}`}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Add new budget row */}
                                    <div className="rounded-xl bg-white/2 border border-dashed border-white/10 p-3 flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="category"
                                            value={newBudgetCategory}
                                            onChange={e => setNewBudgetCategory(e.target.value)}
                                            className="flex-1 px-2 py-1 rounded bg-white/8 border border-white/10 text-xs text-white placeholder-white/25 capitalize"
                                        />
                                        <input
                                            type="number"
                                            placeholder="hours/wk"
                                            value={newBudgetHours}
                                            onChange={e => setNewBudgetHours(e.target.value)}
                                            className="w-20 px-2 py-1 rounded bg-white/8 border border-white/10 text-xs text-white placeholder-white/25 text-center"
                                            min="0" step="0.5"
                                        />
                                        <button
                                            onClick={() => {
                                                if (!newBudgetCategory || !newBudgetHours) return
                                                upsertBudget.mutate({
                                                    category: newBudgetCategory.toLowerCase(),
                                                    weekly_hours_target: parseFloat(newBudgetHours),
                                                })
                                                setNewBudgetCategory('')
                                                setNewBudgetHours('')
                                            }}
                                            className="px-3 py-1 rounded bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium hover:bg-indigo-600/40 transition-all"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Bulk Reschedule ── */}
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-5 flex items-center gap-2">
                                <MoveRight className="w-4 h-4" />Bulk Reschedule
                            </h2>
                            <p className="text-xs text-white/35 mb-4">Move all incomplete blocks from one day to another.</p>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-white/35 uppercase tracking-wider">From</label>
                                    <input
                                        type="date"
                                        value={rescheduleFrom}
                                        onChange={e => setRescheduleFrom(e.target.value)}
                                        className="px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-white"
                                    />
                                </div>
                                <MoveRight className="w-4 h-4 text-white/30 mt-4" />
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-white/35 uppercase tracking-wider">To</label>
                                    <input
                                        type="date"
                                        value={rescheduleTo}
                                        onChange={e => setRescheduleTo(e.target.value)}
                                        className="px-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-white"
                                    />
                                </div>
                                <button
                                    onClick={handleBulkReschedule}
                                    disabled={!rescheduleFrom || !rescheduleTo || bulkReschedule.isPending}
                                    className="mt-4 px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium hover:bg-indigo-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {bulkReschedule.isPending ? 'Moving…' : 'Move Blocks'}
                                </button>
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
