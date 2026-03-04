import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const formSchema = z.object({
    value_logged: z.number().min(0, 'Value must be positive'),
    notes: z.string().optional(),
    mood: z.string().optional(),
    energy_level: z.number().min(1).max(10).optional(),
    log_date: z.string().nonempty('Date is required'),
})

type FormData = z.infer<typeof formSchema>

interface ProgressLogFormProps {
    goalId?: number | string
    onSubmit: (data: FormData) => Promise<void>
    isLoading?: boolean
    defaultValues?: Partial<FormData>
}

export function ProgressLogForm({ goalId, onSubmit, isLoading = false, defaultValues }: ProgressLogFormProps) {
    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            value_logged: 0,
            log_date: new Date().toISOString().split('T')[0],
            energy_level: 5,
            ...defaultValues
        },
    })

    const onFormSubmit = (data: FormData) => {
        onSubmit(data)
    }

    return (
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="log_date">Date</Label>
                    <Input
                        id="log_date"
                        type="date"
                        {...register('log_date')}
                        className="bg-white/5 border-white/10 text-white"
                    />
                    {errors.log_date && <p className="text-red-500 text-xs">{errors.log_date.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="value_logged">Value Logged</Label>
                    <Input
                        id="value_logged"
                        type="number"
                        {...register('value_logged', { valueAsNumber: true })}
                        className="bg-white/5 border-white/10 text-white"
                    />
                    {errors.value_logged && <p className="text-red-500 text-xs">{errors.value_logged.message}</p>}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="mood">Mood</Label>
                <Select
                    onValueChange={(value) => setValue('mood', value)}
                    defaultValue={defaultValues?.mood}
                >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Select mood" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
                        <SelectItem value="great">Great</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                        <SelectItem value="bad">Bad</SelectItem>
                        <SelectItem value="awful">Awful</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="energy_level">Energy Level (1-10)</Label>
                <div className="flex items-center gap-4">
                    <Input
                        id="energy_level"
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        className="flex-1"
                        {...register('energy_level', { valueAsNumber: true })}
                    />
                    <span className="text-white font-bold w-6 text-center">{watch('energy_level')}</span>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                    id="notes"
                    placeholder="Any thoughts on your progress?"
                    {...register('notes')}
                    className="bg-white/5 border-white/10 text-white min-h-[100px]"
                />
            </div>

            <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                disabled={isLoading}
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                    </>
                ) : (
                    'Save Log'
                )}
            </Button>
        </form>
    )
}
