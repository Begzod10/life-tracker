'use client'

import React from "react"

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    CheckSquare,
    Calendar,
    Clock,
    Flag,
    Search,
    LayoutGrid,
    List,
    Filter,
    Square,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTasksList } from "@/lib/hooks/use-tasks"

interface Task {
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

interface TaskListProps {
    // tasks: Task[]
    isLoading?: boolean
    onTaskComplete?: (taskId: number, completed: boolean) => void
}

const priorityConfig = {
    high: {
        gradient: 'from-red-500 to-orange-500',
        bg: 'bg-red-500/20',
        text: 'text-red-400',
    },
    medium: {
        gradient: 'from-yellow-500 to-amber-500',
        bg: 'bg-yellow-500/20',
        text: 'text-yellow-400',
    },
    low: {
        gradient: 'from-green-500 to-emerald-500',
        bg: 'bg-green-500/20',
        text: 'text-green-400',
    },
}

const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
        return 'Today'
    }
    if (date.toDateString() === tomorrow.toDateString()) {
        return 'Tomorrow'
    }
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    })
}

const TaskSkeleton = () => (
    <div className="space-y-6">
        <div className="space-y-4">
            <div className="h-8 w-24 animate-pulse bg-muted rounded-lg" />
            <div className="h-10 w-full animate-pulse bg-muted rounded-lg" />
            <div className="flex gap-2 flex-wrap">
                <div className="h-9 w-32 animate-pulse bg-muted rounded-lg" />
                <div className="h-9 w-32 animate-pulse bg-muted rounded-lg" />
                <div className="h-9 w-32 animate-pulse bg-muted rounded-lg" />
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse bg-muted rounded-lg h-48" />
            ))}
        </div>
    </div>
)

function TaskCard({
    task,
    isGridView,
    onTaskComplete,
}: {
    task: Task
    isGridView: boolean
    onTaskComplete?: (taskId: number, completed: boolean) => void
}) {
    const router = useRouter()
    const config = priorityConfig[task.priority]

    const handleClick = () => {
        router.push(`/platform/task/${task.id}`)
    }

    const handleComplete = (e: React.MouseEvent) => {
        e.stopPropagation()
        onTaskComplete?.(task.id, !task.completed)
    }

    if (!isGridView) {
        // List view
        return (
            <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                whileHover={{ x: 4 }}
                onClick={handleClick}
                className="group p-4 rounded-lg border border-[oklch(0.25_0.02_240)] bg-[oklch(0.18_0.02_240)] hover:bg-[oklch(0.20_0.02_240)] cursor-pointer transition-all duration-300"
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleComplete}
                        className="flex-shrink-0 p-2 rounded-md hover:bg-[oklch(0.25_0.02_240)] transition-colors"
                    >
                        {task.completed ? (
                            <CheckSquare className="w-5 h-5 text-[oklch(0.65_0.25_250)]" />
                        ) : (
                            <Square className="w-5 h-5 text-[oklch(0.35_0.02_240)]" />
                        )}
                    </button>

                    <div className="flex-1 min-w-0">
                        <h3
                            className={`text-sm font-semibold truncate transition-all ${task.completed
                                ? 'text-[oklch(0.4_0.02_240)] line-through'
                                : 'text-foreground'
                                }`}
                        >
                            {task.name}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {task.description}
                        </p>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2">
                        <Badge
                            className={`text-xs whitespace-nowrap bg-gradient-to-r ${config.gradient}`}
                        >
                            {task.priority}
                        </Badge>
                        {task.estimated_duration > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{task.estimated_duration}m</span>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        )
    }

    // Grid view
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            whileHover={{ scale: 1.02, translateY: -4 }}
            onClick={handleClick}
            className="group p-5 rounded-lg border border-[oklch(0.25_0.02_240)] bg-[oklch(0.18_0.02_240)] hover:border-[oklch(0.35_0.02_240)] cursor-pointer transition-all duration-300 flex flex-col h-full"
        >
            {/* Header with checkbox and type */}
            <div className="flex items-start justify-between mb-3">
                <button
                    onClick={handleComplete}
                    className="flex-shrink-0 p-1.5 rounded-md hover:bg-[oklch(0.25_0.02_240)] transition-colors"
                >
                    {task.completed ? (
                        <CheckSquare className="w-5 h-5 text-[oklch(0.65_0.25_250)]" />
                    ) : (
                        <Square className="w-5 h-5 text-[oklch(0.35_0.02_240)]" />
                    )}
                </button>

                <Badge
                    variant="outline"
                    className="text-xs capitalize border-[oklch(0.25_0.02_240)]"
                >
                    {task.task_type}
                </Badge>
            </div>

            {/* Task name and description */}
            <div className="flex-1 mb-4">
                <h3
                    className={`font-bold text-base mb-2 line-clamp-2 transition-all ${task.completed
                        ? 'text-[oklch(0.4_0.02_240)] line-through'
                        : 'text-foreground'
                        }`}
                >
                    {task.name}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                    {task.description}
                </p>
            </div>

            {/* Priority badge */}
            <div className="mb-4">
                <Badge className={`text-xs bg-gradient-to-r ${config.gradient}`}>
                    {task.priority} priority
                </Badge>
            </div>

            {/* Footer with date and duration */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-[oklch(0.25_0.02_240)]">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{formatDate(task.due_date)}</span>
                </div>

                {task.estimated_duration > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>{task.estimated_duration}m</span>
                    </div>
                )}
            </div>
        </motion.div>
    )
}

export function TaskList({
    tasks: propTasks,
    isLoading = false,
    onTaskComplete,
    userId
}: {
    tasks?: Task[]
    isLoading?: boolean
    onTaskComplete?: (taskId: number, completed: boolean) => void
    userId?: number | string
}) {
    const { data: fetchedTasks, isLoading: isLoadingTask } = useTasksList({ person_id: userId })
    const tasks = propTasks || fetchedTasks
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [searchQuery, setSearchQuery] = useState('')
    const [priorityFilter, setPriorityFilter] = useState<string>('all')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [completedFilter, setCompletedFilter] = useState<string>('all')
    const [sortBy, setSortBy] = useState<string>('due_date')

    // Filter and sort tasks
    const filteredAndSortedTasks = useMemo(() => {
        let result = tasks?.filter((task: Task) => {
            const matchesSearch = task.name
                .toLowerCase()
                .includes(searchQuery.toLowerCase())

            const matchesPriority =
                priorityFilter === 'all' || task.priority === priorityFilter

            const matchesType =
                typeFilter === 'all' || task.task_type === typeFilter

            const matchesCompleted =
                completedFilter === 'all' ||
                (completedFilter === 'completed' && task.completed) ||
                (completedFilter === 'pending' && !task.completed)

            return matchesSearch && matchesPriority && matchesType && matchesCompleted
        })

        // Sort
        result?.sort((a: Task, b: Task) => {
            switch (sortBy) {
                case 'due_date':
                    return (
                        new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
                    )
                case 'priority':
                    const priorityOrder = { high: 0, medium: 1, low: 2 }
                    return priorityOrder[a.priority] - priorityOrder[b.priority]
                case 'created_at':
                    return (
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    )
                default:
                    return 0
            }
        })

        return result
    }, [tasks, searchQuery, priorityFilter, typeFilter, completedFilter, sortBy])

    const hasFiltersActive =
        searchQuery ||
        priorityFilter !== 'all' ||
        typeFilter !== 'all' ||
        completedFilter !== 'all'

    if (isLoading) {
        return <TaskSkeleton />
    }

    return (
        <div className="w-full space-y-6">
            {/* Header */}
            <div className="space-y-4">
                <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-[oklch(0.18_0.02_240)] border-[oklch(0.25_0.02_240)] text-foreground placeholder:text-muted-foreground"
                    />
                </div>

                {/* Filters and View Toggle */}
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Select value={`${priorityFilter}|${completedFilter}`} onValueChange={(value) => {
                            const [p, c] = value.split('|')
                            setPriorityFilter(p)
                            setCompletedFilter(c)
                        }}>
                            <SelectTrigger className="w-36 h-9 text-sm bg-[oklch(0.18_0.02_240)] border-[oklch(0.25_0.02_240)]">
                                <SelectValue placeholder="Filter tasks" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all|all">All tasks</SelectItem>
                                <SelectItem value="high|all">High priority</SelectItem>
                                <SelectItem value="medium|all">Medium priority</SelectItem>
                                <SelectItem value="low|all">Low priority</SelectItem>
                                <SelectItem value="all|completed">Completed</SelectItem>
                                <SelectItem value="all|pending">Incomplete</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-32 h-9 text-sm bg-[oklch(0.18_0.02_240)] border-[oklch(0.25_0.02_240)]">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2">
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-32 h-9 text-sm bg-[oklch(0.18_0.02_240)] border-[oklch(0.25_0.02_240)]">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="due_date">Due date</SelectItem>
                                <SelectItem value="priority">Priority</SelectItem>
                                <SelectItem value="created_at">Newest</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex gap-1 p-1 rounded-md border border-[oklch(0.25_0.02_240)] bg-[oklch(0.18_0.02_240)]">
                            <Button
                                size="sm"
                                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                className="h-8 w-8 p-0"
                                onClick={() => setViewMode('grid')}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                size="sm"
                                variant={viewMode === 'list' ? 'default' : 'ghost'}
                                className="h-8 w-8 p-0"
                                onClick={() => setViewMode('list')}
                            >
                                <List className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Task Display Area */}
            <div>
                {filteredAndSortedTasks?.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-12"
                    >
                        <CheckSquare className="h-16 w-16 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold text-foreground">
                            {hasFiltersActive ? 'No tasks match' : 'No tasks yet'}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2">
                            {hasFiltersActive
                                ? 'Try adjusting your filters'
                                : 'Create your first task to get started'}
                        </p>
                    </motion.div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {viewMode === 'grid' ? (
                            <motion.div
                                layout
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                            >
                                {filteredAndSortedTasks?.map((task: Task) => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        isGridView={true}
                                        onTaskComplete={onTaskComplete}
                                    />
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div layout className="space-y-3">
                                {filteredAndSortedTasks?.map((task: Task) => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        isGridView={false}
                                        onTaskComplete={onTaskComplete}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>

            {/* Stats footer */}
            {filteredAndSortedTasks?.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-4 pt-4 border-t border-[oklch(0.25_0.02_240)] text-sm text-muted-foreground"
                >
                    <span>
                        {filteredAndSortedTasks?.filter((t: Task) => !t.completed).length} pending
                    </span>
                    <span>•</span>
                    <span>
                        {filteredAndSortedTasks?.filter((t: Task) => t.completed).length} completed
                    </span>
                    <span>•</span>
                    <span>{filteredAndSortedTasks?.length} total</span>
                </motion.div>
            )}
        </div>
    )
}
