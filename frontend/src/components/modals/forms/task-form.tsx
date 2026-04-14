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

interface TaskFormData {
    name: string
    description: string
    priority: string
    task_type: string
    due_date?: Date
    estimated_duration: number
    goal_id?: number | string
    value?: number
}

interface TaskFormProps {
    onSubmit: any
    onCancel: () => void
    initialData?: Partial<TaskFormData>
}

import { useUser } from '@/lib/hooks/use-auth'

export function TaskForm({ onSubmit, onCancel, initialData }: TaskFormProps) {
    const { data: user } = useUser()
    const { data: goals = [] } = useGoalsList(user?.id)
    const [isLoading, setIsLoading] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [formData, setFormData] = useState<TaskFormData>({
        name: initialData?.name || '',
        description: initialData?.description || '',
        task_type: initialData?.task_type || 'daily',
        priority: initialData?.priority || 'medium',
        due_date: initialData?.due_date,
        estimated_duration: initialData?.estimated_duration || 30,
        goal_id: initialData?.goal_id,
        value: initialData?.value || 0
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

            <div className="flex gap-3 pt-4">
                <CancelButton onClick={onCancel} />
                <SubmitButton isLoading={isLoading}>
                    {initialData?.name ? 'Update Task' : 'Create Task'}
                </SubmitButton>
            </div>
        </form>
    )
}