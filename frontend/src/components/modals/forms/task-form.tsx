'use client'

import { useState } from 'react'
import {
    FormField,
    TextInput,
    TextareaInput,
    SelectInput,
    DatePicker,
    SubmitButton,
    CancelButton
} from '../form-components'
import { useGoalsList, useGoal } from '@/lib/hooks/use-goals'
import { useSubtasks, useSubtaskCreate, useSubtaskUpdate, useSubtaskDelete } from '@/lib/hooks/use-tasks'
import { Check, Trash2, Plus } from 'lucide-react'

interface TaskFormData {
    name: string
    description: string
    priority: string
    task_type: string
    due_date?: Date
    estimated_duration: number
    goal_id?: number | string
    value?: number
    is_recurring?: boolean
}

interface TaskFormProps {
    onSubmit: any
    onCancel: () => void
    initialData?: Partial<TaskFormData> & { id?: number }
}

import { useUser } from '@/lib/hooks/use-auth'

export function TaskForm({ onSubmit, onCancel, initialData }: TaskFormProps) {
    const { data: user } = useUser()
    const { data: goals = [] } = useGoalsList(user?.id)
    const [isLoading, setIsLoading] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [newSubtaskName, setNewSubtaskName] = useState('')

    const taskId = (initialData as any)?.id
    const { data: subtasks = [] } = useSubtasks(taskId ?? 0)
    const createSubtask = useSubtaskCreate()
    const updateSubtask = useSubtaskUpdate()
    const deleteSubtask = useSubtaskDelete()

    const [formData, setFormData] = useState<TaskFormData>({
        name: initialData?.name || '',
        description: initialData?.description || '',
        task_type: initialData?.task_type || 'daily',
        priority: initialData?.priority || 'medium',
        due_date: initialData?.due_date,
        estimated_duration: initialData?.estimated_duration || 30,
        goal_id: initialData?.goal_id,
        value: initialData?.value || 0,
        is_recurring: (initialData as any)?.is_recurring ?? false,
    })

    const { data: selectedGoal, isLoading: isLoadingGoal } = useGoal(formData.goal_id)

    const updateField = (field: keyof TaskFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }))
        }
    }

    const validate = () => {
        const newErrors: Record<string, string> = {}

        if (!formData.name.trim()) {
            newErrors.name = 'Task name is required'
        }

        if (formData.goal_id && formData.value) {
            // Use the fetched goal data
            if (selectedGoal?.target_value && formData.value > selectedGoal.target_value) {
                newErrors.value = `Value cannot exceed goal target (${selectedGoal.target_value})`
            }
            if (formData.value < 0) {
                newErrors.value = 'Value cannot be negative'
            }
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!validate()) return

        setIsLoading(true)
        try {
            await onSubmit(formData)
        } finally {
            setIsLoading(false)
        }
    }

    const goalOptions = goals.map((goal: any) => ({
        value: goal.id,
        label: goal.name
    }))

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <FormField label="Task Name" error={errors.name} required>
                <TextInput
                    value={formData.name}
                    onChange={(value: string) => updateField('name', value)}
                    placeholder="e.g., Complete FastAPI module 3"
                />
            </FormField>

            <FormField label="Description">
                <TextareaInput
                    value={formData.description}
                    onChange={(value: string) => updateField('description', value)}
                    placeholder="Add details about this task..."
                />
            </FormField>

            <FormField label="Goal">
                <SelectInput
                    value={formData.goal_id ? String(formData.goal_id) : 'no_goal'}
                    onChange={(value) => updateField('goal_id', value === 'no_goal' ? undefined : Number(value))}
                    options={[{ value: 'no_goal', label: 'No Goal' }, ...goalOptions]}
                />
            </FormField>

            <div className="grid grid-cols-3 gap-4">
                <FormField label="Task type" required>
                    <SelectInput
                        value={formData.task_type}
                        onChange={(value) => updateField('task_type', value)}
                        options={[
                            { value: 'daily', label: 'Daily' },
                            { value: 'weekly', label: 'Weekly' },
                            { value: 'monthly', label: 'Monthly' },
                        ]}
                    />
                </FormField>
                <FormField label="Priority" required>
                    <SelectInput
                        value={formData.priority}
                        onChange={(value) => updateField('priority', value)}
                        options={[
                            { value: 'high', label: 'High' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'low', label: 'Low' },
                        ]}
                    />
                </FormField>

                <FormField label="Duration (minutes)">
                    <TextInput
                        type="number"
                        value={formData.estimated_duration}
                        onChange={(value: number) => updateField('estimated_duration', value)}
                        min={5}
                    />
                </FormField>
            </div>

            {formData.goal_id && (
                <FormField
                    label="Value Contribution"
                    error={errors.value}
                    description={
                        isLoadingGoal
                            ? "Loading goal limits..."
                            : selectedGoal?.target_value
                                ? `Max: ${selectedGoal.target_value}`
                                : undefined
                    }
                >
                    <TextInput
                        type="number"
                        value={formData.value || 0}
                        onChange={(value: number) => updateField('value', value)}
                        min={0}
                        max={selectedGoal?.target_value}
                        placeholder="Amount this task contributes to goal"
                        disabled={isLoadingGoal}
                    />
                </FormField>
            )}

            <FormField label="Started Date">
                <DatePicker
                    value={formData.due_date}
                    onChange={(date) => {
                        if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const formattedDate = `${year}-${month}-${day}`;
                            updateField('due_date', formattedDate);
                        } else {
                            updateField('due_date', null);
                        }
                    }}
                />
            </FormField>

            {/* Recurring toggle */}
            <button
                type="button"
                onClick={() => updateField('is_recurring', !formData.is_recurring)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
                    ${formData.is_recurring
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-white/10 bg-white/3 hover:border-white/20'}`}
            >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
                    ${formData.is_recurring ? 'bg-emerald-500 border-emerald-500' : 'border-white/30'}`}>
                    {formData.is_recurring && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
                <div>
                    <p className={`text-sm font-medium ${formData.is_recurring ? 'text-emerald-300' : 'text-white/70'}`}>
                        Daily recurring task
                    </p>
                    <p className="text-xs text-white/35 mt-0.5">
                        Resets every day — completions are logged so you can track weekly progress
                    </p>
                </div>
            </button>

            {/* Subtasks — only shown when editing an existing task */}
            {taskId && (
                <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-white/50">Subtasks</p>

                    {(subtasks as any[]).length > 0 && (
                        <ul className="space-y-1.5">
                            {(subtasks as any[]).map((st: any) => (
                                <li key={st.id} className="flex items-center gap-2 group">
                                    <button
                                        type="button"
                                        onClick={() => updateSubtask.mutate({ id: st.id, data: { completed: !st.completed } })}
                                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
                                            ${st.completed ? 'bg-emerald-500 border-emerald-500' : 'border-white/30 hover:border-white/60'}`}
                                    >
                                        {st.completed && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                    </button>
                                    <span className={`flex-1 text-sm ${st.completed ? 'line-through text-white/35' : 'text-white/80'}`}>
                                        {st.name}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => deleteSubtask.mutate(st.id)}
                                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="flex gap-2 mt-2">
                        <input
                            type="text"
                            value={newSubtaskName}
                            onChange={e => setNewSubtaskName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (!newSubtaskName.trim()) return
                                    createSubtask.mutate({ task_id: taskId, name: newSubtaskName.trim() })
                                    setNewSubtaskName('')
                                }
                            }}
                            placeholder="Add subtask… (press Enter)"
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/30"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                if (!newSubtaskName.trim()) return
                                createSubtask.mutate({ task_id: taskId, name: newSubtaskName.trim() })
                                setNewSubtaskName('')
                            }}
                            className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex gap-3 pt-4">
                <CancelButton onClick={onCancel} />
                <SubmitButton isLoading={isLoading}>
                    {initialData?.name ? 'Update Task' : 'Create Task'}
                </SubmitButton>
            </div>
        </form>
    )
}