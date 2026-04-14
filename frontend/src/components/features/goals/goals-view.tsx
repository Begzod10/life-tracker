'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Edit, Trash2, Calendar, Target as TargetIcon, TrendingUp, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

import { Goal } from '@/types'

type GoalsViewProps = {
    goals: Goal[]
    viewMode: 'cards' | 'table'
    onEdit?: (goal: Goal) => void
    onDelete?: (goalId: number | string) => void
    onRestore?: (goalId: number | string) => void
    isLoading?: boolean
    isDeletedView?: boolean
}

// Цвета для категорий
const categoryColors: Record<string, string> = {
    personal: 'from-blue-500 to-cyan-500',
    health: 'from-red-500 to-orange-500',
    career: 'from-purple-500 to-pink-500',
    finance: 'from-green-500 to-emerald-500',
    learning: 'from-indigo-500 to-blue-500',
}

// Цвета для приоритета
const priorityColors: Record<string, { bg: string; text: string }> = {
    low: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
    medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    high: { bg: 'bg-red-500/20', text: 'text-red-400' },
}

export function GoalsView({
    goals,
    viewMode,
    onEdit,
    onDelete,
    onRestore,
    isLoading,
    isDeletedView = false
}: GoalsViewProps) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-gray-400">Loading goals...</div>
            </div>
        )
    }

    if (!goals || goals.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <TargetIcon className="h-12 w-12 mb-4 opacity-50" />
                <p>No goals yet. Create your first goal!</p>
            </div>
        )
    }

    return viewMode === 'cards' ? (
        <CardsView
            goals={goals}
            onEdit={onEdit}
            onDelete={onDelete}
            onRestore={onRestore}
            isDeletedView={isDeletedView}
        />
    ) : (
        <TableView
            goals={goals}
            onEdit={onEdit}
            onDelete={onDelete}
            onRestore={onRestore}
            isDeletedView={isDeletedView}
        />
    )
}

// Карточный вид
function CardsView({
    goals,
    onEdit,
    onDelete,
    onRestore,
    isDeletedView
}: Omit<GoalsViewProps, 'viewMode' | 'isLoading'>) {
    console.log(goals, "goals");

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goals.map((goal, index) => (
                <GoalCard
                    key={goal.id}
                    goal={goal}
                    index={index}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onRestore={onRestore}
                    isDeletedView={isDeletedView}
                />
            ))}
        </div>
    )
}

// Отдельная карточка цели
function GoalCard({
    goal,
    index,
    onEdit,
    onDelete,
    onRestore,
    isDeletedView
}: {
    goal: Goal
    index: number
    onEdit?: (goal: Goal) => void
    onDelete?: (goalId: number | string) => void
    onRestore?: (goalId: number | string) => void
    isDeletedView?: boolean
}) {
    const router = useRouter()
    const [isHovered, setIsHovered] = useState(false)
    const categoryGradient = categoryColors[goal.category] || categoryColors.personal
    const priorityStyle = priorityColors[goal.priority]

    // Вычисляем процент выполнения
    const percentage = goal.progress_percentage ?? (goal.target_value
        ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
        : 0)

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
        >
            <Card
                className="relative overflow-hidden bg-[#0f0f1a] border-[#2a2b36] hover:border-[#3a3b46] transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={() => router.push(`/platform/goal/${goal.id}`)}
            >
                {/* Градиентная полоска сверху */}
                <div className={`h-1 bg-gradient-to-r ${categoryGradient}`} />

                <div className="p-5">
                    {/* Заголовок с действиями */}
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 mr-2">
                            <h3 className="text-lg font-semibold text-white mb-1 line-clamp-1">
                                {goal.name}
                            </h3>
                            <p className="text-sm text-gray-400 line-clamp-2">
                                {goal.description}
                            </p>
                        </div>

                        {/* Кнопки действий */}
                        <div className={`flex gap-1 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                            {isDeletedView ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-green-400 hover:text-green-300 hover:bg-green-400/10 h-8 gap-1 px-2"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRestore?.(goal.id)
                                    }}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Restore
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-gray-400 hover:text-blue-400"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onEdit?.(goal)
                                        }}
                                    >
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-gray-400 hover:text-red-400"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onDelete?.(goal.id)
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Информация */}
                    <div className="space-y-3">
                        {/* Прогресс */}
                        {goal.target_value && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-gray-400">Progress</span>
                                    <span className="text-xs font-semibold text-white">{percentage}%</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className={`h-full bg-gradient-to-r ${categoryGradient}`}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${percentage}%` }}
                                        transition={{ duration: 0.5, delay: index * 0.05 }}
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-xs text-gray-500">
                                        {goal.current_value} / {goal.target_value}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Даты и приоритет */}
                        <div className="flex items-center justify-between text-xs">
                            {/* Дата окончания */}
                            {goal.target_date && (
                                <div className="flex items-center gap-1 text-gray-400">
                                    <Calendar className="h-3 w-3" />
                                    <span>{format(new Date(goal.target_date), 'MMM dd, yyyy')}</span>
                                </div>
                            )}

                            {/* Приоритет */}
                            <div className={`px-2 py-1 rounded-md ${priorityStyle.bg} ${priorityStyle.text} text-xs font-medium capitalize`}>
                                {goal.priority}
                            </div>
                        </div>

                        {/* Категория */}
                        <div className="pt-2 border-t border-white/5">
                            <span className="text-xs text-gray-500 capitalize">
                                {goal.category}
                            </span>
                        </div>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

// Табличный вид
function TableView({
    goals,
    onEdit,
    onDelete,
    onRestore,
    isDeletedView
}: Omit<GoalsViewProps, 'viewMode' | 'isLoading'>) {
    return (
        <div className="border border-[#2a2b36] rounded-lg overflow-hidden">
            <table className="w-full">
                <thead className="bg-[#0f0f1a]">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Progress</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Priority</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Target Date</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {goals.map((goal) => (
                        <TableRow
                            key={goal.id}
                            goal={goal}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onRestore={onRestore}
                            isDeletedView={isDeletedView}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// Строка таблицы
function TableRow({
    goal,
    onEdit,
    onDelete,
    onRestore,
    isDeletedView
}: {
    goal: Goal
    onEdit?: (goal: Goal) => void
    onDelete?: (goalId: number | string) => void
    onRestore?: (goalId: number | string) => void
    isDeletedView?: boolean
}) {
    const router = useRouter()
    const [isHovered, setIsHovered] = useState(false)
    const categoryGradient = categoryColors[goal.category] || categoryColors.personal
    const priorityStyle = priorityColors[goal.priority]

    const percentage = goal.progress_percentage ?? (goal.target_value
        ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
        : 0)

    return (
        <tr
            className="border-t border-[#2a2b36] hover:bg-white/5 transition-colors cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => router.push(`/platform/goal/${goal.id}`)}
        >
            {/* Название */}
            <td className="px-4 py-3">
                <div>
                    <div className="text-sm font-medium text-white">{goal.name}</div>
                    <div className="text-xs text-gray-400 line-clamp-1">{goal.description}</div>
                </div>
            </td>

            {/* Категория */}
            <td className="px-4 py-3">
                <span className="text-sm text-gray-300 capitalize">{goal.category}</span>
            </td>

            {/* Прогресс */}
            <td className="px-4 py-3">
                {goal.target_value ? (
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden max-w-[100px]">
                            <div
                                className={`h-full bg-gradient-to-r ${categoryGradient}`}
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                        <span className="text-xs text-white font-medium min-w-[40px]">{percentage}%</span>
                    </div>
                ) : (
                    <span className="text-xs text-gray-500">—</span>
                )}
            </td>

            {/* Приоритет */}
            <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-md ${priorityStyle.bg} ${priorityStyle.text} text-xs font-medium capitalize`}>
                    {goal.priority}
                </span>
            </td>

            {/* Дата */}
            <td className="px-4 py-3">
                {goal.target_date ? (
                    <div className="flex items-center gap-1 text-sm text-gray-400">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(goal.target_date), 'MMM dd, yyyy')}
                    </div>
                ) : (
                    <span className="text-xs text-gray-500">—</span>
                )}
            </td>

            {/* Действия */}
            <td className="px-4 py-3">
                <div className={`flex items-center justify-end gap-1 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                    {isDeletedView ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-400 hover:text-green-300 hover:bg-green-400/10 h-8 gap-1 px-2"
                            onClick={(e) => {
                                e.stopPropagation()
                                onRestore?.(goal.id)
                            }}
                        >
                            <RotateCcw className="h-4 w-4" />
                            Restore
                        </Button>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-blue-400"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onEdit?.(goal)
                                }}
                            >
                                <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-red-400"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDelete?.(goal.id)
                                }}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </>
                    )}
                </div>
            </td>
        </tr>
    )
}