'use client'

import { useState } from 'react'
import {
    FormField,
    TextInput,
    SelectInput,
    SubmitButton,
    CancelButton
} from '../form-components'

interface HabitFormData {
    name: string
    category: string
    frequency: string
    targetCount: number
}

interface HabitFormProps {
    onSubmit: any
    onCancel: () => void
    initialData?: Partial<HabitFormData>
}

export function HabitForm({ onSubmit, onCancel, initialData }: HabitFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [formData, setFormData] = useState<HabitFormData>({
        name: initialData?.name || '',
        category: initialData?.category || 'health',
        frequency: initialData?.frequency || 'daily',
        targetCount: initialData?.targetCount || 1,
    })

    const updateField = (field: keyof HabitFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }))
        }
    }

    const validate = () => {
        const newErrors: Record<string, string> = {}

        if (!formData.name.trim()) {
            newErrors.name = 'Habit name is required'
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

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <FormField label="Habit Name" error={errors.name} required>
                <TextInput
                    value={formData.name}
                    onChange={(value: string) => updateField('name', value)}
                    placeholder="e.g., Morning meditation"
                />
            </FormField>

            <FormField label="Category" required>
                <SelectInput
                    value={formData.category}
                    onChange={(value) => updateField('category', value)}
                    options={[
                        { value: 'health', label: 'Health' },
                        { value: 'productivity', label: 'Productivity' },
                        { value: 'learning', label: 'Learning' },
                        { value: 'mindfulness', label: 'Mindfulness' },
                        { value: 'social', label: 'Social' },
                    ]}
                />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
                <FormField label="Frequency" required>
                    <SelectInput
                        value={formData.frequency}
                        onChange={(value) => updateField('frequency', value)}
                        options={[
                            { value: 'daily', label: 'Daily' },
                            { value: 'weekly', label: 'Weekly' },
                            { value: 'custom', label: 'Custom' },
                        ]}
                    />
                </FormField>

                <FormField label="Times per day" required>
                    <TextInput
                        type="number"
                        value={formData.targetCount}
                        onChange={(value: number) => updateField('targetCount', value)}
                        min={1}
                        max={10}
                    />
                </FormField>
            </div>

            <div className="flex gap-3 pt-4">
                <CancelButton onClick={onCancel} />
                <SubmitButton isLoading={isLoading}>
                    Create Habit
                </SubmitButton>
            </div>
        </form>
    )
}