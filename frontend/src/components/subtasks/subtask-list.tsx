'use client'

import { format } from 'date-fns'
import { Pencil, Trash2, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function SubtaskList({
    subtasks,
    updatingSubtaskIds = new Set(),
    onEdit,
    onDelete,
    onToggle,
}: {
    subtasks: any[]
    updatingSubtaskIds?: Set<string | number>
    onEdit: (subtask: any) => void
    onDelete: (subtask: any) => void
    onToggle: (subtask: any) => void
}) {
    if (!subtasks?.length) {
        return (
            <div className="text-center py-8 text-gray-500">
                No subtasks yet. Click "Add Subtask" to get started.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {subtasks.map((subtask) => {
                const isUpdating = updatingSubtaskIds.has(subtask.id)

                return (
                    <div
                        key={subtask.id}
                        className="group bg-[#1a1b26] border border-[#2a2b36] rounded-lg p-4 transition-all hover:border-[#3b82f6]/50"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex gap-3 flex-1">
                                <button
                                    onClick={() => !isUpdating && onToggle(subtask)}
                                    disabled={isUpdating}
                                    className={cn(
                                        "mt-1 transition-colors",
                                        isUpdating ? "cursor-wait opacity-50" : "",
                                        subtask.completed ? "text-[#3b82f6]" : "text-gray-500 hover:text-[#3b82f6]"
                                    )}
                                >
                                    {isUpdating ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : subtask.completed ? (
                                        <CheckCircle2 className="w-5 h-5" />
                                    ) : (
                                        <Circle className="w-5 h-5" />
                                    )}
                                </button>

                                <div className="flex-1 space-y-1">
                                    <h3 className={cn(
                                        "font-medium transition-all",
                                        subtask.completed ? "text-gray-500 line-through" : "text-white"
                                    )}>
                                        {subtask.name}
                                    </h3>

                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                        <span>
                                            Created: {format(new Date(subtask.created_at || new Date()), 'MMM d, yyyy')}
                                        </span>
                                        {subtask.completed_at ? (
                                            <span className="text-[#3b82f6]">
                                                Completed: {format(new Date(subtask.completed_at), 'MMM d, yyyy')}
                                            </span>
                                        ) : (
                                            <span className={cn(
                                                "flex items-center gap-1",
                                                subtask.due_date && new Date(subtask.due_date) < new Date() ? "text-red-400" : "text-gray-400"
                                            )}>
                                                {subtask.due_date ? `Due: ${format(new Date(subtask.due_date), 'MMM d, yyyy')}` : 'In Progress'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onEdit(subtask)}
                                    className="h-8 w-8 text-gray-500 hover:text-white hover:bg-white/10"
                                >
                                    <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onDelete(subtask)}
                                    className="h-8 w-8 text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
