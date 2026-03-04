'use client'

import { useState } from 'react'
import {
    FormField,
    TextInput,
    TextareaInput,
    SelectInput,
    SubmitButton,
    CancelButton
} from '../form-components'

interface SubtaskFormData {
    name: string
    description: string
    priority: string
    estimated_duration: number
    task_id: number
}

interface SubtaskFormProps {
    onSubmit: (data: SubtaskFormData) => Promise<void>
    onCancel: () => void
    parentTaskId: number
    initialData?: Partial<SubtaskFormData>
}

export function SubtaskForm({ onSubmit, onCancel, parentTaskId, initialData }: SubtaskFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [formData, setFormData] = useState<SubtaskFormData>({
        name: initialData?.name || '',
        description: initialData?.description || '',
        priority: initialData?.priority || 'medium',
        estimated_duration: initialData?.estimated_duration || 15,
        task_id: parentTaskId
    })

    const updateField = (field: keyof SubtaskFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }))
        }
    }

    const validate = () => {
        const newErrors: Record<string, string> = {}

        if (!formData.name.trim()) {
            newErrors.name = 'Subtask name is required'
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
            <FormField label="Subtask Name" error={errors.name} required>
                <TextInput
                    value={formData.name}
                    onChange={(value: string) => updateField('name', value)}
                    placeholder="e.g., Draft first section"
                />
            </FormField>

            <FormField label="Description">
                <TextareaInput
                    value={formData.description}
                    onChange={(value: string) => updateField('description', value)}
                    placeholder="Add details about this subtask..."
                />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
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

            <div className="flex gap-3 pt-4">
                <CancelButton onClick={onCancel} />
                <SubmitButton isLoading={isLoading}>
                    {initialData ? 'Update Subtask' : 'Create Subtask'}
                </SubmitButton>
            </div>
        </form>
    )
}
