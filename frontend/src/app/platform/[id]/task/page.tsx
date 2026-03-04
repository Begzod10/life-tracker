'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Calendar, CheckCircle2, Clock, Edit, Flag, Trash2, Target, Repeat } from 'lucide-react'
import { motion } from 'framer-motion'
import { format, differenceInDays, isPast } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTaskProfile, useSubtaskCreate, useSubtasks, useSubtaskUpdate, useSubtaskDelete } from '@/lib/hooks/use-tasks'
import { BaseModal } from '@/components/modals/base-modal'
import { TaskForm } from '@/components/modals/forms/task-form'
import { SubtaskForm } from '@/components/modals/forms/subtask-form'
import { SubtaskList } from '@/components/subtasks/subtask-list'
import { useProgressLogsByTask, useTaskProgressLogCreate, useProgressLogUpdate, useProgressLogDelete } from '@/lib/hooks/use-progress-log'
import { ProgressLogForm } from '@/components/modals/forms/progress-log-form'
import { ProgressLog } from '@/types'
import { TrendingUp, Plus } from 'lucide-react'

// Mock hook - replace with actual implementation
// const useTaskProfile = (id: string) => {
//     const [isLoading] = useState(false)

//     // Mock data for demonstration
//     const taskData = {
//         id: 1,
//         name: 'Complete project proposal',
//         description: 'Finish the quarterly project proposal and submit for review',
//         task_type: 'weekly' as const,
//         due_date: '2026-02-20T17:00:00Z',
//         priority: 'high' as const,
//         estimated_duration: 120,
//         goal_id: 5,
//         completed: false,
//         completed_at: null,
//         created_at: '2026-01-20T10:00:00Z',
//     }

//     return {
//         data: taskData,
//         isLoading,
//         error: null,
//     }
// }

type TaskData = {
    id: number
    name: string
    description: string
    task_type: 'daily' | 'weekly' | 'monthly'
    due_date: string
    priority: 'low' | 'medium' | 'high'
    estimated_duration: number
    goal_id: number
    completed: boolean
    completed_at: string | null
    created_at: string
}

const getPriorityGradient = (priority: string) => {
    const gradients = {
        high: 'from-red-500 to-orange-500',
        medium: 'from-yellow-500 to-amber-500',
        low: 'from-green-500 to-emerald-500',
    }
    return gradients[priority as keyof typeof gradients] || gradients.low
}

const getPriorityColor = (priority: string) => {
    const colors = {
        high: 'bg-red-500/10 text-red-400 border-red-500/20',
        medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        low: 'bg-green-500/10 text-green-400 border-green-500/20',
    }
    return colors[priority as keyof typeof colors] || colors.low
}

const getTaskTypeIcon = (type: string) => {
    const icons = {
        daily: '📅',
        weekly: '📆',
        monthly: '📊',
    }
    return icons[type as keyof typeof icons] || '📅'
}

// Header Section Component
function TaskHeader({ task }: { task: TaskData }) {
    const isCompleted = task.completed
    const daysRemaining = differenceInDays(new Date(task.due_date), new Date())
    const isOverdue = isPast(new Date(task.due_date)) && !isCompleted

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
        >


            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <h1 className="text-4xl font-bold text-foreground mb-3 text-balance">
                        {task.name}
                    </h1>
                    <p className="text-lg text-muted-foreground mb-4">
                        {task.description}
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring' }}
                        >
                            <Badge
                                variant="outline"
                                className={`px-4 py-2 text-base font-medium flex items-center gap-2 ${isCompleted
                                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                    : isOverdue
                                        ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse'
                                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                    }`}
                            >
                                <CheckCircle2 className="w-5 h-5" />
                                {isCompleted ? 'Completed' : isOverdue ? 'Overdue' : 'In Progress'}
                            </Badge>
                        </motion.div>

                        {daysRemaining > 0 && !isCompleted && (
                            <Badge variant="secondary" className="px-3 py-1">
                                {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
                            </Badge>
                        )}
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Button variant="outline" size="icon" className="h-10 w-10 bg-transparent">
                        <Edit className="w-5 h-5" />
                    </Button>
                </motion.div>
            </div>
        </motion.div>
    )
}

// Task Details Card Component
function TaskDetailsCard({ task }: { task: TaskData }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
        >
            <Card className="p-6 border border-white/5 bg-white/2.5 backdrop-blur-sm hover:border-white/10 transition-all">
                <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                    <Flag className="w-5 h-5" />
                    Task Details
                </h2>

                <div className="space-y-5">
                    {/* Priority */}
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Priority</span>
                        <Badge className={`px-3 py-1 font-medium capitalize ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                        </Badge>
                    </div>

                    {/* Task Type */}
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Type</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg">{getTaskTypeIcon(task.task_type)}</span>
                            <Badge variant="secondary" className="capitalize">
                                {task.task_type}
                            </Badge>
                        </div>
                    </div>

                    {/* Due Date */}
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Due Date</span>
                        <div className="flex items-center gap-2 text-foreground">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{format(new Date(task.due_date), 'MMM dd, yyyy')}</span>
                        </div>
                    </div>

                    {/* Estimated Duration */}
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Est. Duration</span>
                        <div className="flex items-center gap-2 text-foreground">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{task.estimated_duration} min</span>
                        </div>
                    </div>

                    {/* Created Date */}
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Created</span>
                        <span className="text-foreground font-medium text-sm">
                            {format(new Date(task.created_at), 'MMM dd, yyyy')}
                        </span>
                    </div>

                    {/* Goal Reference */}
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Goal</span>
                        <button className="flex items-center gap-2 px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
                            <Target className="w-4 h-4" />
                            <span className="text-sm font-medium">Goal #{task.goal_id}</span>
                        </button>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

// Progress/TimelineCard Component
function ProgressTimelineCard({
    task,
    subtasks = [],
    updatingSubtaskIds = new Set(),
    onAddSubtask,
    onEditSubtask,
    onDeleteSubtask,
    onToggleSubtask
}: {
    task: TaskData
    subtasks?: any[]
    updatingSubtaskIds?: Set<string | number>
    onAddSubtask: () => void
    onEditSubtask: (subtask: any) => void
    onDeleteSubtask: (subtask: any) => void
    onToggleSubtask: (subtask: any) => void
}) {
    const totalDays = differenceInDays(new Date(task.due_date), new Date(task.created_at))
    const daysPassed = differenceInDays(new Date(), new Date(task.created_at))
    const progress = Math.min(Math.max((daysPassed / totalDays) * 100, 0), 100)

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
        >
            <Card className="p-6 border border-white/5 bg-white/2.5 backdrop-blur-sm hover:border-white/10 transition-all">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                        <Repeat className="w-5 h-5" />
                        Timeline & Subtasks
                    </h2>
                    <Button variant="outline" size="sm" onClick={onAddSubtask}>
                        Add Subtask
                    </Button>
                </div>

                {/* Subtask List */}
                <div className="mb-8">
                    <SubtaskList
                        subtasks={subtasks}
                        updatingSubtaskIds={updatingSubtaskIds}
                        onEdit={onEditSubtask}
                        onDelete={onDeleteSubtask}
                        onToggle={onToggleSubtask}
                    />
                </div>

                {/* Timeline Visual */}
                <div className="space-y-6">
                    <div className="relative pl-4 border-l-2 border-[#2a2b36] space-y-8">
                        {/* Start */}
                        <div className="relative">
                            <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-[#3b82f6] ring-4 ring-[#1a1b26]" />
                            <p className="text-sm text-gray-500 mb-1">Created</p>
                            <p className="font-medium text-white">
                                {format(new Date(task.created_at), 'MMM d, yyyy')}
                            </p>
                        </div>

                        {/* End */}
                        <div className="relative">
                            <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-[#eab308] ring-4 ring-[#1a1b26]" />
                            <p className="text-sm text-gray-500 mb-1">Due</p>
                            <p className="font-medium text-white">
                                {format(new Date(task.due_date), 'MMM d, yyyy')}
                            </p>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Timeline Progress</span>
                            <span className="text-white font-medium">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-[#2a2b36] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

// Progress Logs Card Component
function ProgressLogsCard({
    progressLogs = [],
    onAddLog,
    onEditLog,
    onDeleteLog
}: {
    progressLogs: ProgressLog[]
    onAddLog: () => void
    onEditLog: (log: ProgressLog) => void
    onDeleteLog: (log: ProgressLog) => void
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
        >
            <Card className="p-6 border border-white/5 bg-white/2.5 backdrop-blur-sm hover:border-white/10 transition-all">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Progress Logs
                    </h2>
                    <Button variant="outline" size="sm" onClick={onAddLog}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Log
                    </Button>
                </div>

                <div className="space-y-4">
                    {progressLogs.slice().reverse().map((log) => (
                        <div key={log.id} className="group flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                            <div className="flex flex-col items-center justify-center min-w-[3.5rem] text-center">
                                <span className="text-xs font-bold text-muted-foreground uppercase">{new Date(log.log_date).toLocaleDateString(undefined, { month: 'short' })}</span>
                                <span className="text-xl font-bold text-foreground">{new Date(log.log_date).getDate()}</span>
                            </div>
                            <div className="h-10 w-px bg-white/10" />
                            <div className="flex-1">
                                <p className="text-foreground font-medium mb-1">{log.notes || 'No notes provided'}</p>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    {log.mood && <span className="capitalize text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Mood: {log.mood}</span>}
                                    {log.energy_level && <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Energy: {log.energy_level}/10</span>}
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-2 ml-4">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
                                        onClick={() => onEditLog(log)}
                                    >
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                        onClick={() => onDeleteLog(log)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                                <span className="text-blue-400 font-bold px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">+{log.value_logged}</span>
                            </div>
                        </div>
                    ))}
                    {(!progressLogs || progressLogs.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground bg-white/5 rounded-lg border border-white/5 border-dashed">
                            No progress logs yet. Start tracking!
                        </div>
                    )}
                </div>
            </Card>
        </motion.div>
    )
}

// Quick Actions Card Component
function QuickActionsCard({
    task,
    onToggleComplete,
    onDelete,
    onEdit,
    isCompleting,
    isDeleting
}: {
    task: TaskData;
    onToggleComplete: () => void;
    onDelete: () => void;
    onEdit: () => void;
    isCompleting: boolean;
    isDeleting: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
        >
            <Card className="p-6 border border-white/5 bg-white/2.5 backdrop-blur-sm hover:border-white/10 transition-all sticky top-4">
                <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>

                <div className="space-y-3">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onToggleComplete}
                        disabled={isCompleting}
                        className={`w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${task.completed
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                            : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700'
                            } ${isCompleting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isCompleting ? (
                            <Clock className="w-5 h-5 animate-spin" />
                        ) : (
                            <CheckCircle2 className="w-5 h-5" />
                        )}
                        {task.completed ? 'Mark Incomplete' : 'Mark Complete'}
                    </motion.button>

                    <Button
                        variant="outline"
                        onClick={onEdit}
                        className="w-full flex items-center justify-center gap-2 bg-transparent"
                    >
                        <Edit className="w-4 h-4" />
                        Edit Task
                    </Button>

                    <Button
                        variant="outline"
                        onClick={onDelete}
                        disabled={isDeleting}
                        className="w-full text-destructive hover:text-destructive flex items-center justify-center gap-2 bg-transparent"
                    >
                        {isDeleting ? (
                            <Clock className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                        Delete Task
                    </Button>
                </div>
            </Card>
        </motion.div>
    )
}

// Statistics Card Component
function StatisticsCard({ task }: { task: TaskData }) {
    const router = useRouter()
    const daysUntilDue = differenceInDays(new Date(task.due_date), new Date())
    const isOverdue = daysUntilDue < 0

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
        >
            <Card className="p-6 border border-white/5 bg-white/2.5 backdrop-blur-sm hover:border-white/10 transition-all">
                <h2 className="text-lg font-semibold text-foreground mb-4">Statistics</h2>

                <div className="space-y-4">
                    {/* Days Until Due */}
                    <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                        <p className="text-sm text-muted-foreground mb-1">
                            {isOverdue ? 'Days Overdue' : 'Days Until Due'}
                        </p>
                        <p className={`text-2xl font-bold ${isOverdue ? 'text-red-400' : 'text-blue-400'}`}>
                            {Math.abs(daysUntilDue)} day{Math.abs(daysUntilDue) !== 1 ? 's' : ''}
                        </p>
                    </div>

                    {/* Estimated vs Actual */}
                    <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                        <p className="text-sm text-muted-foreground mb-2">Estimated Duration</p>
                        <p className="text-lg font-semibold text-foreground">
                            {task.estimated_duration} minutes
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {Math.floor(task.estimated_duration / 60)}h {task.estimated_duration % 60}m
                        </p>
                    </div>

                    {/* Goal Reference */}
                    <div className="p-4 bg-white/5 rounded-lg border border-white/5">
                        <p className="text-sm text-muted-foreground mb-2">Related Goal</p>
                        <button
                            onClick={() => router.push(`/platform/${task.goal_id}/goal`)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
                        >
                            <Target className="w-4 h-4" />
                            <span className="text-sm font-medium">Goal #{task.goal_id}</span>
                        </button>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

// Loading Skeleton Component
function TaskProfileSkeleton() {
    return (
        <div className="space-y-8 p-6 max-w-7xl mx-auto">
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
}

// Main Page Component
export default function TaskProfilePage() {
    const params = useParams()
    const router = useRouter()
    const { id } = params
    const [isCompleting, setIsCompleting] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [isChangeModalOpen, setIsChangeModalOpen] = useState(false)
    const [isSubtaskModalOpen, setIsSubtaskModalOpen] = useState(false)
    const [editingSubtask, setEditingSubtask] = useState<any>(null)
    const [deletingSubtask, setDeletingSubtask] = useState<any>(null)
    const [updatingSubtaskIds, setUpdatingSubtaskIds] = useState<Set<string | number>>(new Set())
    const [isDeletingSubtask, setIsDeletingSubtask] = useState(false)

    // Progress Log state
    const [isLogModalOpen, setIsLogModalOpen] = useState(false)
    const [isDeleteLogModalOpen, setIsDeleteLogModalOpen] = useState(false)
    const [editingLog, setEditingLog] = useState<ProgressLog | null>(null)
    const [logToDelete, setLogToDelete] = useState<ProgressLog | null>(null)

    // Using the custom hook for data and mutations
    const {
        data: taskData,
        isLoading,
        error,
        updateTask,
        deleteTask
    } = useTaskProfile(id as string)

    const { data: subtasks = [] } = useSubtasks(id as string)

    const createSubtask = useSubtaskCreate()
    const updateSubtask = useSubtaskUpdate()
    const deleteSubtask = useSubtaskDelete()

    const { data: progressLogs = [], isLoading: isLogsLoading } = useProgressLogsByTask(id as string)
    const createLog = useTaskProgressLogCreate()
    const updateLog = useProgressLogUpdate()
    const deleteLog = useProgressLogDelete()

    const handleBack = () => router.push('/platform?category=tasks')

    const handleToggleComplete = async () => {
        if (!taskData) return

        setIsCompleting(true)
        try {
            await updateTask.mutateAsync({
                id: taskData.id,
                data: { completed: !taskData.completed }
            })
        } catch (error) {
            console.error('Failed to update task:', error)
        } finally {
            setIsCompleting(false)
        }
    }

    const handleDelete = () => {
        setIsDeleteModalOpen(true)
    }

    const handleDeleteConfirm = async () => {
        setIsDeleting(true)
        try {
            await deleteTask.mutateAsync(taskData?.id)
            // Redirect to tasks category after deletion
            router.push('/platform?category=tasks')
        } catch (error) {
            console.error('Failed to delete task:', error)
            setIsDeleting(false)
        }
    }

    const handleEditClick = () => {
        setIsChangeModalOpen(true)
    }

    const handleChange = async (data: any) => {
        try {
            await updateTask.mutateAsync({
                id: taskData?.id,
                data: data
            })
            setIsChangeModalOpen(false)
        } catch (error) {
            console.error('Failed to update task:', error)
        }
    }

    const handleSubtaskCreate = async (data: any) => {
        try {
            await createSubtask.mutateAsync(data)
            setIsSubtaskModalOpen(false)
        } catch (error) {
            console.error('Failed to create subtask:', error)
        }
    }

    const handleSubtaskEditSubmit = async (data: any) => {
        if (!editingSubtask) return
        try {
            await updateSubtask.mutateAsync({
                id: editingSubtask.id,
                data: data
            })
            setEditingSubtask(null)
        } catch (error) {
            console.error('Failed to update subtask:', error)
        }
    }

    const handleSubtaskDeleteConfirm = async () => {
        if (!deletingSubtask) return

        setIsDeletingSubtask(true)
        try {
            await deleteSubtask.mutateAsync(deletingSubtask.id)
            setDeletingSubtask(null)
        } catch (error) {
            console.error('Failed to delete subtask:', error)
        } finally {
            setIsDeletingSubtask(false)
        }
    }

    const handleSubtaskToggle = async (subtask: any) => {
        setUpdatingSubtaskIds(prev => {
            const next = new Set(prev)
            next.add(subtask.id)
            return next
        })
        try {
            await updateSubtask.mutateAsync({
                id: subtask.id,
                data: { completed: !subtask.completed }
            })
        } catch (error) {
            console.error('Failed to toggle subtask:', error)
        } finally {
            setUpdatingSubtaskIds(prev => {
                const next = new Set(prev)
                next.delete(subtask.id)
                return next
            })
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
                    task_id: Number(id)
                })
            }
            setIsLogModalOpen(false)
            setEditingLog(null)
        } catch (error) {
            console.error('Failed to save log:', error)
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
                console.error('Failed to delete log:', error)
            }
        }
    }

    if (isLoading) {
        return <TaskProfileSkeleton />
    }

    if (error || !taskData) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="p-8 text-center max-w-md border border-destructive/50 bg-destructive/5">
                    <h2 className="text-2xl font-bold text-foreground mb-2">Task Not Found</h2>
                    <p className="text-muted-foreground mb-6">
                        We couldn't find the task you're looking for.
                    </p>
                    <Button onClick={handleBack}>
                        Back to Dashboard
                    </Button>
                </Card>
            </div>
        )
    }

    return (
        <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="min-h-screen bg-background p-6"
        >
            <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <TaskHeader task={taskData} />

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        <TaskDetailsCard task={taskData} />
                        <ProgressTimelineCard
                            task={taskData}
                            subtasks={subtasks}
                            updatingSubtaskIds={updatingSubtaskIds}
                            onAddSubtask={() => setIsSubtaskModalOpen(true)}
                            onEditSubtask={setEditingSubtask}
                            onDeleteSubtask={setDeletingSubtask}
                            onToggleSubtask={handleSubtaskToggle}
                        />
                        <ProgressLogsCard
                            progressLogs={progressLogs}
                            onAddLog={() => { setEditingLog(null); setIsLogModalOpen(true) }}
                            onEditLog={handleEditLog}
                            onDeleteLog={confirmDeleteLog}
                        />
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        <QuickActionsCard
                            task={taskData}
                            onToggleComplete={handleToggleComplete}
                            onDelete={handleDelete}
                            onEdit={handleEditClick}
                            isCompleting={isCompleting}
                            isDeleting={isDeleting}
                        />
                        <StatisticsCard task={taskData} />
                    </div>
                </div>
            </div>
            <BaseModal
                isOpen={isChangeModalOpen}
                onClose={() => setIsChangeModalOpen(false)}
                title={`Edit Task`}
                size="lg"
            >
                {/* Passing current data to form */}
                <TaskForm
                    onSubmit={handleChange}
                    onCancel={() => setIsChangeModalOpen(false)}
                    initialData={{
                        ...taskData,
                        due_date: taskData.due_date ? new Date(taskData.due_date) : undefined
                    }}
                />
            </BaseModal>

            <BaseModal
                isOpen={isSubtaskModalOpen}
                onClose={() => setIsSubtaskModalOpen(false)}
                title={`Create Subtask`}
                size="lg"
            >
                <SubtaskForm
                    onSubmit={handleSubtaskCreate}
                    onCancel={() => setIsSubtaskModalOpen(false)}
                    parentTaskId={taskData.id}
                />
            </BaseModal>

            {/* Edit Subtask Modal */}
            <BaseModal
                isOpen={!!editingSubtask}
                onClose={() => setEditingSubtask(null)}
                title={`Edit Subtask`}
                size="lg"
            >
                {editingSubtask && (
                    <SubtaskForm
                        onSubmit={handleSubtaskEditSubmit}
                        onCancel={() => setEditingSubtask(null)}
                        parentTaskId={taskData.id}
                        initialData={editingSubtask}
                    />
                )}
            </BaseModal>

            {/* Delete Subtask Confirmation Modal */}
            <BaseModal
                isOpen={!!deletingSubtask}
                onClose={() => !isDeletingSubtask && setDeletingSubtask(null)}
                title="Delete Subtask"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-gray-300">
                        Are you sure you want to delete subtask "{deletingSubtask?.name}"? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setDeletingSubtask(null)}
                            className="hover:bg-white/10"
                            disabled={isDeletingSubtask}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleSubtaskDeleteConfirm}
                            disabled={isDeletingSubtask}
                        >
                            {isDeletingSubtask ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </div>
            </BaseModal>

            {/* Log Modals */}
            <BaseModal
                isOpen={isLogModalOpen}
                onClose={() => { setIsLogModalOpen(false); setEditingLog(null); }}
                title={editingLog ? 'Edit Progress Log' : 'Add Progress Log'}
            >
                <ProgressLogForm
                    goalId={undefined}
                    onSubmit={handleLogSubmit}
                    defaultValues={editingLog || undefined}
                />
            </BaseModal>

            <BaseModal
                isOpen={isDeleteLogModalOpen}
                onClose={() => setIsDeleteLogModalOpen(false)}
                title="Delete Progress Log"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-gray-300">
                        Are you sure you want to delete this progress log? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setIsDeleteLogModalOpen(false)}
                            className="hover:bg-white/10"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteLogConfirm}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </BaseModal>

            {/* Delete Task Confirmation Modal */}
            <BaseModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="Delete Task"
                description="Are you sure you want to delete this task? This action cannot be undone."
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
                        {isDeleting ? 'Deleting...' : 'Delete Task'}
                    </Button>
                </div>
            </BaseModal>
        </motion.main>
    )
}
