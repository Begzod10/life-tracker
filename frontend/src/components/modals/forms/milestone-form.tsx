import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useMilestoneCreate, useMilestoneUpdate } from '@/lib/hooks/use-milestones'
import { Milestone } from '@/types'

const milestoneSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    target_date: z.string().min(1, 'Target date is required'),
    completion_percentage: z.coerce.number().min(0, 'Completion percentage must be at least 0').max(100, 'Completion percentage must be at most 100'),
    reward_description: z.string().optional(),
    order_index: z.coerce.number().optional().default(0),
    achieved: z.boolean().optional(),
})

type MilestoneFormValues = z.infer<typeof milestoneSchema>

interface MilestoneFormProps {
    goalId: number | string
    milestone?: Milestone
    onSuccess: () => void
    onCancel: () => void
}

export function MilestoneForm({ goalId, milestone, onSuccess, onCancel }: MilestoneFormProps) {
    const createMilestone = useMilestoneCreate()
    const updateMilestone = useMilestoneUpdate()
    const isEdit = !!milestone

    // Format date for input if editing
    const defaultDate = milestone?.target_date
        ? new Date(milestone.target_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]

    const form = useForm({
        resolver: zodResolver(milestoneSchema),
        defaultValues: {
            name: milestone?.name || '',
            description: milestone?.description || '',
            target_date: defaultDate,
            completion_percentage: milestone?.completion_percentage || 0,
            reward_description: milestone?.reward_description || '',
            order_index: milestone?.order_index || 0,
            achieved: milestone?.achieved || false,
        },
    })

    const onSubmit = (data: MilestoneFormValues) => {
        if (isEdit && milestone) {
            updateMilestone.mutate({
                id: milestone.id,
                ...data,
                goal_id: Number(goalId),
            }, {
                onSuccess: () => onSuccess()
            })
        } else {
            createMilestone.mutate({
                ...data,
                goal_id: Number(goalId),
            }, {
                onSuccess: () => onSuccess()
            })
        }
    }

    const isPending = createMilestone.isPending || updateMilestone.isPending

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input placeholder="Milestone name" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Description" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="target_date"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Target Date</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="completion_percentage"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Completion %</FormLabel>
                                <FormControl>
                                    <Input type="number" min="0" max="100" {...field} value={field.value as number} onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="reward_description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reward</FormLabel>
                                <FormControl>
                                    <Input placeholder="Reward description" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="order_index"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Order Index</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} value={field.value as number} onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isPending}>
                        {isPending ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Milestone' : 'Create Milestone')}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
