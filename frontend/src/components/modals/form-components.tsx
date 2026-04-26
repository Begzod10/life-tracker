'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

// Form Field Wrapper
export function FormField({
    label,
    error,
    required,
    description,
    children
}: {
    label: string
    error?: string
    required?: boolean
    description?: string
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <Label className="text-sm font-medium text-gray-300">
                    {label}
                    {required && <span className="text-red-400 ml-1">*</span>}
                </Label>
                {description && (
                    <span className="text-xs text-muted-foreground text-gray-400">{description}</span>
                )}
            </div>
            {children}
            {error && (
                <p className="text-xs text-red-400">{error}</p>
            )}
        </div>
    )
}

// Text Input
export function TextInput({
    value,
    onChange,
    placeholder,
    ...props
}: any) {
    return (
        <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="bg-[#0f0f1a] border-[#2a2b36] text-white placeholder:text-gray-500"
            {...props}
        />
    )
}

// Textarea
export function TextareaInput({
    value,
    onChange,
    placeholder,
    rows = 3,
    ...props
}: any) {
    return (
        <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="bg-[#0f0f1a] border-[#2a2b36] text-white placeholder:text-gray-500 resize-none"
            {...props}
        />
    )
}

// Select Dropdown
export function SelectInput({
    value,
    onChange,
    options,
    placeholder = "Select..."
}: {
    value: string | number
    onChange: (value: string) => void
    options: { value: string | number; label: string }[]
    placeholder?: string
}) {
    return (
        <Select value={String(value)} onValueChange={onChange}>
            <SelectTrigger className="bg-[#0f0f1a] border-[#2a2b36] text-white">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1b26] border-[#2a2b36]">
                {options.map((option) => (
                    <SelectItem
                        key={String(option.value)}
                        value={String(option.value)}
                        className="text-white hover:bg-[#2a2b36]"
                    >
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

// Date Picker
export function DatePicker({
    value,
    onChange
}: {
    value?: Date
    onChange: (date?: Date) => void
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "w-full justify-start text-left font-normal bg-[#0f0f1a] border-[#2a2b36] text-white hover:bg-[#0f0f1a]",
                        !value && "text-gray-500"
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {value ? format(value, "PPP") : "Pick a date"}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-[#1a1b26] border-[#2a2b36]">
                <Calendar
                    mode="single"
                    selected={value}
                    onSelect={onChange}
                    initialFocus
                    className="text-white"
                />
            </PopoverContent>
        </Popover>
    )
}

// Number Input
export function NumberInput({
    value,
    onChange,
    placeholder,
    min,
    max,
    step = 1,
    ...props
}: any) {
    const displayValue = (value === null || value === undefined || Number.isNaN(value)) ? '' : value

    return (
        <Input
            type="number"
            value={displayValue}
            onChange={(e) => {
                const val = parseFloat(e.target.value)
                onChange(Number.isNaN(val) ? 0 : val)
            }}
            onFocus={(e) => {
                if (Number(e.target.value) === 0) {
                    onChange('')
                }
            }}
            onBlur={(e) => {
                if (e.target.value === '') {
                    onChange(0)
                }
            }}
            placeholder={placeholder}
            min={min}
            max={max}
            step={step}
            className="bg-[#0f0f1a] border-[#2a2b36] text-white placeholder:text-gray-500"
            {...props}
        />
    )
}

// Color Picker
export function ColorPicker({
    value,
    onChange
}: {
    value: string
    onChange: (color: string) => void
}) {
    const colors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#10b981', '#ef4444', '#6366f1', '#14b8a6'
    ]

    return (
        <div className="flex gap-2 flex-wrap">
            {colors.map((color) => (
                <button
                    key={color}
                    type="button"
                    onClick={() => onChange(color)}
                    className={cn(
                        "w-10 h-10 rounded-lg transition-all",
                        value === color && "ring-2 ring-white ring-offset-2 ring-offset-[#1a1b26]"
                    )}
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    )
}

// Submit Button
export function SubmitButton({
    children,
    isLoading,
    disabled,
    ...props
}: {
    children: React.ReactNode
    isLoading?: boolean
    disabled?: boolean
}) {
    return (
        <Button
            type="submit"
            disabled={disabled || isLoading}
            className="w-full"
            {...props}
        >
            {isLoading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                </>
            ) : (
                children
            )}
        </Button>
    )
}

// Cancel Button
export function CancelButton({
    onClick
}: {
    onClick: () => void
}) {
    return (
        <Button
            type="button"
            variant="outline"
            onClick={onClick}
            className="w-full bg-transparent border-[#2a2b36] text-white hover:bg-[#2a2b36]"
        >
            Cancel
        </Button>
    )
}