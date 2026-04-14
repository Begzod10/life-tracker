'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, Suspense, useCallback, memo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns' // 👈 В начале файла platform/page.tsx
import { BaseModal } from '@/components/modals/base-modal'
import { GoalForm } from '@/components/modals/forms/goal-form'
import { TaskForm } from '@/components/modals/forms/task-form'
import { HabitForm } from '@/components/modals/forms/habit-form'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthCheck } from '@/lib/hooks/use-auth-check'
import { useUser } from '@/lib/hooks/use-auth'
import {
    Target, DollarSign, Heart, Repeat, Book, BarChart3, CheckSquare, Users,
    ArrowLeft, Bell, Search, User, Plus, LayoutGrid, List,
    Loader2, CalendarDays
} from 'lucide-react'
import { useGoalCreate, useGoalsList, useGoalDelete, useGoalUpdate, useDeletedGoalsList, useGoalRestore, useGoalsOverviewStats } from '@/lib/hooks/use-goals'
import { useTaskCreate, useTasksList, useTasksStatsByPerson } from '@/lib/hooks/use-tasks'
import { GoalsView } from '@/components/features/goals/goals-view'
import { TaskList } from '@/components/features/tasks/tasks-view'
import { Goal, GoalOverviewStats } from '@/types'

type TaskStats = {
    total: number
    completed: number
    inProgress: number
    addedThisWeek: number
    completionRate: number
}

type categoryType = {
    id: string,
    title: string,
    icon: any,
    color: string,
    description: string
}

const categories: categoryType[] = [
    {
        id: 'goals',
        title: 'Goals',
        icon: Target,
        color: 'from-blue-500 to-cyan-500',
        description: 'Track your life objectives'
    },
    {
        id: 'tasks',
        title: 'Tasks',
        icon: CheckSquare,
        color: 'from-purple-500 to-pink-500',
        description: 'Manage daily to-dos'
    },
    {
        id: 'timetable',
        title: 'Timetable',
        icon: CalendarDays,
        color: 'from-teal-500 to-cyan-500',
        description: 'Plan your day hour by hour - final'
    },
    {
        id: 'finances',
        title: 'Finances',
        icon: DollarSign,
        color: 'from-green-500 to-emerald-500',
        description: 'Control your money'
    },
    {
        id: 'health',
        title: 'Health',
        icon: Heart,
        color: 'from-red-500 to-orange-500',
        description: 'Monitor fitness'
    },
    {
        id: 'habits',
        title: 'Habits',
        icon: Repeat,
        color: 'from-yellow-500 to-amber-500',
        description: 'Build routines'
    },
    {
        id: 'learning',
        title: 'Learning',
        icon: Book,
        color: 'from-indigo-500 to-blue-500',
        description: 'Expand knowledge'
    },
    {
        id: 'analytics',
        title: 'Analytics',
        icon: BarChart3,
        color: 'from-violet-500 to-purple-500',
        description: 'Visualize progress'
    },
    {
        id: 'social',
        title: 'Social',
        icon: Users,
        color: 'from-pink-500 to-rose-500',
        description: 'Connect with others'
    },
]

export default function PlatformPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        }>
            <PlatformPageContent />
        </Suspense>
    )
}

function PlatformPageContent() {
    const { isAuthenticated, isLoading } = useAuthCheck()
    // const { data: goals } = useGoalsList()

    const router = useRouter()
    const searchParams = useSearchParams()
    const categoryParam = searchParams.get('category')

    const { data: user, isLoading: isUserLoading, error } = useUser()
    const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam)

    // Sync state with URL param
    useEffect(() => {
        if (categoryParam) {
            setSelectedCategory(categoryParam)
        } else {
            setSelectedCategory(null)
        }
    }, [categoryParam])

    const DEDICATED_PAGES = ['timetable', 'finances', 'health']

    // Auto-redirect dedicated categories whenever user loads or selected category changes
    useEffect(() => {
        if (!user?.id) return
        if (selectedCategory && DEDICATED_PAGES.includes(selectedCategory)) {
            router.replace(`/platform/${user.id}/${selectedCategory}`)
        }
    }, [selectedCategory, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    // Update URL when category changes
    const handleSelectCategory = useCallback((id: string | null) => {
        if (!id) {
            setSelectedCategory(null)
            router.push('/platform')
            return
        }

        if (DEDICATED_PAGES.includes(id) && user?.id) {
            router.push(`/platform/${user.id}/${id}`)
            return
        }

        setSelectedCategory(id)
        router.push(`/platform?category=${id}`)
    }, [user?.id, router]) // eslint-disable-line react-hooks/exhaustive-deps

    if (isLoading || isUserLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        )
    }

    if (!isAuthenticated) {
        return null // Редирект произойдет автоматически
    }


    return (
        <div className="bg-[#0a0a0f] relative overflow-hidden">
            <AnimatePresence mode="wait">
                {!selectedCategory || ['timetable', 'finances', 'health'].includes(selectedCategory) ? (
                    <CategoriesGrid
                        key="grid"
                        categories={categories}
                        onSelect={handleSelectCategory}
                    />
                ) : (
                    <CategoryExpanded
                        key="expanded"
                        category={categories.find(c => c.id === selectedCategory)!}
                        onBack={() => handleSelectCategory(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

// Grid View - все категории
function CategoriesGrid({ categories, onSelect }: {
    categories: categoryType[]
    onSelect: (id: string) => void
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center p-8"
        >
            <div className="w-full max-w-6xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {categories.map((category, index) => (
                        <CategoryCard
                            key={category.id}
                            category={category}
                            index={index}
                            onClick={() => onSelect(category.id)}
                        />
                    ))}
                </div>
            </div>
        </motion.div>
    )
}

// Карточка категории
const CategoryCard = memo(function CategoryCard({ category, index, onClick }: {
    category: typeof categories[0]
    index: number
    onClick: () => void
}) {
    const [isHovered, setIsHovered] = useState(false)
    const Icon = category.icon

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: index * 0.05 }}
            layoutId={`category-${category.id}`}
        >
            <Card
                className="relative overflow-hidden bg-[#1a1b26] border-[#2a2b36] hover:border-[#3a3b46] cursor-pointer transition-all duration-300 h-[200px]"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={onClick}
            >
                <div className="relative h-full flex flex-col p-6">
                    {/* Icon */}
                    <motion.div
                        className={`inline-flex self-start p-4 rounded-2xl bg-gradient-to-br ${category.color} mb-auto`}
                        animate={{ scale: isHovered ? 1.1 : 1, y: isHovered ? -5 : 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                        <Icon className="h-8 w-8 text-white" />
                    </motion.div>

                    {/* Title & Description */}
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">
                            {category.title}
                        </h3>
                        <p className="text-sm text-gray-400">
                            {category.description}
                        </p>
                    </div>
                </div>

                {/* Shine effect */}
                <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    initial={{ x: '-100%' }}
                    animate={{ x: isHovered ? '200%' : '-100%' }}
                    transition={{ duration: 0.6 }}
                />
            </Card>
        </motion.div>
    )
})

// Expanded View - когда категория выбрана
function CategoryExpanded({ category, onBack }: {
    category: typeof categories[0]
    onBack: () => void
}) {
    const { data: user, isLoading: isUserLoading, error } = useUser()
    const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('week')
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
    const { data: overviewStats, isLoading: isLoadingOverviewStats } = useGoalsOverviewStats(user?.id ? String(user.id) : '')
    const { data: taskStats, isLoading: isLoadingTaskStats } = useTasksStatsByPerson(category.id === 'tasks' ? user?.id : undefined)

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            // className="min-h-screen"
            layoutId={`category-${category.id}`}
        >
            {/* Header */}
            {/* <Header category={category} onBack={onBack} /> */}

            {/* Main Content */}
            <div className="container mx-auto px-6 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Side - Statistics (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Time Range Selector */}
                        <Card className="bg-[#1a1b26] border-[#2a2b36] p-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-white">Statistics</h2>
                                <div className="flex gap-2">
                                    {(['day', 'week', 'month', 'year', 'all'] as const).map((range) => (
                                        <Button
                                            key={range}
                                            variant={timeRange === range ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setTimeRange(range)}
                                            className="capitalize"
                                        >
                                            {range === 'all' ? 'All Time' : range}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </Card>

                        {/* Stats Cards */}
                        <StatsSection category={category} timeRange={timeRange} overviewStats={overviewStats} isLoading={isLoadingOverviewStats || isLoadingTaskStats} taskStats={taskStats} />

                        {/* Items Section */}
                        <Suspense fallback={<div className="text-gray-400 text-sm">Loading...</div>}>
                            <ItemsSection userId={user?.id} category={category} viewMode={viewMode} setViewMode={setViewMode} />
                        </Suspense>
                    </div>

                    {/* Right Side - Quote & Progress (1/3) */}
                    <div className="space-y-6">
                        <QuoteSection category={category} />
                        <ProgressSection category={category} overviewStats={overviewStats} isLoading={isLoadingOverviewStats || isLoadingTaskStats} taskStats={taskStats} />
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

// Header Component
function Header({ category, onBack }: {
    category: typeof categories[0]
    onBack: () => void
}) {
    const Icon = category.icon

    return (
        <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="sticky top-0 z-50 bg-[#1a1b26]/80 backdrop-blur-xl border-b border-[#2a2b36]"
        >
            <div className="container mx-auto px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                    {/* Left - Back Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onBack}
                        className="gap-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>

                    {/* Center - Search */}
                    <div className="flex-1 max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder={`Search ${category.title.toLowerCase()}...`}
                                className="pl-10 bg-[#0f0f1a] border-[#2a2b36]"
                            />
                        </div>
                    </div>

                    {/* Right - Notifications & Profile */}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                        </Button>
                        <Button variant="ghost" size="icon">
                            <User className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </motion.header>
    )
}

// Stats Section
function StatsSection({ category, timeRange, overviewStats, isLoading, taskStats }: {
    category: typeof categories[0]
    timeRange: string
    overviewStats?: GoalOverviewStats
    isLoading?: boolean
    taskStats?: TaskStats
}) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map(i => (
                    <Card key={i} className="bg-[#1a1b26] border-[#2a2b36] p-6">
                        <Skeleton className="h-4 w-24 mb-3 bg-[#2a2b36]" />
                        <Skeleton className="h-9 w-16 mb-2 bg-[#2a2b36]" />
                        <Skeleton className="h-4 w-32 bg-[#2a2b36]" />
                    </Card>
                ))}
            </div>
        )
    }

    if (category.id === 'tasks') {
        const total = taskStats?.total ?? 0
        const completed = taskStats?.completed ?? 0
        const inProgress = taskStats?.inProgress ?? 0
        const addedThisWeek = taskStats?.addedThisWeek ?? 0
        const completionRate = taskStats?.completionRate ?? 0
        const inProgressPct = total > 0 ? Math.round((inProgress / total) * 100) : 0

        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                    <div className="text-sm text-gray-400 mb-2">Added This Week</div>
                    <div className="text-3xl font-bold text-white mb-1">{addedThisWeek}</div>
                    <div className="text-sm text-gray-400">{total} total tasks</div>
                </Card>

                <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                    <div className="text-sm text-gray-400 mb-2">Completed</div>
                    <div className="text-3xl font-bold text-white mb-1">{completed}</div>
                    <div className="text-sm text-green-400">{completionRate}% completion rate</div>
                </Card>

                <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                    <div className="text-sm text-gray-400 mb-2">In Progress</div>
                    <div className="text-3xl font-bold text-white mb-1">{inProgress}</div>
                    <div className="text-sm text-gray-400">{inProgressPct}% of total</div>
                </Card>
            </div>
        )
    }

    if (category.id !== 'goals') {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                    <div className="text-sm text-gray-400 mb-2">Coming Soon</div>
                    <div className="text-3xl font-bold text-white mb-1">—</div>
                    <div className="text-sm text-gray-400">Stats not yet available</div>
                </Card>
                <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                    <div className="text-sm text-gray-400 mb-2">Coming Soon</div>
                    <div className="text-3xl font-bold text-white mb-1">—</div>
                    <div className="text-sm text-gray-400">Stats not yet available</div>
                </Card>
                <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                    <div className="text-sm text-gray-400 mb-2">Coming Soon</div>
                    <div className="text-3xl font-bold text-white mb-1">—</div>
                    <div className="text-sm text-gray-400">Stats not yet available</div>
                </Card>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                <div className="text-sm text-gray-400 mb-2">Total Goals</div>
                <div className="text-3xl font-bold text-white mb-1">{overviewStats?.total_goals || 0}</div>
                <div className="text-sm text-gray-400">Target for this year</div>
            </Card>

            <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                <div className="text-sm text-gray-400 mb-2">Completed</div>
                <div className="text-3xl font-bold text-white mb-1">{overviewStats?.by_status?.completed || 0}</div>
                <div className="text-sm text-green-400">
                    {overviewStats?.total_goals ? Math.round((overviewStats.by_status.completed / overviewStats.total_goals) * 100) : 0}% completion rate
                </div>
            </Card>

            <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                <div className="text-sm text-gray-400 mb-2">In Progress</div>
                <div className="text-3xl font-bold text-white mb-1">{overviewStats?.by_status?.active || 0}</div>
                <div className="text-sm text-gray-400">
                    {overviewStats?.total_goals ? Math.round((overviewStats.by_status.active / overviewStats.total_goals) * 100) : 0}% of total
                </div>
            </Card>
        </div>
    )
}

// Items Section (Cards or Table)
function ItemsSection({ category, viewMode, setViewMode, userId }: {
    category: typeof categories[0]
    viewMode: 'cards' | 'table'
    setViewMode: (mode: 'cards' | 'table') => void,
    userId?: number | string
}) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // API Filters
    const statusFilter = searchParams.get('status')
    const categoryFilter = searchParams.get('goal_category')

    // State for view type
    const [isDeletedView, setIsDeletedView] = useState(false)

    // Active goals query
    const { data: activeGoals, isLoading: isLoadingActive } = useGoalsList(userId, {
        status_filter: statusFilter || undefined,
        category_filter: categoryFilter || undefined,
    })

    const { data: overviewStats, isLoading: isLoadingOverviewStats } = useGoalsOverviewStats(userId as string)


    // Deleted goals query
    const { data: deletedGoals, isLoading: isLoadingDeleted } = useDeletedGoalsList(userId as string)

    const goals = isDeletedView ? deletedGoals : activeGoals
    const isLoadingGoal = isDeletedView ? isLoadingDeleted : isLoadingActive

    const createGoal = useGoalCreate()
    const createTask = useTaskCreate()
    const updateGoal = useGoalUpdate()
    const deleteGoal = useGoalDelete()


    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [goalToDelete, setGoalToDelete] = useState<number | string | null>(null)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [goalToEdit, setGoalToEdit] = useState<Goal | null>(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    const handleCreate = async (data: any) => {
        // TODO: Интеграция с API

        switch (category.id) {
            case 'goals':
                createGoal.mutate(
                    {
                        ...data,
                        person_id: userId
                    }
                )
                break
            // return <GoalForm onSubmit={handleCreate} onCancel={() => setIsCreateModalOpen(false)} />
            case 'tasks':
                createTask.mutate(
                    {
                        ...data,
                        // goal_id: 6
                    }
                )
                break
            // return <TaskForm onSubmit={handleCreate} onCancel={() => setIsCreateModalOpen(false)} />
            case 'habits':
                break
            // return <HabitForm onSubmit={handleCreate} onCancel={() => setIsCreateModalOpen(false)} />
            default:
                break
            // return <GoalForm onSubmit={handleCreate} onCancel={() => setIsCreateModalOpen(false)} />

            // await new Promise(resolve => setTimeout(resolve, 1000)) // Имитация API
        }
        setIsCreateModalOpen(false)
    }

    const handleDeleteClick = (id: number | string) => {
        setGoalToDelete(id)
        setIsDeleteModalOpen(true)
    }

    const confirmDelete = () => {
        if (goalToDelete) {
            deleteGoal.mutate(goalToDelete)
            setIsDeleteModalOpen(false)
            setGoalToDelete(null)
        }
    }

    const restoreGoal = useGoalRestore()

    const handleRestore = (goalId: number | string) => {
        restoreGoal.mutate(goalId)
    }

    const handleEditClick = (goal: Goal) => {
        setGoalToEdit(goal)
        setIsEditModalOpen(true)
    }

    const handleUpdate = async (data: any) => {
        if (goalToEdit) {
            const apiData = {
                ...data,
                color_code: data.colorCode,
                start_date: data.start_date instanceof Date ? format(data.start_date, 'yyyy-MM-dd') : data.start_date,
                target_date: data.target_date instanceof Date ? format(data.target_date, 'yyyy-MM-dd') : data.target_date,
            }
            if (apiData.colorCode) delete apiData.colorCode

            await updateGoal.mutateAsync({ id: goalToEdit.id, data: apiData })
            setIsEditModalOpen(false)
            setGoalToEdit(null)
        }
    }

    // Определяем какую форму показать
    const getFormComponent = () => {
        switch (category.id) {
            case 'goals':
                return <GoalForm onSubmit={handleCreate} onCancel={() => setIsCreateModalOpen(false)} />
            case 'tasks':
                return <TaskForm onSubmit={handleCreate} onCancel={() => setIsCreateModalOpen(false)} />
            case 'habits':
                return <HabitForm onSubmit={handleCreate} onCancel={() => setIsCreateModalOpen(false)} />
            default:
                return <GoalForm onSubmit={handleCreate} onCancel={() => setIsCreateModalOpen(false)} />
        }
    }

    return (
        <>
            <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-white">Your {category.title}</h2>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-[#0f0f1a] rounded-lg p-1 border border-[#2a2b36]">
                            <button
                                onClick={() => setIsDeletedView(false)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!isDeletedView
                                    ? 'bg-[#2a2b36] text-white shadow-sm'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Active
                            </button>
                            <button
                                onClick={() => setIsDeletedView(true)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${isDeletedView
                                    ? 'bg-[#2a2b36] text-white shadow-sm'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Deleted
                            </button>
                        </div>
                        <Button
                            variant={viewMode === 'cards' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewMode('cards')}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'table' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewMode('table')}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                        <Button
                            size="sm"
                            className="gap-2"
                            onClick={() => setIsCreateModalOpen(true)}
                        >
                            <Plus className="h-4 w-4" />
                            Add New
                        </Button>
                    </div>
                </div>

                {/* Placeholder content */}
                {
                    category.id === 'goals' ? (
                        <GoalsView
                            goals={goals || []}
                            viewMode={viewMode}
                            onEdit={handleEditClick}
                            onDelete={handleDeleteClick}
                            onRestore={handleRestore}
                            isLoading={isLoadingGoal}
                            isDeletedView={isDeletedView}
                        />
                    )
                        : category.id === 'tasks' ? (
                            <TaskList userId={userId} />
                        ) : (
                            // Оставь старый код для других категорий
                            viewMode === 'cards' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <Card
                                            key={i}
                                            className="bg-[#0f0f1a] border-[#2a2b36] p-4"
                                            onClick={() => router.push(`/platform/${i}/${category.id}`)}
                                        >
                                            <div className="h-24 flex items-center justify-center text-gray-500">
                                                Item {i} - Cards View
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="border border-[#2a2b36] rounded-lg overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-[#0f0f1a]">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-sm text-gray-400">Name</th>
                                                <th className="px-4 py-3 text-left text-sm text-gray-400">Status</th>
                                                <th className="px-4 py-3 text-left text-sm text-gray-400">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[1, 2, 3, 4].map((i) => (
                                                <tr
                                                    key={i}
                                                    className="border-t border-[#2a2b36]"
                                                    onClick={() => router.push(`/platform/${i}/${category.id}`)}
                                                >
                                                    <td className="px-4 py-3 text-sm text-white">Item {i}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-400">Active</td>
                                                    <td className="px-4 py-3 text-sm text-gray-400">Today</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )
                }
            </Card >

            {/* Modal */}
            < BaseModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)
                }
                title={`Create New ${category.title.slice(0, -1)}`}
                description={`Add a new ${category.title.toLowerCase().slice(0, -1)} to track your progress`}
                size="lg"
            >
                {getFormComponent()}
            </BaseModal >
            {isDeleteModalOpen && (
                <BaseModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    title="Delete Goal"
                    description="Are you sure you want to delete this goal? This action cannot be undone."
                    size="sm"
                >
                    <div className="flex justify-end gap-3 mt-4">
                        <Button
                            variant="ghost"
                            onClick={() => setIsDeleteModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                        >
                            Delete
                        </Button>
                    </div>
                </BaseModal>
            )}

            {
                isEditModalOpen && goalToEdit && (
                    <BaseModal
                        isOpen={isEditModalOpen}
                        onClose={() => setIsEditModalOpen(false)}
                        title="Edit Goal"
                        size="lg"
                    >
                        <GoalForm
                            initialData={{
                                ...goalToEdit,
                                start_date: goalToEdit.start_date ? new Date(goalToEdit.start_date) : undefined,
                                target_date: goalToEdit.target_date ? new Date(goalToEdit.target_date) : undefined,
                                color_code: goalToEdit.color_code || '#3b82f6'
                            } as any}
                            onSubmit={handleUpdate}
                            onCancel={() => setIsEditModalOpen(false)}
                        />
                    </BaseModal>
                )
            }
        </>
    )
}


// Quote Section
function QuoteSection({ category }: { category: typeof categories[0] }) {
    return (
        <Card className="bg-gradient-to-br from-[#1a1b26] to-[#0f0f1a] border-[#2a2b36] p-6">
            <div className="text-sm text-gray-400 mb-3">Quote of the Day</div>
            <blockquote className="text-white italic mb-4">
                "Success is not final, failure is not fatal: it is the courage to continue that counts."
            </blockquote>
            <div className="text-sm text-gray-500">— Winston Churchill</div>
        </Card>
    )
}

// Progress Section
function ProgressSection({ category, overviewStats, isLoading, taskStats }: {
    category: typeof categories[0]
    overviewStats?: GoalOverviewStats
    isLoading?: boolean
    taskStats?: TaskStats
}) {
    const completionPercentage = category.id === 'goals'
        ? Math.round(overviewStats?.average_completion || 0)
        : category.id === 'tasks'
        ? (taskStats?.completionRate ?? 0)
        : 0

    if (isLoading) {
        return (
            <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
                <Skeleton className="h-4 w-32 mb-4 bg-[#2a2b36]" />
                <div className="flex justify-center mb-4">
                    <Skeleton className="h-32 w-32 rounded-full bg-[#2a2b36]" />
                </div>
                <Skeleton className="h-4 w-full mb-2 bg-[#2a2b36]" />
                <Skeleton className="h-4 w-3/4 bg-[#2a2b36]" />
            </Card>
        )
    }

    return (
        <Card className="bg-[#1a1b26] border-[#2a2b36] p-6">
            <div className="text-sm text-gray-400 mb-4">Overall Progress</div>

            <div className="space-y-4">
                {/* Progress Ring */}
                <div className="flex items-center justify-center">
                    <div className="relative w-32 h-32">
                        <svg className="w-full h-full -rotate-90">
                            <circle
                                cx="64"
                                cy="64"
                                r="56"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="8"
                                className="text-white/10"
                            />
                            <motion.circle
                                cx="64"
                                cy="64"
                                r="56"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="8"
                                strokeLinecap="round"
                                className={`text-gradient-to-r ${category.color}`}
                                strokeDasharray={`${2 * Math.PI * 56}`}
                                initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
                                animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - completionPercentage / 100) }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-white">{completionPercentage}%</div>
                                <div className="text-xs text-gray-400">Complete</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Change Indicator */}
                <div className="text-center">
                    <div className="text-sm text-green-400 font-semibold">
                        {category.id === 'goals'
                            ? 'Average across all goals'
                            : category.id === 'tasks'
                            ? `${taskStats?.completed ?? 0} of ${taskStats?.total ?? 0} completed`
                            : '—'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Keep up the great work!</div>
                </div>
            </div>
        </Card>
    )
}