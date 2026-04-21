'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, addDays, subDays, isToday, parseISO, startOfWeek, isSameDay } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Plus, ChevronLeft, ChevronRight, Check, Trash2, Clock,
    Loader2, Link as LinkIcon, X, Search, RefreshCw, BarChart3, BarChart2,
    AlertTriangle, CheckCircle2, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    useTimeBlocksByDay,
    useTimeBlocksByDays,
    useTimeBlockCreate,
    useTimeBlockUpdate,
    useTimeBlockDelete,
    useTimeBlockToggle,
    type TimeBlock,
    type TimeBlockPayload,
} from '@/lib/hooks/use-timetable'
import { useTasksList } from '@/lib/hooks/use-tasks'

// ─── Constants ────────────────────────────────────────────────────────────────
const HOUR_START   = 6
const HOUR_END     = 24
const TOTAL_HOURS  = HOUR_END - HOUR_START
const PX_PER_HOUR  = 80

const CATEGORIES = [
    { value: 'work',     label: 'Work',     color: '#6366f1', from: 'from-indigo-500/30', to: 'to-indigo-600/10', border: 'border-indigo-500/50', text: 'text-indigo-300', dot: 'bg-indigo-400' },
    { value: 'personal', label: 'Personal', color: '#a855f7', from: 'from-purple-500/30', to: 'to-purple-600/10', border: 'border-purple-500/50', text: 'text-purple-300',  dot: 'bg-purple-400' },
    { value: 'health',   label: 'Health',   color: '#10b981', from: 'from-emerald-500/30', to: 'to-emerald-600/10', border: 'border-emerald-500/50', text: 'text-emerald-300', dot: 'bg-emerald-400' },
    { value: 'learning', label: 'Learning', color: '#f59e0b', from: 'from-amber-500/30', to: 'to-amber-600/10', border: 'border-amber-500/50', text: 'text-amber-300',   dot: 'bg-amber-400' },
    { value: 'social',   label: 'Social',   color: '#ec4899', from: 'from-pink-500/30', to: 'to-pink-600/10', border: 'border-pink-500/50', text: 'text-pink-300',    dot: 'bg-pink-400' },
    { value: 'other',    label: 'Other',    color: '#64748b', from: 'from-slate-500/30', to: 'to-slate-600/10', border: 'border-slate-500/50', text: 'text-slate-300',   dot: 'bg-slate-400' },
]

const getCat = (cat: string) => CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeToMinutes(t: string) {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
}
function minutesToTime(min: number) {
    return `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`
}
function blockTop(start: string) {
    return ((timeToMinutes(start) - HOUR_START * 60) / 60) * PX_PER_HOUR
}
function blockHeight(start: string, end: string) {
    return Math.max(((timeToMinutes(end) - timeToMinutes(start)) / 60) * PX_PER_HOUR, 28)
}

// ─── Repeat helpers ───────────────────────────────────────────────────────────
type BlockFormData = {
    title: string; description: string; start_time: string; end_time: string
    category: string; task_id?: number; task_duration?: number; is_recurring?: boolean
    repeat_days?: number[]; repeat_weeks?: number
}

const WEEK_DAYS = [
    { label: 'Mo', value: 1 }, { label: 'Tu', value: 2 }, { label: 'We', value: 3 },
    { label: 'Th', value: 4 }, { label: 'Fr', value: 5 }, { label: 'Sa', value: 6 }, { label: 'Su', value: 0 },
]

// skipPast=true  → only future/today dates (used when actually creating blocks)
// skipPast=false → all dates from fromDate (used for availability check, includes viewed past day)
function getRepeatDates(days: number[], weeks: number, fromDate: string, skipPast = true): string[] {
    const start = parseISO(fromDate); start.setHours(0, 0, 0, 0)
    const cutoff = skipPast ? (() => { const t = new Date(); t.setHours(0,0,0,0); return t })() : start
    const dates = new Set<string>()
    for (let w = 0; w < weeks; w++) {
        for (const day of days) {
            const offset = (day - start.getDay() + 7) % 7 + w * 7
            const d = addDays(start, offset)
            if (d >= cutoff) dates.add(format(d, 'yyyy-MM-dd'))
        }
    }
    return [...dates].sort()
}

// ─── TaskPicker ───────────────────────────────────────────────────────────────
type TaskOption = { id: number; name: string; completed: boolean; priority: string; estimated_duration?: number; due_date?: string }

function TaskPicker({ personId, value, onChange }: {
    personId: string; value?: number
    onChange: (id?: number, duration?: number) => void
}) {
    const [search, setSearch] = useState('')
    const [open, setOpen] = useState(false)
    const { data: tasks = [] } = useTasksList({ person_id: personId })
    const options: TaskOption[] = useMemo(() =>
        (tasks as TaskOption[]).filter(t => t?.name && !t.completed && t.name.toLowerCase().includes(search.toLowerCase())),
        [tasks, search])
    const selected = (tasks as TaskOption[]).find((t: TaskOption) => t.id === value)

    if (!open && !value) return (
        <button type="button" onClick={() => setOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-white/8 bg-white/3 text-white/40 hover:text-white/70 hover:border-white/15 transition-all text-sm">
            <LinkIcon className="w-3.5 h-3.5" />Link to a task (optional)
        </button>
    )
    if (!open && selected) return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
            <LinkIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="flex-1 text-sm text-white truncate">{selected.name}</span>
            {selected.estimated_duration && (
                <span className="text-xs text-indigo-300/70">{selected.estimated_duration}min</span>
            )}
            <button type="button" onClick={() => onChange(undefined)} className="text-white/40 hover:text-white/80"><X className="w-3.5 h-3.5" /></button>
        </div>
    )
    return (
        <div className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
                <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none" />
                <button type="button" onClick={() => { setOpen(false); setSearch('') }} className="text-white/40 hover:text-white/80"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="max-h-40 overflow-y-auto">
                {options.length === 0
                    ? <p className="text-white/30 text-xs text-center py-4">No tasks found</p>
                    : options.map(task => (
                        <button key={task.id} type="button"
                            onClick={() => { onChange(task.id, task.estimated_duration); setOpen(false); setSearch('') }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${task.priority === 'high' ? 'bg-red-400' : task.priority === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                            <span className="text-sm text-white truncate flex-1">{task.name}</span>
                            {task.estimated_duration && (
                                <span className="text-xs text-white/35 shrink-0">{task.estimated_duration}min</span>
                            )}
                        </button>
                    ))}
            </div>
        </div>
    )
}

// ─── Block Form ───────────────────────────────────────────────────────────────
function hasOverlap(start: string, end: string, existing: TimeBlock[], excludeId?: number): TimeBlock | null {
    const s = timeToMinutes(start)
    const e = timeToMinutes(end)
    for (const b of existing) {
        if (b.id === excludeId || b.deleted) continue
        const bs = timeToMinutes(b.start_time)
        const be = timeToMinutes(b.end_time)
        if (s < be && e > bs) return b
    }
    return null
}

function BlockForm({ initial, personId, onSubmit, onCancel, isLoading, existingBlocks, editingId, currentDay }: {
    initial?: Partial<BlockFormData>; personId: string
    onSubmit: (d: BlockFormData) => void; onCancel: () => void; isLoading?: boolean
    existingBlocks?: TimeBlock[]; editingId?: number; currentDay: string
}) {
    const [form, setForm] = useState<BlockFormData>({
        title: initial?.title ?? '', description: initial?.description ?? '',
        start_time: initial?.start_time ?? '09:00', end_time: initial?.end_time ?? '10:00',
        category: initial?.category ?? 'work', task_id: initial?.task_id, task_duration: undefined,
        is_recurring: initial?.is_recurring ?? false, repeat_days: [], repeat_weeks: 4,
    })
    const [showRepeat, setShowRepeat] = useState(false)

    const set = (k: keyof BlockFormData) => (v: string) => setForm(p => {
        if (k === 'start_time') {
            const startMins = timeToMinutes(v)
            const endMins   = timeToMinutes(p.end_time)
            // Auto-push end to start + 1h whenever end is no longer after start
            if (endMins <= startMins) {
                const newEnd = Math.min(startMins + 60, HOUR_END * 60 - 1)
                return { ...p, start_time: v, end_time: minutesToTime(newEnd) }
            }
        }
        return { ...p, [k]: v }
    })

    const conflict = form.start_time < form.end_time
        ? hasOverlap(form.start_time, form.end_time, existingBlocks ?? [], editingId)
        : null
    const canSave = (!!form.title.trim() || !!form.task_id) && form.start_time < form.end_time && !conflict

    // ── Availability check for repeat dates ───────────────────────────────────
    const validTime = form.start_time < form.end_time
    // Same dates that will actually be created (skipPast=true — next upcoming weekday, not a past one)
    const targetDates = (showRepeat && (form.repeat_days?.length ?? 0) > 0 && validTime)
        ? getRepeatDates(form.repeat_days!, form.repeat_weeks ?? 4, currentDay)
        : []
    const repeatDayResults = useTimeBlocksByDays(targetDates)
    const isCheckingAvail = repeatDayResults.some(r => r.isLoading || r.isFetching)
    const conflictedDates = targetDates.filter((date, i) => {
        const dayBlocks = (repeatDayResults[i]?.data ?? []) as TimeBlock[]
        return hasOverlap(form.start_time, form.end_time, dayBlocks) !== null
    })

    return (
        <form onSubmit={e => { e.preventDefault(); if (!canSave) return; onSubmit(form) }}
            className="space-y-4">

            <div className="space-y-1.5">
                <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">
                    Title {!form.task_id && '*'}
                </Label>
                <Input value={form.title} onChange={e => set('title')(e.target.value)}
                    placeholder={form.task_id ? 'Uses task name if left empty' : 'e.g. Deep Work Session'}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl focus:border-indigo-500/60 focus:ring-0" />
            </div>

            <div className="space-y-1.5">
                <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">Link Task</Label>
                <TaskPicker personId={personId} value={form.task_id} onChange={(id, duration) => {
                    setForm(p => {
                        const updates: Partial<BlockFormData> = { task_id: id, task_duration: duration }
                        if (id && duration) {
                            const endMins = timeToMinutes(p.start_time) + duration
                            updates.end_time = minutesToTime(Math.min(endMins, HOUR_END * 60 - 1))
                        }
                        return { ...p, ...updates }
                    })
                }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">Start *</Label>
                    <Input type="time" value={form.start_time} onChange={e => {
                        const v = e.target.value
                        setForm(p => {
                            if (p.task_duration) {
                                const endMins = timeToMinutes(v) + p.task_duration
                                return { ...p, start_time: v, end_time: minutesToTime(Math.min(endMins, HOUR_END * 60 - 1)) }
                            }
                            const startMins = timeToMinutes(v)
                            const endMins   = timeToMinutes(p.end_time)
                            if (endMins <= startMins) {
                                const newEnd = Math.min(startMins + 60, HOUR_END * 60 - 1)
                                return { ...p, start_time: v, end_time: minutesToTime(newEnd) }
                            }
                            return { ...p, start_time: v }
                        })
                    }} className="bg-white/5 border-white/10 text-white rounded-xl focus:border-indigo-500/60 focus:ring-0" />
                </div>
                {form.task_duration ? (
                    <div className="space-y-1.5">
                        <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">End</Label>
                        <div className="flex items-center h-10 px-3 rounded-xl border border-indigo-500/25 bg-indigo-500/8 gap-2">
                            <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="text-sm text-white">{form.end_time}</span>
                            <span className="text-xs text-indigo-300/60 ml-auto">{form.task_duration}min</span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">End *</Label>
                        <Input type="time" value={form.end_time} onChange={e => set('end_time')(e.target.value)}
                            className="bg-white/5 border-white/10 text-white rounded-xl focus:border-indigo-500/60 focus:ring-0" />
                    </div>
                )}
            </div>
            {form.start_time >= form.end_time && !form.task_duration && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25">
                    <p className="text-red-400 text-xs leading-relaxed">
                        {form.end_time === '00:00'
                            ? '12:00 AM = midnight. Did you mean 12:00 PM (noon)?'
                            : 'End time must be after start time'}
                    </p>
                    {form.end_time === '00:00' && (
                        <button type="button"
                            onClick={() => setForm(p => ({ ...p, end_time: '12:00' }))}
                            className="shrink-0 text-xs font-semibold text-red-300 hover:text-white border border-red-400/40 hover:border-white/30 px-2 py-0.5 rounded-lg transition-colors whitespace-nowrap">
                            Set noon
                        </button>
                    )}
                </div>
            )}
            {conflict && form.start_time < form.end_time && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30">
                    <span className="text-red-400 text-sm shrink-0">⚠</span>
                    <p className="text-red-300 text-xs leading-relaxed">
                        Overlaps with <span className="font-semibold text-red-200">"{conflict.title}"</span>{' '}
                        ({conflict.start_time}–{conflict.end_time})
                    </p>
                </div>
            )}

            <div className="space-y-1.5">
                <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">Category</Label>
                <Select value={form.category} onValueChange={set('category')}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl focus:border-indigo-500/60">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16172a] border-white/10 text-white rounded-xl">
                        {CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                                <span className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />{c.label}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Repeat on days */}
            <div className="space-y-2">
                <button type="button" onClick={() => { setShowRepeat(v => !v); if (showRepeat) setForm(p => ({ ...p, repeat_days: [] })) }}
                    className={`flex items-center gap-2 text-sm font-medium transition-colors ${showRepeat ? 'text-indigo-400' : 'text-white/40 hover:text-white/70'}`}>
                    <span className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${showRepeat ? 'bg-indigo-600 border-indigo-600' : 'border-white/20'}`}>
                        {showRepeat && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    Repeat on days of week
                </button>
                {showRepeat && (
                    <div className="space-y-3 pl-6">
                        <div className="flex gap-1.5 flex-wrap">
                            {WEEK_DAYS.map(d => {
                                const active = form.repeat_days?.includes(d.value)
                                return (
                                    <button key={d.value} type="button"
                                        onClick={() => setForm(p => ({ ...p, repeat_days: active ? p.repeat_days?.filter(x => x !== d.value) : [...(p.repeat_days ?? []), d.value] }))}
                                        className={`w-9 h-9 rounded-xl text-xs font-semibold transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:border-white/20'}`}>
                                        {d.label}
                                    </button>
                                )
                            })}
                        </div>
                        <div className="flex items-center gap-2">
                            <Label className="text-white/50 text-xs whitespace-nowrap">For</Label>
                            <Select value={String(form.repeat_weeks ?? 4)} onValueChange={v => setForm(p => ({ ...p, repeat_weeks: Number(v) }))}>
                                <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-xs w-28 rounded-lg"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-[#16172a] border-white/10 text-white">
                                    {[1, 2, 4, 8, 12, 24, 52].map(w => <SelectItem key={w} value={String(w)} className="text-xs">{w} {w === 1 ? 'week' : 'weeks'}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <span className="text-white/35 text-xs">ahead</span>
                        </div>
                        {(form.repeat_days?.length ?? 0) > 0 && (
                            <p className="text-indigo-400/80 text-xs">~{(form.repeat_days?.length ?? 0) * (form.repeat_weeks ?? 4)} blocks will be created</p>
                        )}
                        {/* Availability check */}
                        {targetDates.length > 0 && (
                            <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
                                {isCheckingAvail ? (
                                    <div className="flex items-center gap-1.5 text-white/40 text-xs">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Checking availability…
                                    </div>
                                ) : conflictedDates.length === 0 ? (
                                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        All {targetDates.length} dates are free
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                            {conflictedDates.length} of {targetDates.length} dates have conflicts
                                        </div>
                                        <div className="space-y-1 pl-5">
                                            {conflictedDates.map(date => {
                                                const idx = targetDates.indexOf(date)
                                                const dayBlocks = (repeatDayResults[idx]?.data ?? []) as TimeBlock[]
                                                const overlapping = hasOverlap(form.start_time, form.end_time, dayBlocks)
                                                return (
                                                    <p key={date} className="text-xs text-amber-300/70">
                                                        {format(parseISO(date), 'EEE, MMM d')}
                                                        {overlapping && (
                                                            <span className="text-white/35"> — "{overlapping.title}"</span>
                                                        )}
                                                    </p>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Auto-recurring */}
            <button type="button" onClick={() => setForm(p => ({ ...p, is_recurring: !p.is_recurring }))}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${form.is_recurring ? 'text-emerald-400' : 'text-white/40 hover:text-white/70'}`}>
                <span className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${form.is_recurring ? 'bg-emerald-600 border-emerald-600' : 'border-white/20'}`}>
                    {form.is_recurring && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <RefreshCw className="w-3.5 h-3.5" />
                Auto-copy to next week (Celery)
            </button>

            <div className="space-y-1.5">
                <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">Notes</Label>
                <Textarea value={form.description} onChange={e => set('description')(e.target.value)}
                    placeholder="Optional notes…"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl min-h-[72px] resize-none focus:border-indigo-500/60 focus:ring-0" />
            </div>

            <div className="flex gap-3 pt-1">
                <Button type="button" variant="ghost" onClick={onCancel}
                    className="flex-1 text-white/50 hover:text-white border border-white/10 rounded-xl">Cancel</Button>
                <Button type="submit" disabled={isLoading || !canSave}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save block'}
                </Button>
            </div>
        </form>
    )
}

// ─── TimeBlockCard ────────────────────────────────────────────────────────────
function TimeBlockCard({ block, taskTitle, onEdit, onDelete, onToggle }: {
    block: TimeBlock; taskTitle?: string
    onEdit: (b: TimeBlock) => void; onDelete: (b: TimeBlock) => void; onToggle: (b: TimeBlock) => void
}) {
    const cat    = getCat(block.category)
    const top    = blockTop(block.start_time)
    const height = blockHeight(block.start_time, block.end_time)
    const dur    = timeToMinutes(block.end_time) - timeToMinutes(block.start_time)
    const isShort = height < 52
    const isMissed = block.is_missed

    // Block is locked once its end_time has passed today, or if it's from a past day
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const nowMins = now.getHours() * 60 + now.getMinutes()
    const isPast = block.date < todayStr || (block.date === todayStr && timeToMinutes(block.end_time) <= nowMins)

    return (
        <motion.div layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            style={{ position: 'absolute', top, left: 0, right: 0, height, borderLeftColor: isMissed ? '#ef4444' : (block.color ?? cat.color) }}
            className={`group rounded-xl border border-l-[3px] px-2.5 py-2 select-none overflow-hidden backdrop-blur-sm transition-all duration-150 cursor-pointer hover:brightness-110
                ${block.is_completed
                    ? 'bg-white/4 border-white/8 opacity-70'
                    : isMissed
                        ? 'bg-red-500/10 border-red-500/30'
                        : `bg-gradient-to-br ${cat.from} ${cat.to} ${cat.border}`}`}
            onClick={() => onEdit(block)}>
            <div className="flex items-start justify-between gap-1 h-full">
                <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate leading-tight ${isShort ? 'text-xs' : 'text-sm'} ${block.is_completed ? 'line-through text-white/35' : isMissed ? 'text-red-300' : 'text-white'}`}>
                        {block.title}
                    </p>
                    {!isShort && (
                        <p className={`text-xs mt-0.5 ${isMissed ? 'text-red-400/60' : 'text-white/45'}`}>
                            {block.start_time}–{block.end_time} <span className="opacity-60">({dur}m)</span>
                            {isMissed && <span className="ml-1.5 font-semibold">· missed</span>}
                        </p>
                    )}
                    {!isShort && taskTitle && (
                        <div className="flex items-center gap-1 mt-1"><LinkIcon className="w-2.5 h-2.5 text-indigo-400 shrink-0" /><p className="text-xs text-indigo-300 truncate">{taskTitle}</p></div>
                    )}
                    {!isShort && block.is_recurring && (
                        <div className="flex items-center gap-1 mt-0.5"><RefreshCw className="w-2.5 h-2.5 text-emerald-400 shrink-0" /><p className="text-xs text-emerald-400">recurring</p></div>
                    )}
                </div>
                <div className="flex gap-0.5 transition-opacity shrink-0 opacity-0 group-hover:opacity-100">
                    {/* Toggle (mark done) always allowed */}
                    <button onClick={e => { e.stopPropagation(); onToggle(block) }}
                        className={`p-1 rounded-lg transition-colors ${block.is_completed ? 'text-emerald-400 bg-emerald-500/15' : 'text-white/35 hover:text-emerald-400 hover:bg-emerald-500/15'}`}>
                        <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); onEdit(block) }} className="p-1 rounded-lg text-white/35 hover:text-indigo-400 hover:bg-indigo-500/15 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isPast && (
                        <button onClick={e => { e.stopPropagation(); onDelete(block) }} className="p-1 rounded-lg text-white/35 hover:text-red-400 hover:bg-red-500/15 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

// ─── Timeline Ruler ───────────────────────────────────────────────────────────
function TimelineRuler() {
    return (
        <div className="relative" style={{ height: TOTAL_HOURS * PX_PER_HOUR }}>
            {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
                const hour = HOUR_START + i
                const label = hour === 0 || hour === 24 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`
                return (
                    <div key={hour} className="absolute left-0 right-0 flex items-center gap-3" style={{ top: i * PX_PER_HOUR }}>
                        <span className="text-[11px] text-white/25 w-14 text-right shrink-0 font-medium">{label}</span>
                        <div className="flex-1 h-px bg-white/6" />
                    </div>
                )
            })}
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div key={`h-${i}`} className="absolute left-[74px] right-0 h-px bg-white/3" style={{ top: i * PX_PER_HOUR + PX_PER_HOUR / 2 }} />
            ))}
        </div>
    )
}

// ─── Current Time Indicator ───────────────────────────────────────────────────
function CurrentTimeIndicator({ day }: { day: string }) {
    if (!isToday(parseISO(day))) return null
    const now = new Date()
    const offsetMins = now.getHours() * 60 + now.getMinutes() - HOUR_START * 60
    if (offsetMins < 0 || offsetMins > TOTAL_HOURS * 60) return null
    const top = (offsetMins / 60) * PX_PER_HOUR
    return (
        <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top }}>
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)] -ml-1.5 shrink-0" />
            <div className="flex-1 h-px bg-gradient-to-r from-red-400/70 to-transparent" />
        </div>
    )
}

// ─── Week Strip ───────────────────────────────────────────────────────────────
function WeekStrip({ currentDay, onSelect }: { currentDay: string; onSelect: (d: string) => void }) {
    const parsed = parseISO(currentDay)
    const weekStart = startOfWeek(parsed, { weekStartsOn: 1 })
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

    return (
        <div className="flex gap-1">
            {days.map(d => {
                const key   = format(d, 'yyyy-MM-dd')
                const isAct = isSameDay(d, parsed)
                const isTod = isToday(d)
                return (
                    <button key={key} onClick={() => onSelect(key)}
                        className={`flex flex-col items-center px-3 py-2 rounded-xl transition-all text-center min-w-[46px]
                            ${isAct ? 'bg-indigo-600 shadow-lg shadow-indigo-500/25 text-white' : isTod ? 'bg-white/8 text-white border border-white/15' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
                        <span className="text-[10px] font-semibold uppercase tracking-wider">{format(d, 'EEE')}</span>
                        <span className={`text-base font-bold leading-tight mt-0.5 ${isAct || isTod ? 'text-white' : ''}`}>{format(d, 'd')}</span>
                    </button>
                )
            })}
        </div>
    )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function DaySummary({ blocks, taskMap, onAddNew }: { blocks: TimeBlock[]; taskMap: Record<number, string>; onAddNew: () => void }) {
    const total     = blocks.length
    const done      = blocks.filter(b => b.is_completed).length
    const missed    = blocks.filter(b => b.is_missed).length
    const totalMins = blocks.reduce((acc, b) => acc + timeToMinutes(b.end_time) - timeToMinutes(b.start_time), 0)
    const pct       = total > 0 ? Math.round((done / total) * 100) : 0
    const byCategory = CATEGORIES.map(c => ({ ...c, count: blocks.filter(b => b.category === c.value).length })).filter(c => c.count > 0)

    return (
        <div className="space-y-3">
            {/* Stats */}
            <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm p-5">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-4">Day Overview</p>
                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <div className="rounded-xl bg-white/4 p-3">
                        <p className="text-2xl font-bold text-white">{total}</p>
                        <p className="text-[10px] text-white/35 mt-0.5 uppercase tracking-wide">Blocks</p>
                    </div>
                    <div className="rounded-xl bg-emerald-500/10 p-3">
                        <p className="text-2xl font-bold text-emerald-400">{done}</p>
                        <p className="text-[10px] text-white/35 mt-0.5 uppercase tracking-wide">Done</p>
                    </div>
                    {missed > 0 ? (
                        <div className="rounded-xl bg-red-500/10 p-3">
                            <p className="text-2xl font-bold text-red-400">{missed}</p>
                            <p className="text-[10px] text-white/35 mt-0.5 uppercase tracking-wide">Missed</p>
                        </div>
                    ) : (
                        <div className="rounded-xl bg-indigo-500/10 p-3">
                            <p className="text-2xl font-bold text-indigo-400">{Math.round(totalMins / 60)}h</p>
                            <p className="text-[10px] text-white/35 mt-0.5 uppercase tracking-wide">Sched</p>
                        </div>
                    )}
                </div>
                {total > 0 && (
                    <div>
                        <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-white/35">Completion</span>
                            <span className={`font-semibold ${pct === 100 ? 'text-emerald-400' : pct > 50 ? 'text-indigo-400' : 'text-white/60'}`}>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full"
                                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Categories */}
            {byCategory.length > 0 && (
                <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm p-5">
                    <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Categories</p>
                    <div className="space-y-2">
                        {byCategory.map(cat => (
                            <div key={cat.value} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${cat.dot}`} />
                                    <span className="text-sm text-white/70">{cat.label}</span>
                                </div>
                                <span className="text-xs font-semibold text-white/40 bg-white/6 px-2 py-0.5 rounded-lg">{cat.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Schedule list */}
            <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm p-5">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Schedule</p>
                {blocks.length === 0
                    ? <p className="text-white/25 text-sm text-center py-6">No blocks yet</p>
                    : (
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-0.5">
                            {blocks.map(b => {
                                const cat = getCat(b.category)
                                const linked = b.task_id ? taskMap[b.task_id] : undefined
                                const isMissed = b.is_missed
                                return (
                                    <div key={b.id}
                                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all
                                            ${b.is_completed
                                                ? 'opacity-45 border-white/5 bg-white/3'
                                                : isMissed
                                                    ? 'border-red-500/30 bg-red-500/8'
                                                    : `${cat.border} bg-gradient-to-r ${cat.from} ${cat.to}`}`}>
                                        <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ background: isMissed ? '#ef4444' : (b.color ?? cat.color) }} />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium truncate ${b.is_completed ? 'line-through text-white/35' : isMissed ? 'text-red-300' : 'text-white'}`}>{b.title}</p>
                                            <p className={`text-xs ${isMissed ? 'text-red-400/60' : 'text-white/35'}`}>
                                                {b.start_time}–{b.end_time}
                                                {isMissed && <span className="ml-1.5 font-semibold">· missed</span>}
                                            </p>
                                            {linked && <div className="flex items-center gap-1 mt-0.5"><LinkIcon className="w-2.5 h-2.5 text-indigo-400 shrink-0" /><p className="text-xs text-indigo-300 truncate">{linked}</p></div>}
                                            {b.is_recurring && <div className="flex items-center gap-1 mt-0.5"><RefreshCw className="w-2.5 h-2.5 text-emerald-400 shrink-0" /><p className="text-xs text-emerald-400">recurring</p></div>}
                                        </div>
                                        {b.is_completed && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                    </div>
                                )
                            })}
                        </div>
                    )}
            </div>

            <button onClick={onAddNew}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30">
                <Plus className="w-4 h-4" />Add Block
            </button>
        </div>
    )
}

// ─── Suggestions Banner ───────────────────────────────────────────────────────
function SuggestionsBanner({
    tasks,
    blocks,
    currentDay,
    onSchedule,
}: {
    tasks: TaskOption[]
    blocks: TimeBlock[]
    currentDay: string
    onSchedule: (task: TaskOption) => void
}) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + (6 - today.getDay()))
    const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
    const weekEndStr = fmtDate(weekEnd)

    const scheduledTaskIds = new Set(blocks.map(b => b.task_id).filter(Boolean))

    const suggestions = tasks.filter(t =>
        !t.completed &&
        !scheduledTaskIds.has(t.id) &&
        t.due_date &&
        t.due_date <= weekEndStr
    ).slice(0, 5)

    if (suggestions.length === 0) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 mb-5"
        >
            <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-sm font-semibold text-amber-300">
                    {suggestions.length} task{suggestions.length !== 1 ? 's' : ''} due this week — not yet scheduled
                </span>
            </div>
            <div className="flex flex-wrap gap-2">
                {suggestions.map(task => (
                    <button
                        key={task.id}
                        onClick={() => onSchedule(task)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs hover:bg-amber-500/20 transition-all"
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${task.priority === 'high' ? 'bg-red-400' : task.priority === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                        {task.name}
                        {task.due_date && (
                            <span className="text-amber-400/60 ml-0.5">· {task.due_date}</span>
                        )}
                    </button>
                ))}
            </div>
        </motion.div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TimetablePage() {
    const params   = useParams()
    const router   = useRouter()
    const personId = params.id as string
    const [currentDay, setCurrentDay]   = useState(() => format(new Date(), 'yyyy-MM-dd'))
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null)
    const [propagateCategory, setPropagateCategory] = useState(false)
    const [clickedTime, setClickedTime]  = useState<string | null>(null)
    const timelineRef = useRef<HTMLDivElement>(null)

    const { data: blocks = [], isLoading } = useTimeBlocksByDay(currentDay)
    const { data: tasks  = [] }             = useTasksList({ person_id: personId })
    const createBlock = useTimeBlockCreate()
    const updateBlock = useTimeBlockUpdate()
    const deleteBlock = useTimeBlockDelete()
    const toggleBlock = useTimeBlockToggle()

    const taskMap = useMemo(() =>
        Object.fromEntries((tasks as TaskOption[]).map(t => [t.id, t.name])), [tasks])

    const goPrev  = () => setCurrentDay(d => format(subDays(parseISO(d), 1), 'yyyy-MM-dd'))
    const goNext  = () => setCurrentDay(d => format(addDays(parseISO(d), 1), 'yyyy-MM-dd'))
    const goToday = () => setCurrentDay(format(new Date(), 'yyyy-MM-dd'))

    const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current) return
        const rect = timelineRef.current.getBoundingClientRect()
        const mins = Math.round((((e.clientY - rect.top) / PX_PER_HOUR) * 60) / 30) * 30 + HOUR_START * 60
        const clamped = Math.max(HOUR_START * 60, Math.min((HOUR_END - 1) * 60, mins))
        setClickedTime(minutesToTime(clamped) + '__' + minutesToTime(Math.min(clamped + 60, HOUR_END * 60 - 1)))
        setIsCreateOpen(true)
    }, [])

    const handleCreate = async (data: BlockFormData) => {
        const resolvedTitle = data.title.trim() || (data.task_id ? taskMap[data.task_id] : '') || 'Untitled'
        const payload = {
            title: resolvedTitle, description: data.description,
            start_time: data.start_time, end_time: data.end_time,
            category: data.category, task_id: data.task_id,
            is_recurring: data.is_recurring ?? false,
        }
        if ((data.repeat_days?.length ?? 0) > 0) {
            for (const date of getRepeatDates(data.repeat_days!, data.repeat_weeks ?? 4, currentDay))
                await createBlock.mutateAsync({ ...payload, date } as TimeBlockPayload)
        } else {
            await createBlock.mutateAsync({ ...payload, date: currentDay } as TimeBlockPayload)
        }
        setIsCreateOpen(false); setClickedTime(null)
    }

    const handleUpdate = async (data: BlockFormData) => {
        if (!editingBlock) return
        const resolvedTitle = data.title.trim() || (data.task_id ? taskMap[data.task_id] : '') || editingBlock.title
        const categoryChanged = data.category !== editingBlock.category
        await updateBlock.mutateAsync({ id: editingBlock.id, data: {
            title: resolvedTitle, description: data.description,
            start_time: data.start_time, end_time: data.end_time,
            category: data.category, task_id: data.task_id ?? undefined,
            is_recurring: data.is_recurring ?? false,
        }, propagate: propagateCategory && categoryChanged && !!editingBlock.is_recurring })
        setPropagateCategory(false)
        setEditingBlock(null)
    }

    const parsedDay  = parseISO(currentDay)
    const isTodayDay = isToday(parsedDay)
    const [preStart, preEnd] = (clickedTime ?? '__').split('__')

    const handleSuggestTask = useCallback((task: TaskOption) => {
        // Pre-fill form with next free 1h slot starting at 09:00
        const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
        const startMins = isTodayDay ? Math.max(9 * 60, Math.ceil(nowMins / 60) * 60) : 9 * 60
        const end = Math.min(startMins + (task.estimated_duration ?? 60), HOUR_END * 60)
        setClickedTime(minutesToTime(startMins) + '__' + minutesToTime(end))
        setIsCreateOpen(true)
    }, [isTodayDay])

    return (
        <div className="min-h-screen text-white">
            {/* Top gradient glow */}
            <div className="fixed top-0 left-0 right-0 h-64 bg-gradient-to-b from-indigo-950/30 to-transparent pointer-events-none z-0" />

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-8">
                    {/* Left: title */}
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                                <BarChart3 className="w-4 h-4 text-indigo-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white tracking-tight">Timetable</h1>
                                <p className="text-xs text-white/35">Plan and track every hour of your day</p>
                            </div>
                            <button onClick={() => router.push(`/platform/${personId}/timetable/stats`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-white/45 hover:text-white hover:border-white/20 text-xs font-medium transition-all ml-2">
                                <BarChart2 className="w-3.5 h-3.5" />Stats
                            </button>
                        </div>
                    </div>

                    {/* Right: week nav */}
                    <div className="flex flex-col items-end gap-3">
                        <div className="flex items-center gap-2">
                            <button onClick={goPrev} className="w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/20 transition-all">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="text-center min-w-[130px]">
                                <p className="font-semibold text-white text-sm">{isTodayDay ? 'Today' : format(parsedDay, 'EEEE')}</p>
                                <p className="text-xs text-white/35">{format(parsedDay, 'MMMM d, yyyy')}</p>
                            </div>
                            <button onClick={goNext} className="w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/20 transition-all">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                            {!isTodayDay && (
                                <button onClick={goToday} className="px-3 py-1.5 rounded-xl border border-white/15 text-white/60 hover:text-white hover:border-white/25 text-xs font-medium transition-all">
                                    Today
                                </button>
                            )}
                        </div>
                        <WeekStrip currentDay={currentDay} onSelect={setCurrentDay} />
                    </div>
                </div>

                {/* ── Suggestions Banner ── */}
                <SuggestionsBanner
                    tasks={tasks as TaskOption[]}
                    blocks={blocks}
                    currentDay={currentDay}
                    onSchedule={handleSuggestTask}
                />

                {/* ── Body ── */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">

                    {/* Timeline */}
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] backdrop-blur-sm overflow-hidden">
                        {/* Toolbar */}
                        <div className="px-5 py-3.5 border-b border-white/6 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-white/35">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Click timeline to add a block</span>
                            </div>
                            <button onClick={() => { setClickedTime(null); setIsCreateOpen(true) }}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-500/20">
                                <Plus className="w-3.5 h-3.5" />Add
                            </button>
                        </div>

                        <div className="px-4 py-4 overflow-y-auto max-h-[calc(100vh-240px)]">
                            {isLoading
                                ? <div className="flex items-center justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>
                                : (
                                    <div className="relative" style={{ height: TOTAL_HOURS * PX_PER_HOUR }}>
                                        <TimelineRuler />
                                        <div ref={timelineRef} className="absolute inset-0 ml-[74px] cursor-crosshair" onClick={handleTimelineClick} />
                                        <div className="absolute inset-0 ml-[74px] pointer-events-none">
                                            <CurrentTimeIndicator day={currentDay} />
                                        </div>
                                        <div className="absolute inset-0 ml-[74px] mr-1 pointer-events-none">
                                            <AnimatePresence>
                                                {blocks.map(block => (
                                                    <div key={block.id} className="pointer-events-auto">
                                                        <TimeBlockCard block={block} taskTitle={block.task_id ? taskMap[block.task_id] : undefined}
                                                            onEdit={setEditingBlock} onDelete={b => deleteBlock.mutateAsync({ id: b.id, date: b.date })}
                                                            onToggle={b => toggleBlock.mutateAsync({ id: b.id, date: b.date })} />
                                                    </div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <DaySummary blocks={blocks} taskMap={taskMap} onAddNew={() => { setClickedTime(null); setIsCreateOpen(true) }} />
                </div>
            </div>

            {/* Create Modal */}
            <Dialog open={isCreateOpen} onOpenChange={v => { setIsCreateOpen(v); if (!v) setClickedTime(null) }}>
                <DialogContent className="bg-[#13131f] border border-white/10 text-white max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white font-semibold">Add Time Block</DialogTitle>
                    </DialogHeader>
                    <BlockForm initial={clickedTime ? { start_time: preStart, end_time: preEnd } : undefined}
                        personId={personId} onSubmit={handleCreate}
                        onCancel={() => { setIsCreateOpen(false); setClickedTime(null) }}
                        isLoading={createBlock.isPending} existingBlocks={blocks} currentDay={currentDay} />
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog open={!!editingBlock} onOpenChange={v => { if (!v) { setEditingBlock(null); setPropagateCategory(false) } }}>
                <DialogContent className="bg-[#13131f] border border-white/10 text-white max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white font-semibold">Edit Time Block</DialogTitle>
                    </DialogHeader>
                    {editingBlock && (
                        <>
                            {editingBlock.is_recurring && (
                                <label className="flex items-center gap-2 px-1 py-2 text-sm text-amber-400/90 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={propagateCategory}
                                        onChange={e => setPropagateCategory(e.target.checked)}
                                        className="w-4 h-4 accent-amber-400 rounded"
                                    />
                                    Apply category change to all future recurring blocks
                                </label>
                            )}
                            <BlockForm initial={{ title: editingBlock.title, description: editingBlock.description ?? '',
                                start_time: editingBlock.start_time, end_time: editingBlock.end_time,
                                category: editingBlock.category, task_id: editingBlock.task_id, is_recurring: editingBlock.is_recurring }}
                                personId={personId} onSubmit={handleUpdate}
                                onCancel={() => { setEditingBlock(null); setPropagateCategory(false) }} isLoading={updateBlock.isPending}
                                existingBlocks={blocks} editingId={editingBlock.id} currentDay={currentDay} />
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
