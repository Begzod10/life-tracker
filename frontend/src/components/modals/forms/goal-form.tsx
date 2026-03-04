'use client'

import { useState } from 'react'
import {
    FormField,
    TextInput,
    TextareaInput,
    SelectInput,
    DatePicker,
    NumberInput,
    ColorPicker,
    SubmitButton,
    CancelButton
} from '../form-components'

interface GoalFormData {
    name: string
    description: string
    category: string
    priority: string
    target_value: number
    current_value: number
    // unit: string
    start_date?: Date
    target_date?: Date
    color: string
}

interface GoalFormProps {
    onSubmit: any
    onCancel: () => void
    initialData?: Partial<GoalFormData>
}

export function GoalForm({ onSubmit, onCancel, initialData }: GoalFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [formData, setFormData] = useState<GoalFormData>({
        name: initialData?.name || '',
        description: initialData?.description || '',
        category: initialData?.category || 'learning',
        priority: initialData?.priority || 'medium',
        target_value: initialData?.target_value || 100,
        current_value: initialData?.current_value || 0,
        // unit: initialData?.unit || '%',
        start_date: initialData?.start_date,
        target_date: initialData?.target_date,
        color: initialData?.color || '#3b82f6',
    })

    const updateField = (field: keyof GoalFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        // Clear error when user starts typing
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }))
        }
    }

    const validate = () => {
        const newErrors: Record<string, string> = {}

        if (!formData.name.trim()) {
            newErrors.name = 'Goal name is required'
        }

        if (formData.target_value <= 0) {
            newErrors.target_value = 'Target value must be greater than 0'
        }

        if (formData.current_value < 0) {
            newErrors.current_value = 'Current value cannot be negative'
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
        } catch (error) {
            console.error('Failed to create goal:', error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Goal Name */}
            <FormField label="Goal Name" error={errors.name} required>
                <TextInput
                    value={formData.name}
                    onChange={(value: string) => updateField('name', value)}
                    placeholder="e.g., IELTS 6.5"
                />
            </FormField>

            {/* Description */}
            <FormField label="Description" error={errors.description}>
                <TextareaInput
                    value={formData.description}
                    onChange={(value: string) => updateField('description', value)}
                    placeholder="Describe your goal..."
                />
            </FormField>

            {/* Category & Priority */}
            <div className="grid grid-cols-2 gap-4">
                <FormField label="Category" required>
                    <SelectInput
                        value={formData.category}
                        onChange={(value) => updateField('category', value)}
                        options={[
                            { value: 'learning', label: 'Learning' },
                            { value: 'development', label: 'Development' },
                            { value: 'health', label: 'Health' },
                            { value: 'career', label: 'Career' },
                            { value: 'finance', label: 'Finance' },
                            { value: 'personal', label: 'Personal' },
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
            </div>

            {/* Target & Current Value */}
            <div className={`grid ${initialData ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                {!initialData && (
                    <FormField label="Current Value" error={errors.current_value} required>
                        <NumberInput
                            value={formData.current_value}
                            onChange={(value: number) => updateField('current_value', value)}
                            min={0}
                        />
                    </FormField>
                )}

                <FormField label="Target Value" error={errors.target_value} required>
                    <NumberInput
                        value={formData.target_value}
                        onChange={(value: number) => updateField('target_value', value)}
                        min={1}
                    />
                </FormField>

                {/* <FormField label="Unit" required>
                    <TextInput
                        value={formData.unit}
                        onChange={(value: string) => updateField('unit', value)}
                        placeholder="%, score, days"
                    />
                </FormField> */}
            </div>

            {/* Target Date */}
            <div className="grid grid-cols-2 gap-4">
                {/* <FormField label="Started Date">
                    <DatePicker
                        value={formData.start_date}
                        onChange={(date) => updateField('start_date', date)}
                    />
                </FormField> */}
                <FormField label="Started Date">
                    <DatePicker
                        value={formData.start_date}
                        onChange={(date) => {
                            if (date) {
                                const year = date.getFullYear();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const day = String(date.getDate()).padStart(2, '0');
                                const formattedDate = `${year}-${month}-${day}`;
                                updateField('start_date', formattedDate);
                            } else {
                                updateField('start_date', null);
                            }
                        }}
                    />
                </FormField>
                <FormField label="Target Date">
                    <DatePicker
                        value={formData.target_date}
                        onChange={(date) => {
                            if (date) {
                                const year = date.getFullYear();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const day = String(date.getDate()).padStart(2, '0');
                                const formattedDate = `${year}-${month}-${day}`;
                                updateField('target_date', formattedDate);
                            } else {
                                updateField('target_date', null);
                            }
                        }}
                    />
                </FormField>
            </div>

            {/* Color */}
            <FormField label="Color">
                <ColorPicker
                    value={formData.color}
                    onChange={(color) => updateField('color', color)}
                />
            </FormField>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
                <CancelButton onClick={onCancel} />
                <SubmitButton isLoading={isLoading}>
                    {initialData ? 'Update Goal' : 'Create Goal'}
                </SubmitButton>
            </div>
        </form>
    )
}