'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    Target,
    Calendar,
    TrendingUp,
    Edit,
    Trash2,
    CheckCircle2,
    Book,
    DollarSign,
    Heart,
    ArrowUpRight,
    Clock,
    Activity,
    CheckSquare,
    Plus,
    Flag,
    CalendarPlus
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'

import { useGoalProfile } from '@/lib/hooks/use-goals'
import { useTasksByGoal, useTaskCreate, useTaskUpdate, useRecurringCompletions } from '@/lib/hooks/use-tasks'
import { useProgressLogsByGoal, useProgressLogCreate, useProgressLogUpdate, useProgressLogDelete } from '@/lib/hooks/use-progress-log'
import { useUser } from '@/lib/hooks/use-auth'
import { TaskList } from '@/components/features/tasks/tasks-view'
import { BaseModal } from '@/components/modals/base-modal'
import { GoalForm } from '@/components/modals/forms/goal-form'
import { TaskForm } from '@/components/modals/forms/task-form'
import { ProgressLogForm } from '@/components/modals/forms/progress-log-form'
import { MilestoneForm } from '@/components/modals/forms/milestone-form'
import { useMilestonesByGoal, useMilestoneDelete } from '@/lib/hooks/use-milestones'
import { useHttp } from '@/lib/hooks/use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'
import { useQueryClient } from '@tanstack/react-query'
import { ProgressLog, Milestone } from '@/types'
import { Pencil, Trash } from 'lucide-react'

// Helper function to get category icon
const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: React.ReactNode } = {
        Learning: <Book className="w-5 h-5" />,
        Finances: <DollarSign className="w-5 h-5" />,
        Health: <Heart className="w-5 h-5" />,
        Goals: <Target className="w-5 h-5" />,
    }
    return icons[category] || <Target className="w-5 h-5" />
}

// Helper function to get priority badge color
const getPriorityColor = (
    priority: string
): 'destructive' | 'default' | 'secondary' | 'outline' => {
    switch (priority) {
        case 'high':
            return 'destructive'
        case 'medium':
            return 'secondary'
        case 'low':
            return 'default'
        default:
            return 'default'
    }
}

// Helper function to get status badge color
const getStatusColor = (
    status: string
): 'destructive' | 'default' | 'secondary' | 'outline' => {
    switch (status) {
        case 'active':
            return 'default'
        case 'completed':
            return 'default'
        case 'paused':
            return 'secondary'
        case 'cancelled':
            return 'destructive'
        default:
            return 'default'
    }
}

// Circular Progress Component
const CircularProgress = ({
    percentage,
    label,
    color = "oklch(0.65 0.25 250)",
    size = 120,
    strokeWidth = 8
}: {
    percentage: number
    label: string
    color?: string
    size?: number
    strokeWidth?: number

}) => {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (percentage / 100) * circumference

    return (
        <div className="flex flex-col items-center gap-3">
            <svg width={size} height={size} className="transform -rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="oklch(0.25 0.02 240)"
                    strokeWidth={strokeWidth}
                />
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 1.5, ease: 'easeOut' }}
                    strokeLinecap="round"
                />
            </svg>
            <div className="text-center">
                <motion.div
                    className="text-2xl font-bold text-white"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                >
                    {percentage.toFixed(1)}%
                </motion.div>
                <div className="text-xs text-gray-400">{label}</div>
            </div>
        </div>
    )
}

// Timeline Component
const Timeline = ({
    startDate,
    targetDate,
}: {
    startDate: string
    targetDate: string
}) => {
    // Return early if no target date
    if (!targetDate) {
        const startFormatted = new Date(startDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
        return (
            <div className="space-y-4">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Started {startFormatted}</span>
                    <span className="text-gray-400">No deadline set</span>
                </div>
                <div className="relative h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
                    <div className="absolute h-full w-full bg-white/5" />
                </div>
            </div>
        )
    }

    const start = new Date(startDate).getTime()
    const target = new Date(targetDate).getTime()
    const now = new Date().getTime()

    // Handle invalid dates
    if (isNaN(start) || isNaN(target)) {
        return null
    }

    const totalDays = Math.ceil((target - start) / (1000 * 60 * 60 * 24))
    const daysPassed = Math.ceil((now - start) / (1000 * 60 * 60 * 24))
    const daysRemaining = Math.ceil((target - now) / (1000 * 60 * 60 * 24))
    const progress = totalDays > 0 ? Math.min(100, Math.max(0, (daysPassed / totalDays) * 100)) : 0

    const startFormatted = new Date(startDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
    const targetFormatted = new Date(targetDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                    <span className="text-gray-400">{startFormatted}</span>
                    <span className="text-gray-400">{targetFormatted}</span>
                </div>
                <div className="relative h-3 bg-white/5 rounded-full overflow-hidden border border-white/10">
                    <motion.div
                        className="absolute h-full bg-gradient-to-r from-blue-500 to-cyan-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                    <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Days Passed</div>
                    <div className="text-xl font-bold text-white">{Math.max(0, daysPassed)}</div>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                    <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Days Remaining</div>
                    <div className="text-xl font-bold text-white">
                        {Math.max(0, daysRemaining)}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Recurring Weekly Progress Widget ────────────────────────────────────────
function RecurringWeeklyProgress({ goalId }: { goalId: string }) {
    const { data: recurring = [], isLoading } = useRecurringCompletions(goalId, 4)

    if (isLoading || recurring.length === 0) return null

    // Build last-28-days date list
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const days: Date[] = Array.from({ length: 28 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - 27 + i); return d
    })
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const dayLabel = (d: Date) => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]

    const priorityDot: Record<string, string> = {
        high: 'bg-red-400', medium: 'bg-yellow-400', low: 'bg-green-400'
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
        >
            <Card
                className="p-6 border border-white/5 backdrop-blur-sm"
                style={{ backgroundColor: 'oklch(0.18 0.02 240)', borderColor: 'oklch(0.25 0.02 240)' }}
            >
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>🔄</span> Recurring Tasks
                        <span className="text-xs font-normal text-white/40 ml-1">— last 4 weeks</span>
                    </h2>
                </div>

                {/* Day header */}
                <div className="flex gap-1 mb-2 pl-[200px]">
                    {days.map((d, i) => (
                        <div key={i} className="w-6 flex-shrink-0 text-center">
                            {i % 7 === 0 && (
                                <span className="text-[9px] text-white/25 font-medium">{dayLabel(d)}</span>
                            )}
                        </div>
                    ))}
                </div>

                <div className="space-y-2">
                    {recurring.map(task => {
                        const completionSet = new Set(task.completions)
                        const totalDone = task.completions.length
                        const streak = (() => {
                            let s = 0
                            for (let i = 27; i >= 0; i--) {
                                if (completionSet.has(fmt(days[i]))) s++
                                else break
                            }
                            return s
                        })()

                        return (
                            <div key={task.task_id} className="flex items-center gap-2">
                                {/* Task name */}
                                <div className="w-[192px] flex items-center gap-2 shrink-0">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[task.priority] ?? 'bg-white/30'}`} />
                                    <span className="text-sm text-white/80 truncate" title={task.task_name}>
                                        {task.task_name}
                                    </span>
                                </div>

                                {/* Day cells */}
                                <div className="flex gap-1">
                                    {days.map((d, i) => {
                                        const dateStr = fmt(d)
                                        const done = completionSet.has(dateStr)
                                        const isToday = dateStr === fmt(today)
                                        return (
                                            <div key={i}
                                                title={`${dateStr}${done ? ' ✓' : ''}`}
                                                className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center transition-all
                                                    ${done
                                                        ? 'bg-emerald-500 shadow-sm shadow-emerald-500/30'
                                                        : isToday
                                                            ? 'bg-white/10 border border-white/20'
                                                            : d > today
                                                                ? 'bg-transparent'
                                                                : 'bg-white/5'
                                                    }`}
                                            >
                                                {done && <span className="text-[9px] text-white font-bold">✓</span>}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Stats */}
                                <div className="ml-2 flex items-center gap-3 shrink-0">
                                    <span className="text-xs text-white/40">{totalDone}/28</span>
                                    {streak > 0 && (
                                        <span className="text-xs text-amber-400 font-semibold">
                                            🔥 {streak}d
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                        <span className="text-xs text-white/35">Completed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-white/5" />
                        <span className="text-xs text-white/35">Missed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-amber-400">🔥</span>
                        <span className="text-xs text-white/35">Current streak</span>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

// Skeleton Loader
const GoalSkeleton = () => (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="space-y-4">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-full" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
            </div>
            <div className="space-y-6">
                <Skeleton className="h-48" />
                <Skeleton className="h-64" />
            </div>
        </div>
    </div>
)

export default function GoalPage() {
    const params = useParams()
    const router = useRouter()
    const { data: user } = useUser()
    const id = params.goalId as string

    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Task State
    const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false)
    const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false)
    const [editingTask, setEditingTask] = useState<any | null>(null)
    const [isScheduling, setIsScheduling] = useState(false)
    const createTask = useTaskCreate()
    const updateTask = useTaskUpdate()

    // Progress Log State
    const [isLogModalOpen, setIsLogModalOpen] = useState(false)
    const [isEditLogModalOpen, setIsEditLogModalOpen] = useState(false)
    const [isDeleteLogModalOpen, setIsDeleteLogModalOpen] = useState(false)
    const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false)
    const [isEditMilestoneModalOpen, setIsEditMilestoneModalOpen] = useState(false)
    const [isDeleteMilestoneModalOpen, setIsDeleteMilestoneModalOpen] = useState(false)
    const [editingLog, setEditingLog] = useState<ProgressLog | null>(null)
    const [selectedLog, setSelectedLog] = useState<ProgressLog | null>(null)
    const [logToDelete, setLogToDelete] = useState<ProgressLog | null>(null)
    const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null)
    const [milestoneToDelete, setMilestoneToDelete] = useState<Milestone | null>(null)

    const {
        data: goalData,
        isLoading,
        error,
        updateGoal,
        deleteGoal
    } = useGoalProfile(id as string)

    const { data: tasks, isLoading: isTasksLoading } = useTasksByGoal(id as string)
    const { data: progressLogs, isLoading: isLogsLoading } = useProgressLogsByGoal(id as string)
    const { data: milestones, isLoading: isMilestonesLoading } = useMilestonesByGoal(id as string)

    const createLog = useProgressLogCreate()
    const updateLog = useProgressLogUpdate()
    const deleteLog = useProgressLogDelete()
    const deleteMilestone = useMilestoneDelete()
    const { request } = useHttp()
    const queryClient = useQueryClient()

    const isLoaded = !isLoading && goalData

    const handleScheduleThisWeek = async () => {
        setIsScheduling(true)
        try {
            const result = await request(API_ENDPOINTS.TIMETABLE.AUTO_SCHEDULE(id as string), { method: 'POST' })
            const count = Array.isArray(result) ? result.length : 0
            queryClient.invalidateQueries({ queryKey: ['timetable'] })
            alert(count > 0 ? `Scheduled ${count} block${count !== 1 ? 's' : ''} this week!` : 'No free slots found or all tasks already scheduled.')
        } catch {
            alert('Failed to auto-schedule. Please try again.')
        } finally {
            setIsScheduling(false)
        }
    }

    const handleEditMilestone = (milestone: Milestone) => {
        setSelectedMilestone(milestone)
        setIsEditMilestoneModalOpen(true)
    }

    const handleDeleteMilestone = (milestone: Milestone) => {
        setMilestoneToDelete(milestone)
        setIsDeleteMilestoneModalOpen(true)
    }

    const confirmDeleteMilestone = () => {
        if (milestoneToDelete) {
            deleteMilestone.mutate(milestoneToDelete.id, {
                onSuccess: () => {
                    setIsDeleteMilestoneModalOpen(false)
                    setMilestoneToDelete(null)
                }
            })
        }
    }

    if (isLoading) {
        return <GoalSkeleton />
    }

    if (error || !goalData) {
        return (
            <div className="min-h-screen p-6 flex items-center justify-center text-white">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">Goal not found</h2>
                    <p className="text-gray-400 mb-4">The goal you are looking for does not exist or an error occurred.</p>
                    <Button onClick={() => router.push('/platform?category=goals')}>
                        Back to Goals
                    </Button>
                </div>
            </div>
        )
    }

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
            },
        },
    }

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.3 },
        },
    }

    // Mock Data (Progress Logs removed as we use real data) - keeping for reference if needed but logic uses progressLogs

    const handleAddTaskSubmit = async (data: any) => {
        await createTask.mutateAsync({ ...data, goal_id: Number(id) })
        setIsAddTaskModalOpen(false)
    }

    const handleEdit = () => {
        setIsEditModalOpen(true)
    }

    const handleEditSubmit = async (data: Partial<typeof goalData>) => {
        try {
            await updateGoal.mutateAsync({
                id: goalData.id.toString(),
                data: data
            })
            setIsEditModalOpen(false)
        } catch (error) {
        }
    }

    const handleDelete = () => {
        setIsDeleteModalOpen(true)
    }

    const handleDeleteConfirm = async () => {
        setIsDeleting(true)
        try {
            await deleteGoal.mutateAsync(goalData.id.toString())
            router.push('/platform?category=goals')
        } catch (error) {
            setIsDeleting(false)
        }
    }

    const handleMarkComplete = async () => {
        try {
            await updateGoal.mutateAsync({
                id: goalData.id.toString(),
                data: { status: goalData.status === 'completed' ? 'active' : 'completed' }
            })
        } catch (error) {
        }
    }

    const handleLogSubmit = async (data: any) => {
        try {
            if (editingLog) {
                await updateLog.mutateAsync({
                    id: editingLog.id,
                    data: data
                })
            } else {
                await createLog.mutateAsync({
                    ...data,
                    goal_id: Number(id)
                })
            }
            setIsLogModalOpen(false)
            setEditingLog(null)
        } catch (error) {
        }
    }

    const handleEditLog = (log: ProgressLog) => {
        setEditingLog(log)
        setIsLogModalOpen(true)
    }

    const confirmDeleteLog = (log: ProgressLog) => {
        setLogToDelete(log)
        setIsDeleteLogModalOpen(true)
    }

    const handleDeleteLogConfirm = async () => {
        if (logToDelete) {
            try {
                await deleteLog.mutateAsync(logToDelete.id)
                setIsDeleteLogModalOpen(false)
                setLogToDelete(null)
            } catch (error) {
            }
        }
    }

    const createdDate = new Date(goalData.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })

    const updatedDate = new Date(goalData.updated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })

    const startDate = new Date(goalData.start_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })

    const targetDate = goalData.target_date ? new Date(goalData.target_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }) : 'No target date'

    const isOverdue = goalData.target_date &&
        goalData.status !== 'completed' &&
        new Date(goalData.target_date) < new Date()



    return (
        <div
            className="min-h-screen p-6"
            style={{
                backgroundColor: 'oklch(0.15 0.02 240)',
            }}
        >
            <motion.div
                className="max-w-7xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >


                {/* Header Section */}
                <motion.div
                    variants={itemVariants}
                    className="flex flex-col md:flex-row md:items-start justify-between gap-6"
                >
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-orange-500/10 text-orange-500`}>
                                {getCategoryIcon(goalData.category)}
                            </div>
                            <span className="text-sm font-medium text-orange-500/80 uppercase tracking-wider">{goalData.category}</span>
                        </div>

                        <div>
                            <h1
                                className="text-4xl lg:text-5xl font-bold mb-3 tracking-tight"
                                style={{ color: 'oklch(0.95 0.01 240)' }}
                            >
                                {goalData.name}
                            </h1>
                            <p
                                className="text-lg md:text-xl max-w-2xl leading-relaxed"
                                style={{ color: 'oklch(0.7 0.02 240)' }}
                            >
                                {goalData.description}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <Badge
                                variant={getStatusColor(goalData.status)}
                                className="px-3 py-1 text-sm capitalize"
                            >
                                {goalData.status}
                            </Badge>
                            <Badge
                                variant={getPriorityColor(goalData.priority)}
                                className="px-3 py-1 text-sm capitalize"
                            >
                                {goalData.priority} Priority
                            </Badge>
                            {isOverdue && (
                                <Badge className="px-3 py-1 text-sm bg-red-500/15 text-red-400 border border-red-500/30">
                                    ⚠ Overdue
                                </Badge>
                            )}
                            <div className="flex items-center gap-2 text-sm text-gray-400 ml-2">
                                <Clock className="w-4 h-4" />
                                <span>Updated {updatedDate}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Header Actions - hidden on mobile, shown on desktop */}
                        <div className="hidden md:flex gap-3">
                            <Button
                                onClick={handleEdit}
                                variant="outline"
                                className="gap-2 border-white/10 hover:bg-white/5"
                            >
                                <Edit className="w-4 h-4" />
                                {/* Edit */}
                            </Button>
                            {/* <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1"
                                onClick={() => setIsMilestoneModalOpen(true)}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add Milestone
                            </Button> */}
                            <Button
                                onClick={handleMarkComplete}
                                className={`gap-2 ${goalData.status === 'completed'
                                    ? 'bg-white/10 hover:bg-white/20 text-white'
                                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                                    }`}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {/* {goalData.status === 'completed' ? 'Reopen Goal' : 'Complete Goal'} */}
                            </Button>
                            <Button
                                onClick={handleDelete}
                                variant="ghost"
                                size="icon"
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                                <Trash2 className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                </motion.div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column - Progress & Stats */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Progress Overview Card */}
                        <motion.div variants={itemVariants}>
                            <Card
                                className="p-8 border border-white/5 backdrop-blur-sm overflow-hidden relative"
                                style={{
                                    backgroundColor: 'oklch(0.18 0.02 240)',
                                    borderColor: 'oklch(0.25 0.02 240)',
                                }}
                            >
                                <div className="absolute top-0 right-0 p-32 bg-orange-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                                <h2 className="text-xl font-bold mb-8 flex items-center gap-2 text-white">
                                    <Activity className="w-5 h-5 text-orange-500" />
                                    Progress Overview
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                                    {/* Circular Progress */}
                                    <div className="flex justify-center">
                                        <CircularProgress
                                            percentage={goalData.progress_percentage || 0}
                                            label="Overall Completion"
                                            color="oklch(0.65 0.25 25)"
                                            size={160}
                                            strokeWidth={12}
                                        />
                                    </div>

                                    {/* Metrics */}
                                    <div className="space-y-8">
                                        {/* Current Value / Target Value */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">Current Value</span>
                                                <span className="text-white font-medium">
                                                    {goalData.current_value} / {goalData.target_value}
                                                </span>
                                            </div>
                                            <Progress
                                                value={(goalData.current_value / (goalData.target_value || 1)) * 100}
                                                className="h-3 bg-white/5"
                                            // indicatorClassName="bg-orange-500" // Requires custom progress component usually
                                            />
                                            <div className="text-xs text-gray-500 text-right">
                                                {((goalData.current_value / (goalData.target_value || 1)) * 100).toFixed(0)}% to target
                                            </div>
                                        </div>

                                        {/* Task Completion */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">Tasks Completed</span>
                                                <span className="text-white font-medium">
                                                    {goalData.task_completion_percentage?.toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                                                    style={{ width: `${goalData.task_completion_percentage || 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </motion.div>

                        {/* Timeline Card */}
                        <motion.div variants={itemVariants}>
                            <Card
                                className="p-8 border border-white/5 backdrop-blur-sm"
                                style={{
                                    backgroundColor: 'oklch(0.18 0.02 240)',
                                    borderColor: 'oklch(0.25 0.02 240)',
                                }}
                            >
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
                                    <Calendar className="w-5 h-5 text-blue-500" />
                                    Timeline
                                </h2>
                                <Timeline
                                    startDate={goalData.start_date}
                                    targetDate={goalData.target_date || ''}
                                />
                            </Card>
                        </motion.div>

                        {/* Progress Logs Section */}
                        <motion.div variants={itemVariants}>
                            <Card
                                className="p-8 border border-white/5 backdrop-blur-sm"
                                style={{
                                    backgroundColor: 'oklch(0.18 0.02 240)',
                                    borderColor: 'oklch(0.25 0.02 240)',
                                }}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                        <TrendingUp className="w-5 h-5 text-green-500" />
                                        Progress Logs
                                    </h2>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1 border-white/10 hover:bg-white/5 text-xs"
                                        onClick={() => {
                                            setEditingLog(null)
                                            setIsLogModalOpen(true)
                                        }}
                                    >
                                        <Plus className="w-3 h-3" /> Add Log
                                    </Button>
                                </div>

                                {/* Simple Chart */}
                                <div className="h-48 w-full mb-8 relative">
                                    {/* Mock Chart Visualization - In real app, use Recharts or similar */}
                                    {/* For now, just keeping the visual placeholder but maybe we can make it slightly dynamic later if needed */}
                                    <div className="absolute inset-0 flex items-end justify-between px-2 pb-6">
                                        {/* Grid lines */}
                                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
                                            {[...Array(5)].map((_, i) => (
                                                <div key={i} className="w-full h-px bg-white/5" />
                                            ))}
                                        </div>

                                        {/* Bars/Points Mockup since we don't have a chart lib */}
                                        <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                            <defs>
                                                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="oklch(0.65 0.25 250)" stopOpacity="0.3" />
                                                    <stop offset="100%" stopColor="oklch(0.65 0.25 250)" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>
                                            <path
                                                d="M0,150 L30,140 L100,120 L180,90 L260,60 L350,30 L350,180 L0,180 Z"
                                                fill="url(#chartGradient)"
                                            />
                                            <path
                                                d="M0,150 L30,140 L100,120 L180,90 L260,60 L350,30"
                                                fill="none"
                                                stroke="oklch(0.65 0.25 250)"
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                            />
                                            {[
                                                { x: 0, y: 150 }, { x: 30, y: 140 }, { x: 100, y: 120 },
                                                { x: 180, y: 90 }, { x: 260, y: 60 }, { x: 350, y: 30 }
                                            ].map((p, i) => (
                                                <circle key={i} cx={`${(i / 5) * 100}%`} cy={p.y} r="4" fill="oklch(0.65 0.25 250)" stroke="white" strokeWidth="2" />
                                            ))}
                                        </svg>
                                    </div>
                                    <div className="absolute bottom-0 w-full flex justify-between text-xs text-gray-500 px-2">
                                        <span>Jan 1</span>
                                        <span>Jan 8</span>
                                        <span>Jan 15</span>
                                        <span>Jan 22</span>
                                        <span>Jan 29</span>
                                        <span>Today</span>
                                    </div>
                                </div>

                                {/* Recent Logs List */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Recent Entries</h3>
                                    <div className="space-y-3">
                                        {progressLogs?.slice().reverse().map((log) => (
                                            <div key={log.id} className="group flex items-center gap-4 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                                                <div className="flex flex-col items-center justify-center min-w-[3rem] text-center">
                                                    <span className="text-xs font-bold text-gray-400">{new Date(log.log_date).toLocaleDateString(undefined, { month: 'short' })}</span>
                                                    <span className="text-lg font-bold text-white">{new Date(log.log_date).getDate()}</span>
                                                </div>
                                                <div className="h-8 w-px bg-white/10" />
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-white font-medium">{log.notes}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                                        {log.mood && <span className="capitalize">Mood: {log.mood}</span>}
                                                        {log.mood && log.energy_level && <span>•</span>}
                                                        {log.energy_level && <span>Energy: {log.energy_level}/10</span>}
                                                    </div>
                                                </div>

                                                {/* Right Column - Actions & Value */}
                                                <div className="flex flex-col items-end gap-1 ml-4">
                                                    <div className="flex items-center justify-end gap-1 h-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleEditLog(log)
                                                            }}
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                confirmDeleteLog(log)
                                                            }}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                    <span className="text-orange-500 font-bold">+{log.value_logged} units</span>
                                                </div>
                                            </div>
                                        ))}
                                        {(!progressLogs || progressLogs.length === 0) && (
                                            <div className="text-center py-6 text-gray-400">
                                                No progress logs yet. Start tracking!
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        </motion.div>

                        {/* Milestones Section */}
                        <motion.div variants={itemVariants}>
                            <Card
                                className="p-8 border border-white/5 backdrop-blur-sm"
                                style={{
                                    backgroundColor: 'oklch(0.18 0.02 240)',
                                    borderColor: 'oklch(0.25 0.02 240)',
                                }}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                        <Flag className="w-5 h-5 text-purple-500" />
                                        Milestones
                                    </h2>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1 border-white/10 hover:bg-white/5 text-xs"
                                        onClick={() => setIsMilestoneModalOpen(true)}
                                    >
                                        <Plus className="w-3 h-3" /> Add Milestone
                                    </Button>
                                </div>

                                <div className="space-y-1">
                                    <div className="space-y-1">
                                        {isMilestonesLoading ? (
                                            <div className="space-y-4">
                                                {[...Array(3)].map((_, i) => (
                                                    <Skeleton key={i} className="h-16 w-full bg-white/5" />
                                                ))}
                                            </div>
                                        ) : milestones && milestones.length > 0 ? (
                                            milestones.map((milestone: any, index: number) => (
                                                <div key={milestone.id} className="relative pl-6 pb-6 last:pb-0">
                                                    {/* Vertical Line */}
                                                    {index !== milestones.length - 1 && (
                                                        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-white/10" />
                                                    )}

                                                    {/* Item */}
                                                    <div className={`absolute left-0 top-1 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center bg-[#1a1a2e] z-10 transition-colors
                                                ${milestone.achieved ? 'border-green-500' : 'border-gray-600'}`}>
                                                        {milestone.achieved && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                                                    </div>

                                                    <div className="flex flex-col gap-2 w-full">
                                                        <div className="flex items-start justify-between">
                                                            <div>
                                                                <h4 className={`text-base font-medium ${milestone.achieved ? 'text-white' : 'text-gray-400'}`}>
                                                                    {milestone.name}
                                                                </h4>
                                                                <span className="text-xs text-gray-500">
                                                                    Target: {new Date(milestone.target_date).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                            <div className="flex gap-1">
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-6 w-6 text-gray-400 hover:text-white"
                                                                    onClick={() => handleEditMilestone(milestone)}
                                                                >
                                                                    <Pencil className="w-3 h-3" />
                                                                </Button>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-6 w-6 text-gray-400 hover:text-red-400 hover:bg-red-900/10"
                                                                    onClick={() => handleDeleteMilestone(milestone)}
                                                                >
                                                                    <Trash className="w-3 h-3" />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between gap-4 mt-1">
                                                            <div className="flex-1">
                                                                {!milestone.achieved && (milestone.completion_percentage || 0) > 0 && (
                                                                    <div className="w-full gap-2 flex items-center">
                                                                        <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden">
                                                                            <div className="h-full bg-purple-500" style={{ width: `${milestone.completion_percentage}%` }} />
                                                                        </div>
                                                                        <span className="text-xs text-gray-500">{milestone.completion_percentage}%</span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {milestone.achieved ? (
                                                                <Badge variant="outline" className="border-green-500/20 text-green-500 bg-green-500/10 whitespace-nowrap">Achieved</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="border-white/10 text-gray-500 whitespace-nowrap">Pending</Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-6 text-gray-500 text-sm">
                                                No milestones created yet
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        </motion.div>
                    </div>

                    {/* Right Column - Details & Actions */}
                    <div className="space-y-6">
                        {/* Quick Actions (Mobile Only - or sticky sidebar on desktop) */}
                        <motion.div variants={itemVariants} className="md:hidden">
                            <Card className="p-4 bg-white/5 border-white/10">
                                <div className="space-y-3">
                                    <Button
                                        onClick={handleMarkComplete}
                                        className="w-full justify-start"
                                        variant={goalData.status === 'completed' ? 'secondary' : 'default'}
                                    >
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        {goalData.status === 'completed' ? 'Mark Active' : 'Mark Complete'}
                                    </Button>
                                    <Button onClick={handleEdit} variant="outline" className="w-full justify-start">
                                        <Edit className="w-4 h-4 mr-2" /> Edit Goal
                                    </Button>
                                    <Button onClick={handleDelete} variant="destructive" className="w-full justify-start">
                                        <Trash2 className="w-4 h-4 mr-2" /> Delete Goal
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>


                        {/* Details Card */}
                        <motion.div variants={itemVariants}>
                            <Card
                                className="p-6 border border-white/5 backdrop-blur-sm"
                                style={{
                                    backgroundColor: 'oklch(0.18 0.02 240)',
                                    borderColor: 'oklch(0.25 0.02 240)',
                                }}
                            >
                                <h2 className="text-lg font-bold mb-6 text-white">Details</h2>
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <div className="flex items-center gap-3 text-gray-400">
                                            <Target className="w-4 h-4" />
                                            <span>Target Value</span>
                                        </div>
                                        <span className="font-semibold text-white">{goalData.target_value}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <div className="flex items-center gap-3 text-gray-400">
                                            <TrendingUp className="w-4 h-4" />
                                            <span>Current Value</span>
                                        </div>
                                        <span className="font-semibold text-white">{goalData.current_value}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <div className="flex items-center gap-3 text-gray-400">
                                            <Calendar className="w-4 h-4" />
                                            <span>Start Date</span>
                                        </div>
                                        <span className="text-white">{startDate}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <div className="flex items-center gap-3 text-gray-400">
                                            <Target className="w-4 h-4" />
                                            <span>Target Date</span>
                                        </div>
                                        <span className="text-white">{targetDate}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2">
                                        <div className="flex items-center gap-3 text-gray-400">
                                            <Clock className="w-4 h-4" />
                                            <span>Created</span>
                                        </div>
                                        <span className="text-white">{createdDate}</span>
                                    </div>
                                </div>
                            </Card>
                        </motion.div>

                        {/* Tasks List */}
                        <motion.div variants={itemVariants}>
                            <Card
                                className="p-6 border border-white/5 backdrop-blur-sm"
                                style={{
                                    backgroundColor: 'oklch(0.18 0.02 240)',
                                    borderColor: 'oklch(0.25 0.02 240)',
                                }}
                            >
                                <h2 className="text-lg font-bold mb-4 text-white flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span>Tasks</span>
                                        <Badge variant="secondary" className="bg-white/5 text-xs">
                                            {tasks?.length || 0}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            size="sm"
                                            onClick={handleScheduleThisWeek}
                                            disabled={isScheduling}
                                            className="h-7 px-2 text-xs gap-1"
                                            style={{ backgroundColor: 'oklch(0.45 0.15 150)', color: 'white' }}
                                        >
                                            <CalendarPlus className="w-3 h-3" />
                                            {isScheduling ? 'Scheduling...' : 'Schedule week'}
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => setIsAddTaskModalOpen(true)}
                                            className="h-7 px-2 text-xs gap-1"
                                            style={{ backgroundColor: 'oklch(0.55 0.18 250)', color: 'white' }}
                                        >
                                            <Plus className="w-3 h-3" />
                                            Add Task
                                        </Button>
                                    </div>
                                </h2>

                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {isTasksLoading ? (
                                        [...Array(3)].map((_, i) => (
                                            <Skeleton key={i} className="h-12 w-full bg-white/5" />
                                        ))
                                    ) : tasks && tasks.length > 0 ? (
                                        tasks.map((task: any) => (
                                            <div
                                                key={task.id}
                                                className="group p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all flex items-center gap-3"
                                            >
                                                <div
                                                    className={`p-1.5 rounded-md cursor-pointer ${task.completed
                                                        ? 'bg-green-500/10 text-green-500'
                                                        : 'bg-white/5 text-gray-400 group-hover:text-white'
                                                        }`}
                                                    onClick={() => router.push(`/platform/task/${task.id}`)}
                                                >
                                                    {task.completed ? (
                                                        <CheckCircle2 className="w-4 h-4" />
                                                    ) : (
                                                        <CheckSquare className="w-4 h-4" />
                                                    )}
                                                </div>
                                                <div
                                                    className="flex-1 min-w-0 cursor-pointer"
                                                    onClick={() => router.push(`/platform/task/${task.id}`)}
                                                >
                                                    <p className={`text-sm font-medium truncate ${task.completed ? 'text-gray-500 line-through' : 'text-white'
                                                        }`}>
                                                        {task.name}
                                                    </p>
                                                    {task.due_date && (
                                                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                            <Calendar className="w-3 h-3" />
                                                            {new Date(task.due_date).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                                <Badge
                                                    variant={getPriorityColor(task.priority)}
                                                    className="px-1.5 py-0.5 text-[10px] uppercase"
                                                >
                                                    {task.priority}
                                                </Badge>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingTask(task); setIsEditTaskModalOpen(true) }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-6 text-gray-500 text-sm">
                                            No tasks linked to this goal
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </motion.div>

                        {/* ── Recurring Tasks Weekly Progress ── */}
                        <RecurringWeeklyProgress goalId={id as string} />

                    </div>
                </div>



                {/* Add Task Modal */}
                <BaseModal
                    isOpen={isAddTaskModalOpen}
                    onClose={() => setIsAddTaskModalOpen(false)}
                    title="Add Task"
                    size="lg"
                >
                    <TaskForm
                        onSubmit={handleAddTaskSubmit}
                        onCancel={() => setIsAddTaskModalOpen(false)}
                        initialData={{ goal_id: Number(id) }}
                    />
                </BaseModal>

                {/* Edit Task Modal */}
                <BaseModal
                    isOpen={isEditTaskModalOpen}
                    onClose={() => { setIsEditTaskModalOpen(false); setEditingTask(null) }}
                    title="Edit Task"
                    size="lg"
                >
                    {editingTask && (
                        <TaskForm
                            onSubmit={(data: any) => {
                                updateTask.mutate(
                                    { id: editingTask.id, data },
                                    {
                                        onSuccess: () => {
                                            setIsEditTaskModalOpen(false)
                                            setEditingTask(null)
                                        }
                                    }
                                )
                            }}
                            onCancel={() => { setIsEditTaskModalOpen(false); setEditingTask(null) }}
                            initialData={editingTask}
                        />
                    )}
                </BaseModal>

                {/* Edit Modal */}
                <BaseModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    title="Edit Goal"
                    size="lg"
                >
                    <GoalForm
                        onSubmit={handleEditSubmit}
                        onCancel={() => setIsEditModalOpen(false)}
                        initialData={{
                            ...goalData,
                            start_date: goalData.start_date ? new Date(goalData.start_date) : undefined,
                            target_date: goalData.target_date ? new Date(goalData.target_date) : undefined,
                        }}
                    />
                </BaseModal>

                {/* Delete Confirmation Modal */}
                <BaseModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    title="Delete Goal"
                    description="Are you sure you want to delete this goal? This action cannot be undone."
                >
                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteModalOpen(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete Goal'}
                        </Button>
                    </div>
                </BaseModal>

                {/* Progress Log Modal */}
                <BaseModal
                    isOpen={isLogModalOpen}
                    onClose={() => {
                        setIsLogModalOpen(false)
                        setEditingLog(null)
                    }}
                    title={editingLog ? 'Edit Progress Log' : 'Log Progress'}
                >
                    <ProgressLogForm
                        goalId={Number(goalData.id)}
                        onSubmit={handleLogSubmit}
                        isLoading={createLog.isPending || updateLog.isPending}
                        defaultValues={editingLog ? {
                            value_logged: editingLog.value_logged,
                            notes: editingLog.notes,
                            mood: editingLog.mood,
                            energy_level: editingLog.energy_level,
                            log_date: editingLog.log_date
                        } : undefined}
                    />
                </BaseModal>

                {/* Log Delete Confirmation Modal */}
                <BaseModal
                    isOpen={isDeleteLogModalOpen}
                    onClose={() => setIsDeleteLogModalOpen(false)}
                    title="Delete Progress Log"
                    description="Are you sure you want to delete this log entry? This action cannot be undone."
                >
                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteLogModalOpen(false)}
                            disabled={deleteLog.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteLogConfirm}
                            disabled={deleteLog.isPending}
                        >
                            {deleteLog.isPending ? 'Deleting...' : 'Delete Log'}
                        </Button>
                    </div>
                </BaseModal>

                {/* Create Milestone Modal */}
                <BaseModal
                    isOpen={isMilestoneModalOpen}
                    onClose={() => setIsMilestoneModalOpen(false)}
                    title="Add Milestone"
                    description="Create a new milestone for this goal"
                >
                    <MilestoneForm
                        goalId={id}
                        onSuccess={() => setIsMilestoneModalOpen(false)}
                        onCancel={() => setIsMilestoneModalOpen(false)}
                    />
                </BaseModal>
                {/* Milestone Modals */}
                <BaseModal
                    isOpen={isEditMilestoneModalOpen}
                    onClose={() => setIsEditMilestoneModalOpen(false)}
                    title="Edit Milestone"
                    description="Update the details of your milestone"
                >
                    {selectedMilestone && (
                        <MilestoneForm
                            goalId={id}
                            milestone={selectedMilestone}
                            onSuccess={() => {
                                setIsEditMilestoneModalOpen(false)
                                setSelectedMilestone(null)
                            }}
                            onCancel={() => {
                                setIsEditMilestoneModalOpen(false)
                                setSelectedMilestone(null)
                            }}
                        />
                    )}
                </BaseModal>

                <BaseModal
                    isOpen={isDeleteMilestoneModalOpen}
                    onClose={() => setIsDeleteMilestoneModalOpen(false)}
                    title="Delete Milestone"
                    description="Are you sure you want to delete this milestone? This action cannot be undone."
                >
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setIsDeleteMilestoneModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDeleteMilestone} disabled={deleteMilestone.isPending}>
                            {deleteMilestone.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </BaseModal>
            </motion.div>
        </div>
    )
}
