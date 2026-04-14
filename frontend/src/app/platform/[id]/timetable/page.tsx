'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { format, addDays, subDays, isToday, parseISO } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronLeft, ChevronRight, Check, Trash2, Clock, CalendarDays, Loader2, Link as LinkIcon, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    useTimeBlocksByDay,
    useTimeBlockCreate,
    useTimeBlockUpdate,
    useTimeBlockDelete,
    useTimeBlockToggle,
    type TimeBlock,
    type TimeBlockPayload,
} from '@/lib/hooks/use-timetable'
import { useTasksList } from '@/lib/hooks/use-tasks'

// ─── Constants ────────────────────────────────────────────────────────────────
const HOUR_START = 6   // 6 AM
const HOUR_END   = 24  // midnight
const TOTAL_HOURS = HOUR_END - HOUR_START
const PX_PER_HOUR = 72  // height per hour in pixels

const CATEGORIES: { value: string; label: string; color: string; bg: string }[] = [
    { value: 'work',      label: 'Work',      color: '#3b82f6', bg: 'bg-blue-500/20 border-blue-500/40 text-blue-300' },
    { value: 'personal',  label: 'Personal',  color: '#a855f7', bg: 'bg-purple-500/20 border-purple-500/40 text-purple-300' },
    { value: 'health',    label: 'Health',    color: '#22c55e', bg: 'bg-green-500/20 border-green-500/40 text-green-300' },
    { value: 'learning',  label: 'Learning',  color: '#f59e0b', bg: 'bg-amber-500/20 border-amber-500/40 text-amber-300' },
    { value: 'social',    label: 'Social',    color: '#ec4899', bg: 'bg-pink-500/20 border-pink-500/40 text-pink-300' },
    { value: 'other',     label: 'Other',     color: '#6b7280', bg: 'bg-gray-500/20 border-gray-500/40 text-gray-300' },
]

const getCategoryStyle = (cat: string) =>
    CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
}

function minutesToTime(min: number): string {
    const h = Math.floor(min / 60).toString().padStart(2, '0')
    const m = (min % 60).toString().padStart(2, '0')
    return `${h}:${m}`
}

function blockTop(start: string): number {
    const mins = timeToMinutes(start) - HOUR_START * 60
    return (mins / 60) * PX_PER_HOUR
}

function blockHeight(start: string, end: string): number {
    const mins = timeToMinutes(end) - timeToMinutes(start)
    return Math.max((mins / 60) * PX_PER_HOUR, 24)
}

// ─── Block Form ───────────────────────────────────────────────────────────────
type BlockFormData = {
    title: string
    description: string
    start_time: string
    end_time: string
    category: string
    task_id?: number
}

type TaskOption = { id: number; title: string; status: string; priority: string }

function TaskPicker({
    personId,
    value,
    onChange,
}: {
    personId: string
    value?: number
    onChange: (id?: number) => void
}) {
    const [search, setSearch] = useState('')
    const [open, setOpen] = useState(false)
    const { data: tasks = [] } = useTasksList({ person_id: personId })

    const options: TaskOption[] = useMemo(() =>
        (tasks as TaskOption[]).filter(t =>
            t?.title &&
            t.status !== 'completed' &&
            t.title.toLowerCase().includes(search.toLowerCase())
        ),
        [tasks, search]
    )

    const selected = (tasks as TaskOption[]).find((t: TaskOption) => t.id === value)

    if (!open && !value) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-white/10 bg-white/5 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors text-sm"
            >
                <LinkIcon className="w-3.5 h-3.5" />
                Link to a task (optional)
            </button>
        )
    }

    if (!open && selected) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-blue-500/30 bg-blue-500/10">
                <LinkIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="flex-1 text-sm text-white truncate">{selected.title}</span>
                <button
                    type="button"
                    onClick={() => onChange(undefined)}
                    className="text-white/40 hover:text-white/80 transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        )
    }

    return (
        <div className="rounded-md border border-white/15 bg-white/5 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
                <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
                <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search tasks…"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                />
                <button
                    type="button"
                    onClick={() => { setOpen(false); setSearch('') }}
                    className="text-white/40 hover:text-white/80"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="max-h-40 overflow-y-auto">
                {options.length === 0 ? (
                    <p className="text-white/30 text-xs text-center py-4">No tasks found</p>
                ) : (
                    options.map(task => (
                        <button
                            key={task.id}
                            type="button"
                            onClick={() => { onChange(task.id); setOpen(false); setSearch('') }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/8 transition-colors text-left"
                        >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                task.priority === 'high' ? 'bg-red-400' :
                                task.priority === 'medium' ? 'bg-yellow-400' : 'bg-green-400'
                            }`} />
                            <span className="text-sm text-white truncate">{task.title}</span>
                            <span className="ml-auto text-xs text-white/30 shrink-0">{task.status}</span>
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}

function BlockForm({
    initial,
    personId,
    onSubmit,
    onCancel,
    isLoading,
}: {
    initial?: Partial<BlockFormData>
    personId: string
    onSubmit: (d: BlockFormData) => void
    onCancel: () => void
    isLoading?: boolean
}) {
    const [form, setForm] = useState<BlockFormData>({
        title: initial?.title ?? '',
        description: initial?.description ?? '',
        start_time: initial?.start_time ?? '09:00',
        end_time: initial?.end_time ?? '10:00',
        category: initial?.category ?? 'work',
        task_id: initial?.task_id,
    })

    const set = (k: keyof BlockFormData) => (v: string) =>
        setForm(prev => ({ ...prev, [k]: v }))

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.title.trim()) return
        if (form.start_time >= form.end_time) return
        onSubmit(form)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-white/80 text-sm">Title *</Label>
                <Input
                    value={form.title}
                    onChange={e => set('title')(e.target.value)}
                    placeholder="e.g. Deep Work Session"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-white/80 text-sm">Start time *</Label>
                    <Input
                        type="time"
                        value={form.start_time}
                        onChange={e => set('start_time')(e.target.value)}
                        className="bg-white/5 border-white/10 text-white"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-white/80 text-sm">End time *</Label>
                    <Input
                        type="time"
                        value={form.end_time}
                        onChange={e => set('end_time')(e.target.value)}
                        className="bg-white/5 border-white/10 text-white"
                    />
                </div>
            </div>
            {form.start_time >= form.end_time && (
                <p className="text-red-400 text-xs">End time must be after start time</p>
            )}

            <div className="space-y-1.5">
                <Label className="text-white/80 text-sm">Category</Label>
                <Select value={form.category} onValueChange={set('category')}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1b26] border-white/10 text-white">
                        {CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                                    {c.label}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <Label className="text-white/80 text-sm">Link Task</Label>
                <TaskPicker
                    personId={personId}
                    value={form.task_id}
                    onChange={id => setForm(prev => ({ ...prev, task_id: id }))}
                />
            </div>

            <div className="space-y-1.5">
                <Label className="text-white/80 text-sm">Notes</Label>
                <Textarea
                    value={form.description}
                    onChange={e => set('description')(e.target.value)}
                    placeholder="Optional notes…"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 min-h-[80px] resize-none"
                />
            </div>

            <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onCancel} className="flex-1 text-white/60 hover:text-white border border-white/10">
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={isLoading || !form.title.trim() || form.start_time >= form.end_time}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </Button>
            </div>
        </form>
    )
}

// ─── Single Block Card on timeline ────────────────────────────────────────────
function TimeBlockCard({
    block,
    taskTitle,
    onEdit,
    onDelete,
    onToggle,
}: {
    block: TimeBlock
    taskTitle?: string
    onEdit: (b: TimeBlock) => void
    onDelete: (b: TimeBlock) => void
    onToggle: (b: TimeBlock) => void
}) {
    const cat = getCategoryStyle(block.color ? 'other' : block.category)
    const top    = blockTop(block.start_time)
    const height = blockHeight(block.start_time, block.end_time)
    const durationMins = timeToMinutes(block.end_time) - timeToMinutes(block.start_time)
    const isShort = height < 48

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            style={{
                position: 'absolute',
                top: top,
                left: 0,
                right: 0,
                height: height,
                borderLeftColor: block.color ?? cat.color,
            }}
            className={`
                group rounded-lg border border-l-4 px-2.5 py-1.5 cursor-pointer select-none overflow-hidden
                transition-all duration-150
                ${block.is_completed
                    ? 'bg-white/5 border-white/10 opacity-60'
                    : `border-white/10 ${cat.bg}`}
            `}
            onClick={() => onEdit(block)}
        >
            <div className="flex items-start justify-between gap-1 h-full">
                <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate text-sm leading-tight ${block.is_completed ? 'line-through text-white/40' : 'text-white'}`}>
                        {block.title}
                    </p>
                    {!isShort && (
                        <p className="text-xs text-white/50 mt-0.5">
                            {block.start_time} – {block.end_time}
                            <span className="ml-1">({durationMins}m)</span>
                        </p>
                    )}
                    {!isShort && taskTitle && (
                        <div className="flex items-center gap-1 mt-1">
                            <LinkIcon className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                            <p className="text-xs text-blue-300 truncate">{taskTitle}</p>
                        </div>
                    )}
                    {!isShort && block.description && (
                        <p className="text-xs text-white/40 mt-1 line-clamp-2">{block.description}</p>
                    )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                    {block.task_id && !isShort && (
                        <span className="p-1 rounded bg-blue-500/20">
                            <LinkIcon className="w-3 h-3 text-blue-400" />
                        </span>
                    )}
                    <button
                        onClick={() => onToggle(block)}
                        className={`p-1 rounded transition-colors ${block.is_completed ? 'text-green-400 hover:text-green-300' : 'text-white/40 hover:text-green-400'}`}
                    >
                        <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => onDelete(block)}
                        className="p-1 rounded text-white/40 hover:text-red-400 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </motion.div>
    )
}

// ─── Timeline ruler ───────────────────────────────────────────────────────────
function TimelineRuler() {
    return (
        <div className="relative" style={{ height: TOTAL_HOURS * PX_PER_HOUR }}>
            {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
                const hour = HOUR_START + i
                const label = hour === 0 || hour === 24 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`
                return (
                    <div
                        key={hour}
                        className="absolute left-0 right-0 flex items-center gap-3"
                        style={{ top: i * PX_PER_HOUR }}
                    >
                        <span className="text-xs text-white/30 w-12 text-right shrink-0">{label}</span>
                        <div className="flex-1 h-px bg-white/8" />
                    </div>
                )
            })}
            {/* Half-hour marks */}
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div
                    key={`half-${i}`}
                    className="absolute left-16 right-0 h-px bg-white/4"
                    style={{ top: i * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                />
            ))}
        </div>
    )
}

// ─── Current time indicator ────────────────────────────────────────────────────
function CurrentTimeIndicator({ day }: { day: string }) {
    if (!isToday(parseISO(day))) return null
    const now = new Date()
    const totalMins = now.getHours() * 60 + now.getMinutes()
    const offsetMins = totalMins - HOUR_START * 60
    if (offsetMins < 0 || offsetMins > TOTAL_HOURS * 60) return null
    const top = (offsetMins / 60) * PX_PER_HOUR

    return (
        <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top }}>
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
            <div className="flex-1 h-px bg-red-500 opacity-70" />
        </div>
    )
}

// ─── Summary Sidebar ──────────────────────────────────────────────────────────
function DaySummary({ blocks, taskMap, onAddNew }: { blocks: TimeBlock[]; taskMap: Record<number, string>; onAddNew: () => void }) {
    const total = blocks.length
    const done  = blocks.filter(b => b.is_completed).length
    const totalMins = blocks.reduce((acc, b) =>
        acc + timeToMinutes(b.end_time) - timeToMinutes(b.start_time), 0)

    const byCategory = CATEGORIES.map(cat => ({
        ...cat,
        count: blocks.filter(b => b.category === cat.value).length,
    })).filter(c => c.count > 0)

    return (
        <div className="space-y-4">
            {/* Stats */}
            <Card className="bg-white/3 border-white/8 p-4">
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Day Overview</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                        <p className="text-2xl font-bold text-white">{total}</p>
                        <p className="text-xs text-white/40">Blocks</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-green-400">{done}</p>
                        <p className="text-xs text-white/40">Done</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-blue-400">{Math.round(totalMins / 60)}h</p>
                        <p className="text-xs text-white/40">Scheduled</p>
                    </div>
                </div>
                {total > 0 && (
                    <div className="mt-3">
                        <div className="flex justify-between text-xs text-white/40 mb-1">
                            <span>Completion</span>
                            <span>{total > 0 ? Math.round((done / total) * 100) : 0}%</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full transition-all duration-500"
                                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                )}
            </Card>

            {/* Categories */}
            {byCategory.length > 0 && (
                <Card className="bg-white/3 border-white/8 p-4">
                    <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Categories</h3>
                    <div className="space-y-2">
                        {byCategory.map(cat => (
                            <div key={cat.value} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
                                    <span className="text-sm text-white/70">{cat.label}</span>
                                </div>
                                <Badge variant="outline" className="text-xs border-white/20 text-white/60">{cat.count}</Badge>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Block list */}
            <Card className="bg-white/3 border-white/8 p-4">
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Schedule</h3>
                {blocks.length === 0 ? (
                    <p className="text-white/30 text-sm text-center py-4">No blocks yet</p>
                ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {blocks.map(b => {
                            const cat = getCategoryStyle(b.category)
                            const linkedTask = b.task_id ? taskMap[b.task_id] : undefined
                            return (
                                <div key={b.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${b.is_completed ? 'opacity-50 border-white/5 bg-white/3' : `border-white/10 ${cat.bg}`}`}>
                                    <div
                                        className="w-1 self-stretch rounded-full shrink-0"
                                        style={{ background: b.color ?? cat.color }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium truncate ${b.is_completed ? 'line-through text-white/40' : 'text-white'}`}>
                                            {b.title}
                                        </p>
                                        <p className="text-xs text-white/40">{b.start_time} – {b.end_time}</p>
                                        {linkedTask && (
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <LinkIcon className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                                                <p className="text-xs text-blue-300 truncate">{linkedTask}</p>
                                            </div>
                                        )}
                                    </div>
                                    {b.is_completed && <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                                </div>
                            )
                        })}
                    </div>
                )}
            </Card>

            <Button onClick={onAddNew} className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4" />
                Add Block
            </Button>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TimetablePage() {
    const params = useParams()
    const personId = params.id as string
    const [currentDay, setCurrentDay] = useState(() => format(new Date(), 'yyyy-MM-dd'))
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null)
    const [clickedTime, setClickedTime] = useState<string | null>(null)
    const timelineRef = useRef<HTMLDivElement>(null)

    const { data: blocks = [], isLoading } = useTimeBlocksByDay(currentDay)
    const { data: tasks = [] } = useTasksList({ person_id: personId })
    const createBlock  = useTimeBlockCreate()
    const updateBlock  = useTimeBlockUpdate()
    const deleteBlock  = useTimeBlockDelete()
    const toggleBlock  = useTimeBlockToggle()

    // Map task_id → title for quick lookup
    const taskMap = useMemo(() =>
        Object.fromEntries((tasks as TaskOption[]).map(t => [t.id, t.title])),
        [tasks]
    )

    const goToday = () => setCurrentDay(format(new Date(), 'yyyy-MM-dd'))
    const goPrev  = () => setCurrentDay(d => format(subDays(parseISO(d), 1), 'yyyy-MM-dd'))
    const goNext  = () => setCurrentDay(d => format(addDays(parseISO(d), 1), 'yyyy-MM-dd'))

    // Click on timeline to create a block at that time
    const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current) return
        const rect = timelineRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top
        const mins = Math.round((y / PX_PER_HOUR) * 60 / 30) * 30 + HOUR_START * 60
        const clamped = Math.max(HOUR_START * 60, Math.min((HOUR_END - 1) * 60, mins))
        const start = minutesToTime(clamped)
        const end   = minutesToTime(Math.min(clamped + 60, HOUR_END * 60))
        setClickedTime(start + '__' + end)
        setIsCreateOpen(true)
    }, [])

    const handleCreate = async (data: BlockFormData) => {
        await createBlock.mutateAsync({
            title: data.title,
            description: data.description,
            start_time: data.start_time,
            end_time: data.end_time,
            category: data.category,
            task_id: data.task_id,
            date: currentDay,
        } as TimeBlockPayload)
        setIsCreateOpen(false)
        setClickedTime(null)
    }

    const handleUpdate = async (data: BlockFormData) => {
        if (!editingBlock) return
        await updateBlock.mutateAsync({
            id: editingBlock.id,
            data: {
                title: data.title,
                description: data.description,
                start_time: data.start_time,
                end_time: data.end_time,
                category: data.category,
                task_id: data.task_id ?? undefined,
            }
        })
        setEditingBlock(null)
    }

    const handleDelete = async (block: TimeBlock) => {
        await deleteBlock.mutateAsync({ id: block.id, date: block.date })
    }

    const handleToggle = async (block: TimeBlock) => {
        await toggleBlock.mutateAsync({ id: block.id, date: block.date })
    }

    const parsedDay = parseISO(currentDay)
    const dayLabel  = isToday(parsedDay) ? 'Today' : format(parsedDay, 'EEEE')
    const dateLabel = format(parsedDay, 'MMMM d, yyyy')

    const [preStart, preEnd] = (clickedTime ?? '__').split('__')

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white">
            <div className="max-w-7xl mx-auto px-6 py-8">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <CalendarDays className="w-6 h-6 text-blue-400" />
                            <h1 className="text-2xl font-bold text-white">Timetable</h1>
                        </div>
                        <p className="text-sm text-white/40">Plan and track every hour of your day</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={goPrev} className="text-white/60 hover:text-white">
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <div className="text-center min-w-[140px]">
                            <p className="font-semibold text-white">{dayLabel}</p>
                            <p className="text-xs text-white/40">{dateLabel}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={goNext} className="text-white/60 hover:text-white">
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                        {!isToday(parsedDay) && (
                            <Button variant="outline" size="sm" onClick={goToday} className="ml-2 text-white border-white/20 hover:bg-white/5">
                                Today
                            </Button>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                    {/* Timeline */}
                    <div className="lg:col-span-2">
                        <Card className="bg-white/3 border-white/8 overflow-hidden">
                            <div className="p-4 border-b border-white/8 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-white/60">
                                    <Clock className="w-4 h-4" />
                                    <span>Click on the timeline to add a block</span>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => { setClickedTime(null); setIsCreateOpen(true) }}
                                    className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white h-8"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add
                                </Button>
                            </div>

                            <div className="p-4 overflow-y-auto max-h-[calc(100vh-220px)]">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-20">
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                                    </div>
                                ) : (
                                    <div className="relative" style={{ height: TOTAL_HOURS * PX_PER_HOUR }}>
                                        {/* Ruler */}
                                        <TimelineRuler />

                                        {/* Clickable overlay */}
                                        <div
                                            ref={timelineRef}
                                            className="absolute inset-0 ml-16 cursor-crosshair"
                                            onClick={handleTimelineClick}
                                        />

                                        {/* Current time */}
                                        <div className="absolute inset-0 ml-16 pointer-events-none">
                                            <CurrentTimeIndicator day={currentDay} />
                                        </div>

                                        {/* Blocks */}
                                        <div className="absolute inset-0 ml-16 mr-1 pointer-events-none">
                                            <AnimatePresence>
                                                {blocks.map(block => (
                                                    <div key={block.id} className="pointer-events-auto">
                                                        <TimeBlockCard
                                                            block={block}
                                                            taskTitle={block.task_id ? taskMap[block.task_id] : undefined}
                                                            onEdit={setEditingBlock}
                                                            onDelete={handleDelete}
                                                            onToggle={handleToggle}
                                                        />
                                                    </div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div>
                        <DaySummary blocks={blocks} taskMap={taskMap} onAddNew={() => { setClickedTime(null); setIsCreateOpen(true) }} />
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            <Dialog open={isCreateOpen} onOpenChange={v => { setIsCreateOpen(v); if (!v) setClickedTime(null) }}>
                <DialogContent className="bg-[#1a1b26] border border-white/10 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white">Add Time Block</DialogTitle>
                    </DialogHeader>
                    <BlockForm
                        initial={clickedTime ? { start_time: preStart, end_time: preEnd } : undefined}
                        personId={personId}
                        onSubmit={handleCreate}
                        onCancel={() => { setIsCreateOpen(false); setClickedTime(null) }}
                        isLoading={createBlock.isPending}
                    />
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog open={!!editingBlock} onOpenChange={v => { if (!v) setEditingBlock(null) }}>
                <DialogContent className="bg-[#1a1b26] border border-white/10 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white">Edit Time Block</DialogTitle>
                    </DialogHeader>
                    {editingBlock && (
                        <BlockForm
                            initial={{
                                title: editingBlock.title,
                                description: editingBlock.description ?? '',
                                start_time: editingBlock.start_time,
                                end_time: editingBlock.end_time,
                                category: editingBlock.category,
                                task_id: editingBlock.task_id,
                            }}
                            personId={personId}
                            onSubmit={handleUpdate}
                            onCancel={() => setEditingBlock(null)}
                            isLoading={updateBlock.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
