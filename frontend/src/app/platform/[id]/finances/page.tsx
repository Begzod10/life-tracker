'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, Plus, Trash2, Edit2, TrendingUp, TrendingDown, Loader2, BarChart3, Wallet, PiggyBank, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useMonthlyFinancialSummary, useNetWorth, useSpendingTrends } from '@/lib/hooks/use-finances'
import { useJobCreate, useJobsList, useJobDelete, useJobUpdate, useDeletedJobsList } from '@/lib/hooks/use-jobs'
import { useExpenseCreate, useExpensesList, useExpenseDelete, useExpenseUpdate, useDeletedExpensesList } from '@/lib/hooks/use-expenses'
import { useBudgetsList, useDeletedBudgetsList, useBudgetCreate, useBudgetUpdate, useBudgetDelete } from '@/lib/hooks/use-budgets'
import { useIncomeSourcesList, useDeletedIncomeSourcesList, useIncomeSourceCreate, useIncomeSourceUpdate, useIncomeSourceDelete } from '@/lib/hooks/use-income-sources'
import { useSavingsList, useDeletedSavingsList, useSavingsCreate, useSavingsUpdate, useSavingsDelete } from '@/lib/hooks/use-savings'
import { useSalaryMonthsList, useSalaryMonthCreate, useSalaryMonthDelete, useDeletedSalaryMonthsList } from '@/lib/hooks/use-salary'
import { FormField, TextInput, TextareaInput, SelectInput, NumberInput, DatePicker, SubmitButton, CancelButton } from '@/components/modals/form-components'

// Module-level constants to avoid recreating on every render
const CURRENCY_OPTIONS = [
    { value: 'UZS', label: 'UZS' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
]

const EXPENSE_CATEGORY_OPTIONS = [
    { value: 'food', label: 'Food' },
    { value: 'transport', label: 'Transport' },
    { value: 'education', label: 'Education' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'bills', label: 'Bills' },
    { value: 'health', label: 'Health' },
    { value: 'shopping', label: 'Shopping' },
]

// Types
interface Job {
    id: string | number
    person_id: string | number
    name: string
    company: string
    salary: number
    currency: string
    employment_type: 'full-time' | 'part-time' | 'freelance'
    active: boolean
    start_date: string
    end_date?: string
    notes?: string
    department?: string
}

interface SalaryMonth {
    id: number
    job_id: number
    month: string
    salary_amount: number
    deductions: number
    net_amount: number
    received_date: string
    person_id: number
    job_name?: string
    company?: string
    created_at?: string
    updated_at?: string
    total_spent?: number
    remaining_amount?: number
    currency?: string
}

interface Expense {
    id: string | number
    person_id: number
    name: string
    description?: string
    amount: number
    currency: string
    category: string
    subcategory?: string
    payment_type?: string
    payment_method?: string
    date: string
    is_recurring: boolean
    recurrence_frequency?: string
    is_essential: boolean
    receipt_photo?: string
    location?: string
    tags?: string
    salary_month_id?: number
}

interface Budget {
    id: string | number
    person_id: number
    category: string
    allocated_amount: number
    spent_amount: number
    remaining_amount: number
    period: string
    period_type: string
    notes?: string
    deleted?: boolean
    created_at?: string
    updated_at?: string
}

interface IncomeSource {
    id: string | number
    person_id: number
    source_name: string
    source_type: string
    amount: number
    currency: string
    frequency: string
    received_date: string
    description?: string
    deleted?: boolean
    created_at?: string
    updated_at?: string
}

interface SavingsAccount {
    id: string | number
    person_id: number
    account_name: string
    account_type: string
    current_balance: number
    initial_amount: number
    target_amount: number
    currency: string
    interest_rate: number
    start_date: string
    maturity_date?: string
    risk_level: string
    platform: string
    notes?: string
    deleted?: boolean
    created_at?: string
    updated_at?: string
}

// Mock Data
// Budgets removed as they're now fully fetched via use-budgets




// Color mappings
const categoryColors: Record<string, { bg: string; text: string; badge: string }> = {
    food: { bg: 'bg-orange-500/10', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' },
    transport: { bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
    education: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', badge: 'bg-indigo-500/20 text-indigo-300' },
    entertainment: { bg: 'bg-pink-500/10', text: 'text-pink-400', badge: 'bg-pink-500/20 text-pink-300' },
    bills: { bg: 'bg-red-500/10', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300' },
    health: { bg: 'bg-green-500/10', text: 'text-green-400', badge: 'bg-green-500/20 text-green-300' },
    shopping: { bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
}

// Components
const FinancesHeader: React.FC<{ id: string }> = ({ id }) => {
    const router = useRouter()

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
        >
            <div className="flex items-center gap-3">
                <button
                    onClick={() => router.push('/platform')}
                    className="p-2 hover:bg-[#2a2b36] rounded-lg transition-colors"
                >
                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                </button>
                <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold text-white">Finances</h1>
                    <div className="text-2xl">💰</div>
                </div>
            </div>
        </motion.div>
    )
}

const OverviewCard: React.FC<{
    label: string
    value: string
    trend?: number
    delay: number
    isLoading?: boolean
}> = ({ label, value, trend, delay, isLoading }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay * 0.05 }}
    >
        <Card className="bg-[#1a1b26] border border-[#2a2b36] p-6 rounded-xl hover:border-[#3a3b46] transition-all">
            <p className="text-sm text-gray-400 mb-2">{label}</p>
            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-9 w-32 bg-[#2a2b36]" />
                    <Skeleton className="h-4 w-16 bg-[#2a2b36]" />
                </div>
            ) : (
                <>
                    <p className="text-3xl font-bold text-white mb-2">{value}</p>
                    {trend !== undefined && (
                        <div className="flex items-center gap-1">
                            {trend >= 0 ? (
                                <>
                                    <TrendingUp className="w-4 h-4 text-green-400" />
                                    <span className="text-sm text-green-400">+{trend}%</span>
                                </>
                            ) : (
                                <>
                                    <TrendingDown className="w-4 h-4 text-red-400" />
                                    <span className="text-sm text-red-400">{trend}%</span>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </Card>
    </motion.div>
)

const JobCard: React.FC<{ job: Job; onDelete: (id: string | number) => void }> = React.memo(({ job, onDelete }) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
    >
        <Card className="bg-[#1a1b26] border border-[#2a2b36] p-6 rounded-xl hover:border-[#3a3b46] transition-all">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">{job.name}</h3>
                    <p className="text-sm text-gray-400">{job.company}</p>
                </div>
                <Badge variant="secondary" className={job.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-300'}>
                    {job.active ? 'Active' : 'Inactive'}
                </Badge>
            </div>

            <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Monthly Salary</span>
                    <span className="text-white font-semibold">
                        {job.currency === 'USD' ? '$' : ''}{job.salary?.toLocaleString()} {job.currency}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Employment Type</span>
                    <Badge variant="outline" className="capitalize">{(job.employment_type || '').replace('-', ' ')}</Badge>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Start Date</span>
                    <span className="text-gray-300 text-sm">{job.start_date ? new Date(job.start_date).toLocaleDateString() : ''}</span>
                </div>
                {job.end_date && (
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">End Date</span>
                        <span className="text-gray-300 text-sm">{new Date(job.end_date).toLocaleDateString()}</span>
                    </div>
                )}
                {job.notes && (
                    <div className="flex flex-col mt-2 border-t border-[#2a2b36] pt-3">
                        <span className="text-gray-400 text-xs mb-1">Notes</span>
                        <span className="text-gray-300 text-sm">{job.notes}</span>
                    </div>
                )}
            </div>

            <div className="flex gap-2">
                <EditJobButton job={job} personId={job.person_id} />
                <DeleteJobButton job={job} onDelete={onDelete} />
            </div>
        </Card>
    </motion.div>
))

const DeleteJobButton: React.FC<{ job: Job; onDelete: (id: string | number) => void }> = React.memo(({ job, onDelete }) => {
    const [open, setOpen] = useState(false)
    const { isPending } = useJobDelete() // We handle deletion manually so we don't need mutate here

    const handleDelete = async () => {
        await onDelete(job.id)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Delete Job</DialogTitle>
                </DialogHeader>
                <p className="text-gray-400 my-4">
                    Are you sure you want to delete <span className="text-white">{job.name}</span> at <span className="text-white">{job.company}</span>? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Delete
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
})

const EditJobButton: React.FC<{ job: Job; personId: string | number }> = React.memo(({ job, personId }) => {
    const [open, setOpen] = useState(false)
    const { mutate: updateJob, isPending } = useJobUpdate()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [formData, setFormData] = useState<any>({
        name: job.name,
        company: job.company,
        salary: job.salary,
        currency: job.currency,
        employment_type: job.employment_type,
        active: job.active,
        start_date: job.start_date ? new Date(job.start_date) : undefined,
        end_date: job.end_date ? new Date(job.end_date) : undefined,
        notes: job.notes || '',
        department: job.department || '',
    })

    const updateField = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }))
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }))
        }
    }

    const validate = () => {
        const newErrors: Record<string, string> = {}
        if (!formData.name?.trim()) newErrors.name = 'Job title is required'
        if (!formData.company?.trim()) newErrors.company = 'Company is required'
        if (!formData.salary) newErrors.salary = 'Salary is required'

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return

        updateJob({
            id: job.id,
            data: {
                name: formData.name,
                company: formData.company,
                salary: Number(formData.salary),
                currency: formData.currency,
                employment_type: formData.employment_type as any,
                active: formData.active,
                start_date: formData.start_date
                    ? `${formData.start_date.getFullYear()}-${String(formData.start_date.getMonth() + 1).padStart(2, '0')}-${String(formData.start_date.getDate()).padStart(2, '0')}`
                    : new Date().toISOString().split('T')[0],
                end_date: formData.end_date
                    ? `${formData.end_date.getFullYear()}-${String(formData.end_date.getMonth() + 1).padStart(2, '0')}-${String(formData.end_date.getDate()).padStart(2, '0')}`
                    : undefined,
                notes: formData.notes,
                department: formData.department,
            }
        }, {
            onSuccess: () => {
                setOpen(false)
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="flex-1 hover:border-white/20">
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Edit Job</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormField label="Job Title" error={errors.name} required>
                        <TextInput
                            value={formData.name}
                            onChange={(value: string) => updateField('name', value)}
                            placeholder="e.g., Senior Developer"
                        />
                    </FormField>

                    <FormField label="Company" error={errors.company} required>
                        <TextInput
                            value={formData.company}
                            onChange={(value: string) => updateField('company', value)}
                            placeholder="e.g., Tech Corp"
                        />
                    </FormField>

                    <FormField label="Department">
                        <TextInput
                            value={formData.department}
                            onChange={(value: string) => updateField('department', value)}
                            placeholder="e.g., Education"
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Monthly Salary" error={errors.salary} required>
                            <NumberInput
                                value={formData.salary}
                                onChange={(value: number) => updateField('salary', value)}
                                placeholder="5000000"
                                min={0}
                            />
                        </FormField>
                        <FormField label="Currency">
                            <SelectInput
                                value={formData.currency}
                                onChange={(value: string) => updateField('currency', value)}
                                options={CURRENCY_OPTIONS}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Start Date">
                            <DatePicker
                                value={formData.start_date}
                                onChange={(date) => updateField('start_date', date)}
                            />
                        </FormField>
                        <FormField label="End Date">
                            <DatePicker
                                value={formData.end_date}
                                onChange={(date) => updateField('end_date', date)}
                            />
                        </FormField>
                    </div>

                    <FormField label="Employment Type">
                        <SelectInput
                            value={formData.employment_type}
                            onChange={(value: string) => updateField('employment_type', value)}
                            options={[
                                { value: 'full-time', label: 'Full-time' },
                                { value: 'part-time', label: 'Part-time' },
                                { value: 'freelance', label: 'Freelance' }
                            ]}
                        />
                    </FormField>

                    <FormField label="Notes">
                        <TextareaInput
                            value={formData.notes}
                            onChange={(value: string) => updateField('notes', value)}
                            placeholder="Add any additional notes here..."
                        />
                    </FormField>

                    <div className="flex justify-between items-center pt-4 border-t border-[#2a2b36]">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="active" className="text-gray-400">Active Status</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => updateField('active', !formData.active)}
                                className={formData.active ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-gray-500/20 text-gray-300'}
                            >
                                {formData.active ? 'Active' : 'Inactive'}
                            </Button>
                        </div>
                        <div className="flex gap-3">
                            <CancelButton onClick={() => setOpen(false)} />
                            <SubmitButton isLoading={isPending}>Save Changes</SubmitButton>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
})


const JobFormModal: React.FC<{ personId: string; onAdd?: (job: Job) => void }> = ({ personId, onAdd }) => {
    const [open, setOpen] = useState(false)
    const { mutate: createJob, isPending } = useJobCreate()
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [formData, setFormData] = useState<any>({
        name: '',
        company: '',
        salary: '',
        currency: 'UZS',
        employment_type: 'full-time',
        active: true,
        start_date: undefined,
        end_date: undefined,
        notes: '',
        department: '',
    })

    const updateField = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }))
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }))
        }
    }

    const validate = () => {
        const newErrors: Record<string, string> = {}
        if (!formData.name?.trim()) newErrors.name = 'Job title is required'
        if (!formData.company?.trim()) newErrors.company = 'Company is required'
        if (!formData.salary) newErrors.salary = 'Salary is required'

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return

        createJob({
            name: formData.name,
            company: formData.company,
            salary: Number(formData.salary),
            currency: formData.currency,
            employment_type: formData.employment_type as any,
            active: formData.active,
            start_date: formData.start_date
                ? `${formData.start_date.getFullYear()}-${String(formData.start_date.getMonth() + 1).padStart(2, '0')}-${String(formData.start_date.getDate()).padStart(2, '0')}`
                : new Date().toISOString().split('T')[0],
            end_date: formData.end_date
                ? `${formData.end_date.getFullYear()}-${String(formData.end_date.getMonth() + 1).padStart(2, '0')}-${String(formData.end_date.getDate()).padStart(2, '0')}`
                : undefined,
            notes: formData.notes,
            department: formData.department,
            person_id: Number(personId),
        }, {
            onSuccess: () => {
                setOpen(false)
                setFormData({
                    name: '',
                    company: '',
                    salary: '',
                    currency: 'UZS',
                    employment_type: 'full-time',
                    active: true,
                    start_date: undefined,
                    end_date: undefined,
                    notes: '',
                    department: '',
                })
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Job
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Add New Job</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormField label="Job Title" error={errors.name} required>
                        <TextInput
                            value={formData.name}
                            onChange={(value: string) => updateField('name', value)}
                            placeholder="e.g., Senior Developer"
                        />
                    </FormField>

                    <FormField label="Company" error={errors.company} required>
                        <TextInput
                            value={formData.company}
                            onChange={(value: string) => updateField('company', value)}
                            placeholder="e.g., Tech Corp"
                        />
                    </FormField>

                    <FormField label="Department">
                        <TextInput
                            value={formData.department}
                            onChange={(value: string) => updateField('department', value)}
                            placeholder="e.g., Education"
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Monthly Salary" error={errors.salary} required>
                            <NumberInput
                                value={formData.salary}
                                onChange={(value: number) => updateField('salary', value)}
                                placeholder="5000000"
                                min={0}
                            />
                        </FormField>
                        <FormField label="Currency">
                            <SelectInput
                                value={formData.currency}
                                onChange={(value: string) => updateField('currency', value)}
                                options={CURRENCY_OPTIONS}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Start Date">
                            <DatePicker
                                value={formData.start_date}
                                onChange={(date) => updateField('start_date', date)}
                            />
                        </FormField>
                        <FormField label="End Date">
                            <DatePicker
                                value={formData.end_date}
                                onChange={(date) => updateField('end_date', date)}
                            />
                        </FormField>
                    </div>

                    <FormField label="Employment Type">
                        <SelectInput
                            value={formData.employment_type}
                            onChange={(value: string) => updateField('employment_type', value)}
                            options={[
                                { value: 'full-time', label: 'Full-time' },
                                { value: 'part-time', label: 'Part-time' },
                                { value: 'freelance', label: 'Freelance' }
                            ]}
                        />
                    </FormField>

                    <FormField label="Notes">
                        <TextareaInput
                            value={formData.notes}
                            onChange={(value: string) => updateField('notes', value)}
                            placeholder="Add any additional notes here..."
                        />
                    </FormField>

                    <div className="flex gap-3 pt-4">
                        <CancelButton onClick={() => setOpen(false)} />
                        <SubmitButton isLoading={isPending}>
                            Add Job
                        </SubmitButton>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

const SalaryFormModal: React.FC<{ personId: string | number }> = ({ personId }) => {
    const [open, setOpen] = useState(false)
    const { mutate: createSalary, isPending } = useSalaryMonthCreate()
    const { data: jobsResponse } = useJobsList(personId)

    // We expect jobsResponse to be an array of Job, similar to jobs tab
    const jobs = Array.isArray(jobsResponse) ? jobsResponse : []

    const [formData, setFormData] = useState({
        job_id: '',
        month: new Date().toISOString().substring(0, 7), // "YYYY-MM"
        salary_amount: 0,
        deductions: 0,
        net_amount: 0,
        received_date: new Date()
    })

    const updateField = (field: string, value: any) => {
        setFormData(prev => {
            const next = { ...prev, [field]: value }
            if (field === 'salary_amount' || field === 'deductions') {
                next.net_amount = (Number(next.salary_amount) || 0) - (Number(next.deductions) || 0)
            }
            return next
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const dataToSubmit = {
            ...formData,
            job_id: Number(formData.job_id),
            person_id: Number(personId),
            received_date: formData.received_date.toISOString().split('T')[0]
        }

        createSalary(dataToSubmit, {
            onSuccess: () => {
                setOpen(false)
                setFormData({
                    job_id: '',
                    month: new Date().toISOString().substring(0, 7),
                    salary_amount: 0,
                    deductions: 0,
                    net_amount: 0,
                    received_date: new Date()
                })
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Salary
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[80vh] overflow-y-auto w-full max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white">Add New Salary Record</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormField label="Job" required>
                        <SelectInput
                            value={formData.job_id}
                            onChange={(value: string) => updateField('job_id', value)}
                            options={jobs.map((job: Job) => ({ value: String(job.id), label: `${job.name} at ${job.company}` }))}
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Month (YYYY-MM)" required>
                            <TextInput
                                value={formData.month}
                                onChange={(value: string) => updateField('month', value)}
                                placeholder="2026-01"
                            />
                        </FormField>
                        <FormField label="Received Date" required>
                            <DatePicker
                                value={formData.received_date}
                                onChange={(date) => date && updateField('received_date', date)}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <FormField label="Gross Salary" required>
                            <NumberInput
                                value={formData.salary_amount}
                                onChange={(value: number) => updateField('salary_amount', value)}
                                placeholder="0"
                                min={0}
                            />
                        </FormField>
                        <FormField label="Deductions" required>
                            <NumberInput
                                value={formData.deductions}
                                onChange={(value: number) => updateField('deductions', value)}
                                placeholder="0"
                                min={0}
                            />
                        </FormField>
                        <FormField label="Net Amount">
                            <TextInput
                                value={String(formData.net_amount)}
                                onChange={() => { }}
                                readOnly
                            />
                        </FormField>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-[#2a2b36]">
                        <div className="flex gap-3">
                            <CancelButton onClick={() => setOpen(false)} />
                            <SubmitButton isLoading={isPending}>
                                Record Salary
                            </SubmitButton>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

const DeleteSalaryButton: React.FC<{ salary: SalaryMonth }> = ({ salary }) => {
    const [open, setOpen] = useState(false)
    const { mutate: deleteSalary, isPending } = useSalaryMonthDelete()

    const handleDelete = () => {
        deleteSalary(salary.id, {
            onSuccess: () => {
                setOpen(false)
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Delete Salary Record</DialogTitle>
                </DialogHeader>
                <p className="text-gray-400 my-4">
                    Are you sure you want to delete this salary record? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Delete
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const SalaryTab: React.FC<{ personId: string | number }> = ({ personId }) => {
    const router = useRouter()
    const [showDeleted, setShowDeleted] = useState(false)
    const { data: salaryResponse, isLoading } = useSalaryMonthsList(personId)
    const { data: deletedSalaryResponse, isLoading: isDeletedLoading } = useDeletedSalaryMonthsList(personId)
    const { data: jobsResponse } = useJobsList(personId)
    const { data: deletedJobsResponse } = useDeletedJobsList(personId)

    const salaries = Array.isArray(salaryResponse) ? salaryResponse : []
    const deletedSalaries = Array.isArray(deletedSalaryResponse) ? deletedSalaryResponse : []
    const jobs = Array.isArray(jobsResponse) ? jobsResponse : []
    const deletedJobs = Array.isArray(deletedJobsResponse) ? deletedJobsResponse : []
    const allJobs = [...jobs, ...deletedJobs]

    const displaySalaries = showDeleted ? deletedSalaries : salaries

    const getJobName = (salary: SalaryMonth) => {
        if (salary.job_name) {
            return `${salary.job_name} (Company: ${salary.company})`
        }
        const job = jobs.find((j: Job) => String(j.id) === String(salary.job_id))
        return job ? `${job.name} (Company: ${job.company})` : `Job ID: ${salary.job_id}`
    }

    if (isLoading || isDeletedLoading) {
        return <div className="text-gray-400 text-center py-8 flex justify-center items-center">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading salary records...
        </div>
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
        >
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-semibold text-white">Salary Records</h2>
                    <p className="text-sm text-gray-400 mt-1">Track your monthly salary and deductions</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleted(!showDeleted)}
                        className={showDeleted ? 'border-red-500/50 text-red-400 bg-red-500/10' : ''}
                    >
                        {showDeleted ? 'Show Active Records' : 'Show Deleted Records'}
                    </Button>
                    <SalaryFormModal personId={personId} />
                </div>
            </div>

            {displaySalaries.length === 0 ? (
                <div className="text-center py-12 bg-[#1a1b26] rounded-xl border border-[#2a2b36]">
                    <p className="text-gray-400 mb-4">{showDeleted ? 'No deleted salary records found.' : 'No salary records found.'}</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {displaySalaries.map((salary: SalaryMonth) => (
                        <Card key={salary.id} className="bg-[#1a1b26] border border-[#2a2b36] p-6 rounded-xl hover:border-[#3a3b46] transition-all cursor-pointer" onClick={() => !showDeleted && router.push(`/platform/${personId}/salary?id=${salary.id}`)}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-semibold text-white">{getJobName(salary)}</h3>
                                    </div>
                                    <p className="text-sm text-gray-400">Month: {salary.month}</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-bold text-teal-400">
                                        {salary.net_amount.toLocaleString()} {salary.currency || 'UZS'}
                                    </div>
                                    <p className="text-xs text-gray-500">Net Received</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-[#2a2b36]">
                                <div>
                                    <p className="text-xs text-gray-500">Gross Salary</p>
                                    <p className="text-sm text-gray-300">{salary.salary_amount.toLocaleString()} {salary.currency || 'UZS'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Deductions</p>
                                    <p className="text-sm text-red-400">{salary.deductions.toLocaleString()} {salary.currency || 'UZS'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Total Spent</p>
                                    <p className="text-sm text-orange-400">{(salary.total_spent || 0).toLocaleString()} {salary.currency || 'UZS'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Remaining Amount</p>
                                    <p className="text-sm text-green-400">{(salary.remaining_amount || 0).toLocaleString()} {salary.currency || 'UZS'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Received Date</p>
                                    <p className="text-sm text-gray-300">{salary.received_date}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </motion.div>
    )
}

// ─── Overview / Dashboard Tab ──────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
    food: '#f59e0b',
    transport: '#6366f1',
    education: '#10b981',
    entertainment: '#ec4899',
    bills: '#ef4444',
    health: '#14b8a6',
    shopping: '#8b5cf6',
    other: '#64748b',
}

function fmt(n: number | undefined, currency = 'UZS') {
    if (n === undefined || n === null) return '—'
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' ' + currency
}

const OverviewTab: React.FC = () => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const [month, setMonth] = useState(currentMonth)

    const { data: summary, isLoading: summaryLoading } = useMonthlyFinancialSummary(month)
    const { data: netWorth, isLoading: nwLoading } = useNetWorth()
    const { data: trends, isLoading: trendsLoading } = useSpendingTrends(6)

    const trendsList: { period: string; total_income_funded: number; total_savings_funded: number }[] =
        (trends as any)?.trends ?? []

    const maxTrend = Math.max(...trendsList.map((t: any) => t.total_income_funded || 0), 1)

    const categoryEntries = Object.entries((summary as any)?.expense_by_category ?? {})
        .sort((a: any, b: any) => b[1] - a[1])

    return (
        <div className="space-y-8">
            {/* Month selector */}
            <div className="flex items-center gap-3">
                <label className="text-white/50 text-sm">Month</label>
                <input
                    type="month"
                    value={month}
                    onChange={e => setMonth(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:border-indigo-500/50"
                />
            </div>

            {/* Key metric cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                    {
                        label: 'Total Income', icon: <ArrowUpRight className="w-4 h-4" />,
                        value: fmt((summary as any)?.total_income), color: 'emerald',
                        loading: summaryLoading,
                    },
                    {
                        label: 'Expenses', icon: <ArrowDownRight className="w-4 h-4" />,
                        value: fmt((summary as any)?.total_expenses), color: 'red',
                        loading: summaryLoading,
                    },
                    {
                        label: 'Net Income', icon: <TrendingUp className="w-4 h-4" />,
                        value: fmt((summary as any)?.net_income), color: 'indigo',
                        loading: summaryLoading,
                    },
                    {
                        label: 'Net Worth', icon: <PiggyBank className="w-4 h-4" />,
                        value: fmt((netWorth as any)?.net_worth), color: 'amber',
                        loading: nwLoading,
                    },
                ].map(card => (
                    <div key={card.label} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                        <div className={`flex items-center gap-2 text-${card.color}-400 mb-2`}>
                            {card.icon}
                            <span className="text-xs font-medium uppercase tracking-wider text-white/50">{card.label}</span>
                        </div>
                        {card.loading
                            ? <div className="h-6 w-24 bg-white/8 rounded animate-pulse" />
                            : <p className={`text-lg font-semibold text-${card.color}-300`}>{card.value}</p>
                        }
                    </div>
                ))}
            </div>

            {/* Savings rate */}
            {!summaryLoading && (summary as any)?.savings_rate !== undefined && (
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-white/70">Savings Rate</p>
                        <span className={`text-sm font-semibold ${(summary as any).savings_rate >= 20 ? 'text-emerald-400' : (summary as any).savings_rate >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                            {(summary as any).savings_rate.toFixed(1)}%
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8">
                        <div
                            className={`h-2 rounded-full transition-all ${(summary as any).savings_rate >= 20 ? 'bg-emerald-500' : (summary as any).savings_rate >= 10 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min((summary as any).savings_rate, 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-white/30 mt-2">Target: 20%+</p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Spending by category */}
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                    <p className="text-sm font-medium text-white/70 mb-4 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-400" /> Spending by Category
                    </p>
                    {summaryLoading
                        ? <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-6 bg-white/8 rounded animate-pulse" />)}</div>
                        : categoryEntries.length === 0
                            ? <p className="text-white/30 text-sm text-center py-6">No expense data for this month</p>
                            : (
                                <div className="space-y-3">
                                    {categoryEntries.map(([cat, amt]: any) => {
                                        const total = categoryEntries.reduce((s: number, [, v]: any) => s + v, 0)
                                        const pct = total > 0 ? (amt / total) * 100 : 0
                                        return (
                                            <div key={cat}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs text-white/60 capitalize">{cat}</span>
                                                    <span className="text-xs text-white/80">{fmt(amt)}</span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-white/8">
                                                    <div
                                                        className="h-1.5 rounded-full"
                                                        style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] ?? '#64748b' }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                    }
                </div>

                {/* Spending trends (6 months) */}
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                    <p className="text-sm font-medium text-white/70 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-indigo-400" /> 6-Month Spending Trend
                    </p>
                    {trendsLoading
                        ? <div className="flex items-end gap-2 h-28">{[...Array(6)].map((_, i) => <div key={i} className="flex-1 bg-white/8 rounded-t animate-pulse" style={{ height: `${30 + i * 12}%` }} />)}</div>
                        : trendsList.length === 0
                            ? <p className="text-white/30 text-sm text-center py-6">No trend data available</p>
                            : (
                                <div className="flex items-end gap-2 h-28">
                                    {trendsList.slice().reverse().map((t: any) => {
                                        const h = Math.max((t.total_income_funded / maxTrend) * 100, 4)
                                        return (
                                            <div key={t.period} className="flex-1 flex flex-col items-center gap-1">
                                                <div
                                                    className="w-full rounded-t bg-indigo-500/60 hover:bg-indigo-500 transition-colors cursor-default"
                                                    style={{ height: `${h}%` }}
                                                    title={`${t.period}: ${fmt(t.total_income_funded)}`}
                                                />
                                                <span className="text-[10px] text-white/30">{t.period.slice(5)}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                    }
                </div>
            </div>

            {/* Net worth breakdown */}
            {!nwLoading && netWorth && (
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                    <p className="text-sm font-medium text-white/70 mb-4 flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-amber-400" /> Net Worth Breakdown
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-white/40 mb-1">Savings Accounts</p>
                            <p className="text-base font-semibold text-amber-300">{fmt((netWorth as any).breakdown?.savings_accounts)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-white/40 mb-1">Cash in Hand</p>
                            <p className="text-base font-semibold text-emerald-300">{fmt((netWorth as any).breakdown?.cash_in_hand)}</p>
                        </div>
                    </div>
                    {Object.keys((netWorth as any).savings_by_type ?? {}).length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/8">
                            <p className="text-xs text-white/40 mb-2">By Account Type</p>
                            <div className="flex flex-wrap gap-3">
                                {Object.entries((netWorth as any).savings_by_type).map(([type, bal]: any) => (
                                    <span key={type} className="text-xs px-2.5 py-1 rounded-lg bg-white/8 text-white/70 capitalize">
                                        {type}: {fmt(bal)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

const JobsTab: React.FC<{ personId: string }> = ({ personId }) => {
    const [showDeleted, setShowDeleted] = useState(false)
    const { data: jobsResponse, isLoading } = useJobsList(personId)
    const { data: deletedJobsResponse, isLoading: isDeletedLoading } = useDeletedJobsList(personId)
    const { mutate: deleteJob } = useJobDelete()

    const jobs = Array.isArray(jobsResponse) ? jobsResponse : []
    const deletedJobs = Array.isArray(deletedJobsResponse) ? deletedJobsResponse : []

    const displayJobs = showDeleted ? deletedJobs : jobs

    const handleDelete = (id: string | number) => {
        deleteJob(id)
    }

    if (isLoading || isDeletedLoading) {
        return <div className="text-gray-400 text-center py-8 flex justify-center items-center">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading jobs...
        </div>
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
        >
            <div className="flex justify-between items-center mb-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleted(!showDeleted)}
                    className={showDeleted ? 'border-red-500/50 text-red-400 bg-red-500/10' : ''}
                >
                    {showDeleted ? 'Show Active Jobs' : 'Show Deleted Jobs'}
                </Button>
                <JobFormModal personId={personId} />
            </div>
            <div className="grid gap-4">
                <AnimatePresence>
                    {displayJobs.map((job: Job) => (
                        <JobCard key={job.id} job={job} onDelete={handleDelete} />
                    ))}
                    {displayJobs.length === 0 && (
                        <div className="text-gray-500 text-center py-8">
                            {showDeleted ? 'No deleted jobs found.' : 'No jobs found. Add one to get started.'}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    )
}

const ExpenseFormModal: React.FC<{ personId: string | number }> = ({ personId }) => {
    const [open, setOpen] = useState(false)
    const { mutate: createExpense, isPending } = useExpenseCreate()
    const { data: salaryResponse } = useSalaryMonthsList(personId)
    const { data: jobsResponse } = useJobsList(personId)
    const salaries = Array.isArray(salaryResponse) ? salaryResponse : []
    const jobs = Array.isArray(jobsResponse) ? jobsResponse : []

    const salaryOptions = salaries.map((s: SalaryMonth) => {
        const job = jobs.find((j: Job) => j.id === s.job_id)
        if (job) {
            return {
                value: s.id.toString(),
                label: `${job.name} ${job.company} - ${s.net_amount.toLocaleString()} ${job.currency || 'UZS'} (${s.month})`
            }
        }
        return {
            value: s.id.toString(),
            label: `Unknown Job - ${s.net_amount.toLocaleString()} UZS (${s.month})`
        }
    })

    const [formData, setFormData] = useState({
        name: '',
        amount: 0,
        currency: 'UZS',
        category: 'food',
        subcategory: '',
        payment_type: 'card',
        date: new Date(),
        is_essential: false,
        is_recurring: false,
        recurrence_frequency: 'none',
        description: '',
        salary_month_id: salaries.length > 0 ? salaries[0].id : null as number | null
    })

    // Sync salary_month_id once salaries arrive (handles async load)
    React.useEffect(() => {
        if (salaries.length > 0 && !formData.salary_month_id) {
            setFormData(prev => ({ ...prev, salary_month_id: salaries[0].id }))
        }
    }, [salaries]) // eslint-disable-line react-hooks/exhaustive-deps

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const dataToSubmit = {
            ...formData,
            person_id: Number(personId),
            date: formData.date.toISOString().split('T')[0],
            recurrence_frequency: formData.is_recurring ? formData.recurrence_frequency : undefined,
            salary_month_id: formData.salary_month_id
        }

        createExpense(dataToSubmit, {
            onSuccess: () => {
                setOpen(false)
                setFormData({
                    name: '',
                    amount: 0,
                    currency: 'UZS',
                    category: 'food',
                    subcategory: '',
                    payment_type: 'card',
                    date: new Date(),
                    is_essential: false,
                    is_recurring: false,
                    recurrence_frequency: 'none',
                    description: '',
                    salary_month_id: salaries.length > 0 ? salaries[0].id : null
                })
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Expense
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[80vh] overflow-y-auto w-full max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white">Add New Expense</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormField label="Expense Name" required>
                        <TextInput
                            value={formData.name}
                            onChange={(value: string) => updateField('name', value)}
                            placeholder="e.g., Monthly Rent"
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Amount" required>
                            <NumberInput
                                value={formData.amount}
                                onChange={(value: number) => updateField('amount', value)}
                                placeholder="0"
                                min={0}
                            />
                        </FormField>
                        <FormField label="Currency">
                            <SelectInput
                                value={formData.currency}
                                onChange={(value: string) => updateField('currency', value)}
                                options={CURRENCY_OPTIONS}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Category">
                            <SelectInput
                                value={formData.category}
                                onChange={(value: string) => updateField('category', value)}
                                options={EXPENSE_CATEGORY_OPTIONS}
                            />
                        </FormField>
                        <FormField label="Subcategory">
                            <TextInput
                                value={formData.subcategory}
                                onChange={(value: string) => updateField('subcategory', value)}
                                placeholder="e.g., Online, Fast Food..."
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Payment Type">
                            <SelectInput
                                value={formData.payment_type}
                                onChange={(value: string) => updateField('payment_type', value)}
                                options={[
                                    { value: 'card', label: 'Card' },
                                    { value: 'cash', label: 'Cash' },
                                    { value: 'transfer', label: 'Transfer' }
                                ]}
                            />
                        </FormField>
                        <FormField label="Date">
                            <DatePicker
                                value={formData.date}
                                onChange={(date) => date && updateField('date', date)}
                            />
                        </FormField>
                    </div>

                    {salaryOptions.length > 0 && (
                        <FormField label="Salary Month">
                            <SelectInput
                                value={formData.salary_month_id?.toString() ?? ''}
                                onChange={(value: string) => updateField('salary_month_id', Number(value))}
                                options={salaryOptions}
                            />
                        </FormField>
                    )}

                    <FormField label="Description">
                        <TextareaInput
                            value={formData.description}
                            onChange={(value: string) => updateField('description', value)}
                            placeholder="Add any additional notes here..."
                        />
                    </FormField>

                    <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t border-[#2a2b36]">
                        <div className="flex gap-4 items-center">
                            <button
                                type="button"
                                onClick={() => updateField('is_essential', !formData.is_essential)}
                                className={`text-sm flex items-center gap-2 ${formData.is_essential ? 'text-green-400' : 'text-gray-400'}`}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.is_essential ? 'border-green-400 bg-green-400/20' : 'border-gray-500'}`}>
                                    {formData.is_essential && <div className="w-2 h-2 rounded bg-green-400" />}
                                </div>
                                Essential
                            </button>
                            <button
                                type="button"
                                onClick={() => updateField('is_recurring', !formData.is_recurring)}
                                className={`text-sm flex items-center gap-2 ${formData.is_recurring ? 'text-blue-400' : 'text-gray-400'}`}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.is_recurring ? 'border-blue-400 bg-blue-400/20' : 'border-gray-500'}`}>
                                    {formData.is_recurring && <div className="w-2 h-2 rounded bg-blue-400" />}
                                </div>
                                Recurring
                            </button>

                            {formData.is_recurring && (
                                <div className="w-32">
                                    <SelectInput
                                        value={formData.recurrence_frequency}
                                        onChange={(value: string) => updateField('recurrence_frequency', value)}
                                        options={[
                                            { value: 'none', label: 'None' },
                                            { value: 'daily', label: 'Daily' },
                                            { value: 'weekly', label: 'Weekly' },
                                            { value: 'monthly', label: 'Monthly' },
                                            { value: 'yearly', label: 'Yearly' }
                                        ]}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 ml-auto">
                            <CancelButton onClick={() => setOpen(false)} />
                            <SubmitButton isLoading={isPending}>
                                Add Expense
                            </SubmitButton>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

const EditExpenseButton: React.FC<{ expense: Expense; personId: string | number }> = ({ expense, personId }) => {
    const [open, setOpen] = useState(false)
    const { mutate: updateExpense, isPending } = useExpenseUpdate()
    const { data: salaryResponse } = useSalaryMonthsList(personId)
    const { data: jobsResponse } = useJobsList(personId)
    const salaries = Array.isArray(salaryResponse) ? salaryResponse : []
    const jobs = Array.isArray(jobsResponse) ? jobsResponse : []

    const salaryOptions = salaries.map((s: SalaryMonth) => {
        const job = jobs.find((j: Job) => j.id === s.job_id)
        if (job) {
            return {
                value: s.id.toString(),
                label: `${job.name} + ${job.company} - ${s.net_amount.toLocaleString()} ${job.currency || 'UZS'} (${s.month})`
            }
        }
        return {
            value: s.id.toString(),
            label: `Unknown Job - ${s.net_amount.toLocaleString()} UZS (${s.month})`
        }
    })

    const [formData, setFormData] = useState({
        name: expense.name || '',
        amount: expense.amount || 0,
        currency: expense.currency || 'UZS',
        category: expense.category || 'food',
        subcategory: expense.subcategory || '',
        payment_type: expense.payment_type || 'card',
        date: expense.date ? new Date(expense.date) : new Date(),
        is_essential: expense.is_essential || false,
        is_recurring: expense.is_recurring || false,
        recurrence_frequency: expense.recurrence_frequency || 'none',
        description: expense.description || '',
        salary_month_id: expense.salary_month_id || (salaries.length > 0 ? salaries[0].id : 1)
    })

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        updateExpense({
            id: expense.id,
            data: {
                ...formData,
                person_id: Number(personId),
                date: formData.date.toISOString().split('T')[0],
                recurrence_frequency: formData.is_recurring ? formData.recurrence_frequency : undefined,
                salary_month_id: formData.salary_month_id
            }
        }, {
            onSuccess: () => setOpen(false)
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2b36] rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                </button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[80vh] overflow-y-auto w-full max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white">Edit Expense</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormField label="Expense Name" required>
                        <TextInput
                            value={formData.name}
                            onChange={(value: string) => updateField('name', value)}
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Amount" required>
                            <NumberInput
                                value={formData.amount}
                                onChange={(value: number) => updateField('amount', value)}
                                placeholder="0"
                                min={0}
                            />
                        </FormField>
                        <FormField label="Currency">
                            <SelectInput
                                value={formData.currency}
                                onChange={(value: string) => updateField('currency', value)}
                                options={CURRENCY_OPTIONS}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Category">
                            <SelectInput
                                value={formData.category}
                                onChange={(value: string) => updateField('category', value)}
                                options={EXPENSE_CATEGORY_OPTIONS}
                            />
                        </FormField>
                        <FormField label="Subcategory">
                            <TextInput
                                value={formData.subcategory}
                                onChange={(value: string) => updateField('subcategory', value)}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Payment Type">
                            <SelectInput
                                value={formData.payment_type}
                                onChange={(value: string) => updateField('payment_type', value)}
                                options={[
                                    { value: 'card', label: 'Card' },
                                    { value: 'cash', label: 'Cash' },
                                    { value: 'transfer', label: 'Transfer' }
                                ]}
                            />
                        </FormField>
                        <FormField label="Date">
                            <DatePicker
                                value={formData.date}
                                onChange={(date) => date && updateField('date', date)}
                            />
                        </FormField>
                    </div>

                    <FormField label="Salary Month">
                        <SelectInput
                            value={formData.salary_month_id.toString()}
                            onChange={(value: string) => updateField('salary_month_id', Number(value))}
                            options={salaryOptions.length > 0 ? salaryOptions : [{ value: '1', label: 'Default Month' }]}
                        />
                    </FormField>

                    <FormField label="Description">
                        <TextareaInput
                            value={formData.description}
                            onChange={(value: string) => updateField('description', value)}
                        />
                    </FormField>

                    <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t border-[#2a2b36]">
                        <div className="flex gap-4 items-center">
                            <button
                                type="button"
                                onClick={() => updateField('is_essential', !formData.is_essential)}
                                className={`text-sm flex items-center gap-2 ${formData.is_essential ? 'text-green-400' : 'text-gray-400'}`}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.is_essential ? 'border-green-400 bg-green-400/20' : 'border-gray-500'}`}>
                                    {formData.is_essential && <div className="w-2 h-2 rounded bg-green-400" />}
                                </div>
                                Essential
                            </button>
                            <button
                                type="button"
                                onClick={() => updateField('is_recurring', !formData.is_recurring)}
                                className={`text-sm flex items-center gap-2 ${formData.is_recurring ? 'text-blue-400' : 'text-gray-400'}`}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.is_recurring ? 'border-blue-400 bg-blue-400/20' : 'border-gray-500'}`}>
                                    {formData.is_recurring && <div className="w-2 h-2 rounded bg-blue-400" />}
                                </div>
                                Recurring
                            </button>

                            {formData.is_recurring && (
                                <div className="w-32">
                                    <SelectInput
                                        value={formData.recurrence_frequency}
                                        onChange={(value: string) => updateField('recurrence_frequency', value)}
                                        options={[
                                            { value: 'none', label: 'None' },
                                            { value: 'daily', label: 'Daily' },
                                            { value: 'weekly', label: 'Weekly' },
                                            { value: 'monthly', label: 'Monthly' },
                                            { value: 'yearly', label: 'Yearly' }
                                        ]}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 ml-auto">
                            <CancelButton onClick={() => setOpen(false)} />
                            <SubmitButton isLoading={isPending}>
                                Save Changes
                            </SubmitButton>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

const DeleteExpenseButton: React.FC<{ expense: Expense; onDelete: (id: string | number) => void }> = ({ expense, onDelete }) => {
    const [open, setOpen] = useState(false)
    const { isPending } = useExpenseDelete()

    const handleDelete = async () => {
        await onDelete(expense.id)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="p-2 text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                </button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Delete Expense</DialogTitle>
                </DialogHeader>
                <p className="text-gray-400 my-4">
                    Are you sure you want to delete <span className="text-white">{expense.name}</span>? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Delete
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const ExpensesTab: React.FC<{ personId: string }> = ({ personId }) => {
    const [showDeleted, setShowDeleted] = useState(false)
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [searchQuery, setSearchQuery] = useState('')
    const { data: activeExpensesResponse, isLoading: isLoadingActive } = useExpensesList(personId)
    const { data: deletedExpensesResponse, isLoading: isLoadingDeleted } = useDeletedExpensesList(personId)
    const { mutate: deleteExpense } = useExpenseDelete()

    const expensesResponse = showDeleted ? deletedExpensesResponse : activeExpensesResponse
    const isLoading = showDeleted ? isLoadingDeleted : isLoadingActive
    const allExpenses = Array.isArray(expensesResponse) ? expensesResponse : []

    const expenses = allExpenses.filter((e: Expense) => {
        const matchesCategory = categoryFilter === 'all' || e.category?.toLowerCase() === categoryFilter
        const matchesSearch = !searchQuery || e.name?.toLowerCase().includes(searchQuery.toLowerCase()) || e.description?.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesCategory && matchesSearch
    })

    const handleDelete = (id: string | number) => {
        deleteExpense(id)
    }

    if (isLoading) {
        return <div className="text-gray-400 text-center py-8">Loading expenses...</div>
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
        >
            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-3">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="w-40 bg-[#1a1b26] border-[#2a2b36] text-white">
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1b26] border-[#2a2b36]">
                            <SelectItem value="all">All Categories</SelectItem>
                            <SelectItem value="food">Food</SelectItem>
                            <SelectItem value="transport">Transport</SelectItem>
                            <SelectItem value="education">Education</SelectItem>
                            <SelectItem value="entertainment">Entertainment</SelectItem>
                            <SelectItem value="bills">Bills</SelectItem>
                            <SelectItem value="health">Health</SelectItem>
                            <SelectItem value="shopping">Shopping</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search expenses..."
                        className="bg-[#1a1b26] border-[#2a2b36] text-white"
                    />
                    <Button
                        variant="outline"
                        onClick={() => setShowDeleted(!showDeleted)}
                        className={showDeleted ? "bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30" : "border-[#2a2b36] hover:bg-[#2a2b36] text-gray-400"}
                    >
                        {showDeleted ? "Show Active" : "Show Deleted"}
                    </Button>
                </div>
                <ExpenseFormModal personId={personId} />
            </div>

            <div className="bg-[#1a1b26] border border-[#2a2b36] rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-[#2a2b36]">
                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-400">Name</th>
                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-400">Amount</th>
                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-400">Category</th>
                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-400">Info</th>
                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-400">Date</th>
                            <th className="px-6 py-4 text-right text-sm font-semibold text-gray-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expenses.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                    No expenses found. Add one to get started.
                                </td>
                            </tr>
                        ) : null}
                        {expenses.map((expense: Expense) => (
                            <motion.tr
                                key={expense.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="border-b border-[#2a2b36] hover:bg-[#2a2b36]/30 transition-colors"
                            >
                                <td className="px-6 py-4 text-white">
                                    <div className="font-medium">{expense.name}</div>
                                    <div className="text-xs text-gray-500 max-w-[200px] truncate">{expense.description || expense.subcategory}</div>
                                </td>
                                <td className="px-6 py-4 text-white font-semibold flex items-center gap-2">
                                    {expense.currency === 'USD' ? '$' : ''}{expense.amount?.toLocaleString()} {expense.currency}
                                    {expense.is_recurring && (
                                        <Badge variant="outline" className="border-blue-500/50 text-blue-400 bg-blue-500/10 text-[10px] leading-tight px-1.5 py-0 h-4">
                                            {expense.recurrence_frequency}
                                        </Badge>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <Badge variant="secondary" className={`capitalize ${categoryColors[expense.category?.toLowerCase()]?.badge || 'bg-gray-500/20 text-gray-300'}`}>
                                        {expense.category}
                                    </Badge>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="text-sm text-gray-300 capitalize">{expense.payment_type || 'card'}</div>
                                        {expense.is_essential && (
                                            <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10 text-[10px] w-max leading-tight px-1.5 py-0 h-4">
                                                Essential
                                            </Badge>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-gray-400">
                                    {expense.date ? new Date(expense.date).toLocaleDateString() : ''}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {!showDeleted ? (
                                            <>
                                                <EditExpenseButton expense={expense} personId={personId} />
                                                <DeleteExpenseButton expense={expense} onDelete={handleDelete} />
                                            </>
                                        ) : (
                                            <Badge variant="outline" className="text-red-400 border-red-500/30 bg-red-500/10">Deleted</Badge>
                                        )}
                                    </div>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    )
}

const DeleteBudgetButton: React.FC<{ budget: Budget; onDelete: (id: string | number) => void }> = ({ budget, onDelete }) => {
    const [open, setOpen] = useState(false)
    const { isPending } = useBudgetDelete() // Manual deletion handling

    const handleDelete = async () => {
        await onDelete(budget.id)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Delete Budget</DialogTitle>
                </DialogHeader>
                <p className="text-gray-400 my-4">
                    Are you sure you want to delete the budget for <span className="text-white">{budget.category}</span> ({budget.period})? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Delete
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const BudgetFormModal: React.FC<{ personId: string; budgetToEdit?: Budget }> = ({ personId, budgetToEdit }) => {
    const [open, setOpen] = useState(false)
    const { mutate: createBudget, isPending: isCreating } = useBudgetCreate()
    const { mutate: updateBudget, isPending: isUpdating } = useBudgetUpdate()

    const isEditing = !!budgetToEdit
    const isPending = isCreating || isUpdating

    const [formData, setFormData] = useState({
        allocated_amount: budgetToEdit?.allocated_amount || 0,
        category: budgetToEdit?.category || 'food',
        notes: budgetToEdit?.notes || '',
        period: budgetToEdit?.period || new Date().toISOString().substring(0, 7), // YYYY-MM
        period_type: budgetToEdit?.period_type || 'monthly'
    })

    // Reset when modal opens for editing
    React.useEffect(() => {
        if (open && isEditing) {
            setFormData({
                allocated_amount: budgetToEdit.allocated_amount || 0,
                category: budgetToEdit.category || 'food',
                notes: budgetToEdit.notes || '',
                period: budgetToEdit.period || new Date().toISOString().substring(0, 7),
                period_type: budgetToEdit.period_type || 'monthly'
            })
        } else if (open && !isEditing) {
            setFormData({
                allocated_amount: 0,
                category: 'food',
                notes: '',
                period: new Date().toISOString().substring(0, 7),
                period_type: 'monthly'
            })
        }
    }, [open, isEditing, budgetToEdit])

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const dataToSubmit = {
            ...formData,
            allocated_amount: Number(formData.allocated_amount),
            person_id: Number(personId)
        }

        if (isEditing) {
            updateBudget({ id: budgetToEdit.id, data: dataToSubmit }, {
                onSuccess: () => setOpen(false)
            })
        } else {
            createBudget(dataToSubmit, {
                onSuccess: () => setOpen(false)
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {isEditing ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#2a2b36] rounded-full">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button className="bg-gradient-to-r from-green-500 to-emerald-500">
                        <Plus className="w-4 h-4 mr-2" />
                        Set Budget
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-white">{isEditing ? 'Edit Budget' : 'Set New Budget'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Category" required>
                            <SelectInput
                                value={formData.category}
                                onChange={(value: string) => updateField('category', value)}
                                options={EXPENSE_CATEGORY_OPTIONS}
                            />
                        </FormField>
                        <FormField label="Amount" required>
                            <NumberInput
                                value={formData.allocated_amount}
                                onChange={(value: number) => updateField('allocated_amount', value)}
                                placeholder="0"
                                min={0}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Period (YYYY-MM)" required>
                            <TextInput
                                value={formData.period}
                                onChange={(value: string) => updateField('period', value)}
                                placeholder="2026-01"
                            />
                        </FormField>
                        <FormField label="Period Type" required>
                            <SelectInput
                                value={formData.period_type}
                                onChange={(value: string) => updateField('period_type', value)}
                                options={[
                                    { value: 'monthly', label: 'Monthly' },
                                    { value: 'weekly', label: 'Weekly' },
                                    { value: 'yearly', label: 'Yearly' }
                                ]}
                            />
                        </FormField>
                    </div>

                    <FormField label="Notes">
                        <TextareaInput
                            value={formData.notes || ''}
                            onChange={(value: string) => updateField('notes', value)}
                            placeholder="Optional notes"
                        />
                    </FormField>

                    <div className="flex justify-end pt-4 border-t border-[#2a2b36]">
                        <div className="flex gap-3">
                            <CancelButton onClick={() => setOpen(false)} />
                            <SubmitButton isLoading={isPending}>
                                {isEditing ? 'Save Changes' : 'Create Budget'}
                            </SubmitButton>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

const BudgetsTab: React.FC<{ personId: string }> = ({ personId }) => {
    const [showDeleted, setShowDeleted] = useState(false)
    const { data: activeBudgetsResponse, isLoading: isActiveLoading } = useBudgetsList(personId)
    const { data: deletedBudgetsResponse, isLoading: isDeletedLoading } = useDeletedBudgetsList(personId)
    const { mutate: deleteBudget } = useBudgetDelete()

    const isLoading = showDeleted ? isDeletedLoading : isActiveLoading
    const budgetsResponse = showDeleted ? deletedBudgetsResponse : activeBudgetsResponse

    // Fallback appropriately if the query hasn't fetched yet
    const budgets = Array.isArray(budgetsResponse) ? budgetsResponse : []

    const handleDelete = (id: string | number) => {
        deleteBudget(id)
    }

    if (isLoading) {
        return <div className="text-gray-400 text-center py-8">Loading budgets...</div>
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
        >
            <div className="flex justify-between items-center mb-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className={`text-sm ${showDeleted ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:text-white'}`}
                    onClick={() => setShowDeleted(!showDeleted)}
                >
                    {showDeleted ? 'View Active' : 'View Deleted'}
                </Button>
                {!showDeleted && <BudgetFormModal personId={personId} />}
            </div>
            {budgets.length === 0 ? (
                <div className="text-gray-500 text-center py-8 bg-[#1a1b26] border border-[#2a2b36] rounded-xl">
                    No budgets found.
                </div>
            ) : (
                <div className="grid gap-4">
                    {budgets.map(budget => {
                        const percentage = budget.allocated_amount > 0 ? (budget.spent_amount / budget.allocated_amount) * 100 : 0
                        const isOverBudget = budget.spent_amount > budget.allocated_amount

                        return (
                            <motion.div key={budget.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <Card className={`bg-[#1a1b26] border border-[#2a2b36] p-6 rounded-xl relative group ${showDeleted ? 'opacity-70' : ''}`}>
                                    {showDeleted && (
                                        <div className="absolute -top-3 left-4 bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded border border-red-500/30">
                                            Deleted
                                        </div>
                                    )}
                                    {!showDeleted && (
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                            <BudgetFormModal personId={personId} budgetToEdit={budget} />
                                            <DeleteBudgetButton budget={budget} onDelete={handleDelete} />
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center mb-3 pr-20">
                                        <div className="flex flex-col">
                                            <h3 className="text-lg font-semibold text-white capitalize">{budget.category}</h3>
                                            <span className="text-xs text-gray-400">{budget.period} • {budget.period_type}</span>
                                        </div>
                                        <span className={`text-sm font-semibold ${isOverBudget ? 'text-red-400' : 'text-green-400'}`}>
                                            {isOverBudget ? `-${Math.abs(budget.remaining_amount).toLocaleString()} UZS` : `${Math.abs(budget.remaining_amount).toLocaleString()} UZS left`}
                                        </span>
                                    </div>
                                    <div className="w-full bg-[#0f0f1a] rounded-full h-3 overflow-hidden mb-2">
                                        <motion.div
                                            className={`h-full rounded-full ${isOverBudget ? 'bg-red-500' : 'bg-gradient-to-r from-green-500 to-emerald-500'}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(percentage, 100)}%` }}
                                            transition={{ duration: 0.6 }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>{budget.spent_amount.toLocaleString()} UZS spent</span>
                                        <span>{budget.allocated_amount.toLocaleString()} UZS allocated</span>
                                    </div>
                                    {budget.notes && (
                                        <p className="mt-3 text-xs text-gray-500 italic max-w-full truncate">{budget.notes}</p>
                                    )}
                                </Card>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </motion.div>
    )
}

const DeleteIncomeSourceButton: React.FC<{ source: IncomeSource; onDelete: (id: string | number) => void }> = ({ source, onDelete }) => {
    const [open, setOpen] = useState(false)
    const { isPending } = useIncomeSourceDelete()

    const handleDelete = async () => {
        await onDelete(source.id)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Delete Income Source</DialogTitle>
                </DialogHeader>
                <p className="text-gray-400 my-4">
                    Are you sure you want to delete the income source <span className="text-white">{source.source_name}</span>? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Delete
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const IncomeSourceFormModal: React.FC<{ personId: string; sourceToEdit?: IncomeSource }> = ({ personId, sourceToEdit }) => {
    const [open, setOpen] = useState(false)
    const { mutate: createSource, isPending: isCreating } = useIncomeSourceCreate()
    const { mutate: updateSource, isPending: isUpdating } = useIncomeSourceUpdate()

    const isEditing = !!sourceToEdit
    const isPending = isCreating || isUpdating

    const [formData, setFormData] = useState({
        source_name: sourceToEdit?.source_name || '',
        source_type: sourceToEdit?.source_type || 'freelance',
        amount: sourceToEdit?.amount || 0,
        currency: sourceToEdit?.currency || 'UZS',
        frequency: sourceToEdit?.frequency || 'one-time',
        received_date: sourceToEdit?.received_date ? new Date(sourceToEdit.received_date) : new Date(),
        description: sourceToEdit?.description || ''
    })

    React.useEffect(() => {
        if (open && isEditing) {
            setFormData({
                source_name: sourceToEdit.source_name || '',
                source_type: sourceToEdit.source_type || 'freelance',
                amount: sourceToEdit.amount || 0,
                currency: sourceToEdit.currency || 'UZS',
                frequency: sourceToEdit.frequency || 'one-time',
                received_date: sourceToEdit.received_date ? new Date(sourceToEdit.received_date) : new Date(),
                description: sourceToEdit.description || ''
            })
        } else if (open && !isEditing) {
            setFormData({
                source_name: '',
                source_type: 'freelance',
                amount: 0,
                currency: 'UZS',
                frequency: 'one-time',
                received_date: new Date(),
                description: ''
            })
        }
    }, [open, isEditing, sourceToEdit])

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const dataToSubmit = {
            ...formData,
            amount: Number(formData.amount),
            person_id: Number(personId),
            received_date: `${formData.received_date.getFullYear()}-${String(formData.received_date.getMonth() + 1).padStart(2, '0')}-${String(formData.received_date.getDate()).padStart(2, '0')}`
        }

        if (isEditing) {
            updateSource({ id: sourceToEdit.id, data: dataToSubmit }, {
                onSuccess: () => setOpen(false)
            })
        } else {
            createSource(dataToSubmit, {
                onSuccess: () => setOpen(false)
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {isEditing ? (
                    <Button variant="ghost" size="icon" className="absolute top-4 right-14 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-full">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button className="bg-gradient-to-r from-green-500 to-emerald-500">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Income
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-white">{isEditing ? 'Edit Income Source' : 'Add New Income Source'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Source Name">
                            <TextInput
                                value={formData.source_name}
                                onChange={(value: string) => updateField('source_name', value)}
                                placeholder="e.g. Freelance Web Development"
                                required
                            />
                        </FormField>
                        <FormField label="Source Type">
                            <SelectInput
                                value={formData.source_type}
                                onChange={(value: string) => updateField('source_type', value)}
                                options={[
                                    { value: 'salary', label: 'Salary' },
                                    { value: 'freelance', label: 'Freelance' },
                                    { value: 'passive', label: 'Passive Income' },
                                    { value: 'gift', label: 'Gift' },
                                    { value: 'other', label: 'Other' }
                                ]}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Amount">
                            <NumberInput
                                value={formData.amount}
                                onChange={(value: number) => updateField('amount', value)}
                                required
                            />
                        </FormField>
                        <FormField label="Currency">
                            <SelectInput
                                value={formData.currency}
                                onChange={(value: string) => updateField('currency', value)}
                                options={CURRENCY_OPTIONS}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Frequency">
                            <SelectInput
                                value={formData.frequency}
                                onChange={(value: string) => updateField('frequency', value)}
                                options={[
                                    { value: 'one-time', label: 'One-time' },
                                    { value: 'weekly', label: 'Weekly' },
                                    { value: 'monthly', label: 'Monthly' },
                                    { value: 'yearly', label: 'Yearly' }
                                ]}
                            />
                        </FormField>
                        <FormField label="Received Date">
                            <DatePicker
                                value={formData.received_date}
                                onChange={date => date && updateField('received_date', date)}
                            />
                        </FormField>
                    </div>

                    <FormField label="Description">
                        <TextareaInput
                            value={formData.description}
                            onChange={(value: string) => updateField('description', value)}
                            placeholder="Optional notes about this income source..."
                        />
                    </FormField>

                    <div className="flex justify-end pt-4 border-t border-[#2a2b36]">
                        <div className="flex gap-3">
                            <CancelButton onClick={() => setOpen(false)} />
                            <SubmitButton isLoading={isPending}>
                                {isEditing ? 'Save Changes' : 'Create Income Source'}
                            </SubmitButton>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

const IncomeSourcesTab: React.FC<{ personId: string }> = ({ personId }) => {
    const [showDeleted, setShowDeleted] = useState(false)
    const { data: activeSourcesResponse, isLoading: isActiveLoading } = useIncomeSourcesList(personId)
    const { data: deletedSourcesResponse, isLoading: isDeletedLoading } = useDeletedIncomeSourcesList(personId)
    const { mutate: deleteSource } = useIncomeSourceDelete()

    const isLoading = showDeleted ? isDeletedLoading : isActiveLoading
    const sourcesResponse = showDeleted ? deletedSourcesResponse : activeSourcesResponse

    const sources = Array.isArray(sourcesResponse) ? sourcesResponse : []

    const handleDelete = (id: string | number) => {
        deleteSource(id)
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
        >
            <div className="flex justify-between items-center mb-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className={`text-sm ${showDeleted ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:text-white'}`}
                    onClick={() => setShowDeleted(!showDeleted)}
                >
                    {showDeleted ? 'View Active' : 'View Deleted'}
                </Button>
                {!showDeleted && <IncomeSourceFormModal personId={personId} />}
            </div>

            {sources.length === 0 ? (
                <div className="text-gray-500 text-center py-8 bg-[#1a1b26] border border-[#2a2b36] rounded-xl">
                    No income sources found.
                </div>
            ) : (
                <div className="grid gap-4">
                    {sources.map((source: IncomeSource, index: number) => (
                        <motion.div
                            key={source.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <Card className={`bg-[#1a1b26] border border-[#2a2b36] p-6 rounded-xl relative group transition-all ${showDeleted ? 'opacity-70' : 'hover:border-[#3a3b46]'}`}>
                                {showDeleted && (
                                    <div className="absolute -top-3 left-4 bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded border border-red-500/30">
                                        Deleted
                                    </div>
                                )}
                                {!showDeleted && (
                                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <IncomeSourceFormModal personId={personId} sourceToEdit={source} />
                                        <DeleteIncomeSourceButton source={source} onDelete={handleDelete} />
                                    </div>
                                )}
                                <div className="flex justify-between items-start mb-4 pr-20">
                                    <div>
                                        <h3 className="text-lg font-semibold text-white">{source.source_name}</h3>
                                        <p className="text-sm text-gray-400 capitalize">{source.source_type}</p>
                                    </div>
                                    <Badge variant="secondary" className="capitalize">{source.frequency}</Badge>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Amount</span>
                                        <span className="text-white font-semibold">{source.amount.toLocaleString()} {source.currency}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Received On</span>
                                        <span className="text-gray-300">{new Date(source.received_date).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                {source.description && (
                                    <p className="mt-4 text-xs text-gray-500 italic max-w-full truncate">{source.description}</p>
                                )}
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}
        </motion.div>
    )
}

const SavingsFormModal: React.FC<{ personId: string; accountToEdit?: SavingsAccount }> = ({ personId, accountToEdit }) => {
    const [open, setOpen] = useState(false)
    const { mutate: createAccount, isPending: isCreating } = useSavingsCreate()
    const { mutate: updateAccount, isPending: isUpdating } = useSavingsUpdate()

    const isEditing = !!accountToEdit

    const defaultState = {
        account_name: '',
        account_type: 'savings',
        currency: 'UZS',
        initial_amount: 0,
        target_amount: 0,
        interest_rate: 0,
        start_date: new Date().toISOString().split('T')[0],
        maturity_date: '',
        risk_level: 'low',
        platform: '',
        notes: '',
    }

    const [formData, setFormData] = useState(defaultState)

    useEffect(() => {
        if (open) {
            if (isEditing && accountToEdit) {
                setFormData({
                    account_name: accountToEdit.account_name,
                    account_type: accountToEdit.account_type,
                    currency: accountToEdit.currency || 'UZS',
                    initial_amount: accountToEdit.initial_amount,
                    target_amount: accountToEdit.target_amount,
                    interest_rate: accountToEdit.interest_rate,
                    start_date: accountToEdit.start_date ? new Date(accountToEdit.start_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    maturity_date: accountToEdit.maturity_date ? new Date(accountToEdit.maturity_date).toISOString().split('T')[0] : '',
                    risk_level: accountToEdit.risk_level || 'low',
                    platform: accountToEdit.platform || '',
                    notes: accountToEdit.notes || '',
                })
            } else {
                setFormData(defaultState)
            }
        }
    }, [open, isEditing, accountToEdit])

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (isEditing && accountToEdit) {
            const updatePayload = {
                ...formData,
                person_id: parseInt(personId),
                start_date: new Date(formData.start_date).toISOString(),
                maturity_date: formData.maturity_date ? new Date(formData.maturity_date).toISOString() : undefined,
            }
            updateAccount({ id: accountToEdit.id, data: updatePayload }, {
                onSuccess: () => setOpen(false)
            })
        } else {
            const createPayload = {
                account_name: formData.account_name,
                account_type: formData.account_type,
                currency: formData.currency,
                initial_amount: Number(formData.initial_amount),
                interest_rate: Number(formData.interest_rate),
                platform: formData.platform,
                risk_level: formData.risk_level,
                start_date: formData.start_date,
                target_amount: Number(formData.target_amount),
            }
            createAccount(createPayload, {
                onSuccess: () => setOpen(false)
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {isEditing ? (
                    <Button variant="ghost" size="icon" className="absolute top-4 right-14 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-full">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button className="bg-gradient-to-r from-green-500 to-emerald-500">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Account
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-white">{isEditing ? 'Edit Savings Account' : 'Add New Account'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Account Name">
                            <TextInput
                                value={formData.account_name}
                                onChange={(value: string) => updateField('account_name', value)}
                                placeholder="e.g. Emergency Fund"
                                required
                            />
                        </FormField>
                        <FormField label="Account Type">
                            <SelectInput
                                value={formData.account_type}
                                onChange={(value: string) => updateField('account_type', value)}
                                options={[
                                    { value: 'savings', label: 'Savings' },
                                    { value: 'checking', label: 'Checking' },
                                    { value: 'investment', label: 'Investment' },
                                    { value: 'cash', label: 'Cash' }
                                ]}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Platform / Bank">
                            <TextInput
                                value={formData.platform}
                                onChange={(value: string) => updateField('platform', value)}
                                placeholder="e.g. Robinhood, NBU"
                            />
                        </FormField>
                        <FormField label="Risk Level">
                            <SelectInput
                                value={formData.risk_level}
                                onChange={(value: string) => updateField('risk_level', value)}
                                options={[
                                    { value: 'low', label: 'Low Risk' },
                                    { value: 'medium', label: 'Medium Risk' },
                                    { value: 'high', label: 'High Risk' }
                                ]}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Initial Amount">
                            <NumberInput
                                value={formData.initial_amount}
                                onChange={(value: number) => updateField('initial_amount', value)}
                            />
                        </FormField>
                        <FormField label="Target Amount">
                            <NumberInput
                                value={formData.target_amount}
                                onChange={(value: number) => updateField('target_amount', value)}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Interest Rate (%)">
                            <NumberInput
                                value={formData.interest_rate}
                                onChange={(value: number) => updateField('interest_rate', value)}
                            />
                        </FormField>
                        <FormField label="Currency">
                            <SelectInput
                                value={formData.currency}
                                onChange={(value: string) => updateField('currency', value)}
                                options={[
                                    { value: 'UZS', label: 'UZS' },
                                    { value: 'USD', label: 'USD' }
                                ]}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Start Date">
                            <DatePicker
                                value={formData.start_date ? new Date(formData.start_date) : undefined}
                                onChange={(date) => date && updateField('start_date', date.toISOString().split('T')[0])}
                            />
                        </FormField>
                        <FormField label="Maturity Date">
                            <DatePicker
                                value={formData.maturity_date ? new Date(formData.maturity_date) : undefined}
                                onChange={(date) => date && updateField('maturity_date', date.toISOString().split('T')[0])}
                            />
                        </FormField>
                    </div>

                    <FormField label="Notes">
                        <TextareaInput
                            value={formData.notes || ''}
                            onChange={(value: string) => updateField('notes', value)}
                            placeholder="Additional information..."
                        />
                    </FormField>

                    <div className="flex justify-end gap-3 pt-4 border-t border-[#2a2b36]">
                        <CancelButton onClick={() => setOpen(false)} />
                        <SubmitButton isLoading={isCreating || isUpdating}>
                            {isEditing ? 'Update Account' : 'Create Account'}
                        </SubmitButton>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

const DeleteSavingsButton: React.FC<{ account: SavingsAccount, onDelete: (id: string | number) => void }> = ({ account, onDelete }) => {
    const [open, setOpen] = useState(false)
    const { isPending } = useSavingsDelete()

    const handleDelete = async () => {
        await onDelete(account.id)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Delete Savings Account</DialogTitle>
                </DialogHeader>
                <p className="text-gray-400 mt-2">
                    Are you sure you want to delete {account.account_name}? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3 mt-6">
                    <Button variant="outline" onClick={() => setOpen(false)} className="border-[#2a2b36] text-white hover:bg-[#2a2b36]">
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={isPending}
                        className="bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white"
                        onClick={handleDelete}
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Delete
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const SavingsTab: React.FC<{ personId: string }> = ({ personId }) => {
    const [showDeleted, setShowDeleted] = useState(false)
    const { data: activeAccountsResponse, isLoading: isActiveLoading } = useSavingsList(personId)
    const { data: deletedAccountsResponse, isLoading: isDeletedLoading } = useDeletedSavingsList(personId)
    const { mutate: deleteAccount } = useSavingsDelete()
    const router = useRouter()

    const isLoading = showDeleted ? isDeletedLoading : isActiveLoading
    const accountsResponse = showDeleted ? deletedAccountsResponse : activeAccountsResponse

    const accounts = Array.isArray(accountsResponse) ? accountsResponse : []

    const handleDelete = (id: string | number) => {
        deleteAccount(id)
    }

    const riskColors: Record<string, string> = {
        low: 'bg-green-500/20 text-green-300',
        medium: 'bg-yellow-500/20 text-yellow-300',
        high: 'bg-red-500/20 text-red-300',
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
        >
            <div className="flex justify-between items-center mb-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className={`text-sm ${showDeleted ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:text-white'}`}
                    onClick={() => setShowDeleted(!showDeleted)}
                >
                    {showDeleted ? 'View Active' : 'View Deleted'}
                </Button>
                {!showDeleted && <SavingsFormModal personId={personId} />}
            </div>

            {accounts.length === 0 ? (
                <div className="text-gray-500 text-center py-8 bg-[#1a1b26] border border-[#2a2b36] rounded-xl">
                    No savings accounts found.
                </div>
            ) : (
                <div className="grid gap-4">
                    {accounts.map((account: SavingsAccount, index: number) => {
                        const percentage = account.target_amount > 0 ? (account.current_balance / account.target_amount) * 100 : 0

                        return (
                            <motion.div
                                key={account.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                <Card className={`bg-[#1a1b26] border border-[#2a2b36] p-6 rounded-xl relative group transition-all ${showDeleted ? 'opacity-70' : 'hover:border-[#3a3b46]'}`}>
                                    {showDeleted && (
                                        <div className="absolute -top-3 left-4 bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded border border-red-500/30">
                                            Deleted
                                        </div>
                                    )}
                                    {!showDeleted && (
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                            <SavingsFormModal personId={personId} accountToEdit={account} />
                                            <DeleteSavingsButton account={account} onDelete={handleDelete} />
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start mb-4 pr-20">
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">{account.account_name}</h3>
                                            <p className="text-sm text-gray-400 capitalize">{account.account_type}</p>
                                        </div>
                                        <Badge className={`capitalize ${riskColors[account.risk_level] || 'bg-gray-500/20 text-gray-300'}`}>
                                            {account.risk_level} risk
                                        </Badge>
                                    </div>

                                    <div className="space-y-3 mb-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400">Balance</span>
                                            <span className="text-white font-semibold text-lg">{account.current_balance.toLocaleString()} {account.currency}</span>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="text-gray-400">Target</span>
                                                <span className="text-gray-300">{account.target_amount.toLocaleString()} {account.currency}</span>
                                            </div>
                                            <div className="w-full bg-[#0f0f1a] rounded-full h-3 overflow-hidden">
                                                <motion.div
                                                    className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(percentage, 100)}%` }}
                                                    transition={{ duration: 0.6 }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>{Math.round(percentage)}% completed</span>
                                            <span className="capitalize">{account.platform}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 text-xs mt-4 pt-4 border-t border-[#2a2b36]/50">
                                        <div className="flex flex-col">
                                            <span className="text-gray-500">Interest</span>
                                            <span className="text-gray-300">{account.interest_rate}%</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-gray-500">Created</span>
                                            <span className="text-gray-300">{new Date(account.start_date).toLocaleDateString()}</span>
                                        </div>
                                        {account.maturity_date && (
                                            <div className="flex flex-col">
                                                <span className="text-gray-500">Maturity</span>
                                                <span className="text-gray-300">{new Date(account.maturity_date).toLocaleDateString()}</span>
                                            </div>
                                        )}
                                        {!showDeleted && (
                                            <button
                                                onClick={() => router.push(`/platform/${account.id}/savings`)}
                                                className="ml-auto text-blue-400 hover:text-blue-300 text-xs underline underline-offset-2 transition-colors"
                                            >
                                                Open Profile →
                                            </button>
                                        )}
                                    </div>
                                    {account.notes && (
                                        <p className="mt-3 text-xs text-gray-500 italic max-w-full truncate">{account.notes}</p>
                                    )}
                                </Card>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </motion.div>
    )
}

// Main Page Component
export default function FinancesPage() {
    const params = useParams<{ id: string }>()
    const [activeTab, setActiveTab] = useState('overview')

    // Default to current month, e.g., "2024-02"
    // For now, let's hardcode a month to test or use current date
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const { data: summary, isLoading: loading } = useMonthlyFinancialSummary(currentMonth)

    const totalBalance = summary ? summary.net_income : 0
    const monthlyIncome = summary ? summary.total_income : 0
    const monthlyExpenses = summary ? summary.total_expenses : 0
    const savingsRate = summary ? summary.savings_rate : 0

    return (
        <div className="min-h-screen bg-[#0a0a0f] p-8">
            <div className="max-w-7xl mx-auto">
                <FinancesHeader id={params.id} />

                {/* Overview Cards */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
                >
                    <OverviewCard
                        label="Net Balance"
                        value={`${totalBalance.toLocaleString()} UZS`}
                        delay={0}
                        isLoading={loading}
                    />
                    <OverviewCard
                        label="Monthly Income"
                        value={`${monthlyIncome.toLocaleString()} UZS`}
                        delay={1}
                        isLoading={loading}
                    />
                    <OverviewCard
                        label="Monthly Expenses"
                        value={`${monthlyExpenses.toLocaleString()} UZS`}
                        delay={2}
                        isLoading={loading}
                    />
                    <OverviewCard
                        label="Savings Rate"
                        value={`${savingsRate}%`}
                        delay={3}
                        isLoading={loading}
                    />
                </motion.div>

                {/* Tabs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="bg-[#1a1b26] border border-[#2a2b36] mb-8">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="jobs">Jobs</TabsTrigger>
                            <TabsTrigger value="salary">Salary</TabsTrigger>
                            <TabsTrigger value="expenses">Expenses</TabsTrigger>
                            <TabsTrigger value="budgets">Budgets</TabsTrigger>
                            <TabsTrigger value="income">Income Sources</TabsTrigger>
                            <TabsTrigger value="savings">Savings</TabsTrigger>
                        </TabsList>

                        <AnimatePresence mode="wait">
                            <TabsContent value="overview" key="overview">
                                <OverviewTab />
                            </TabsContent>
                            <TabsContent value="jobs" key="jobs">
                                <JobsTab personId={params.id} />
                            </TabsContent>
                            <TabsContent value="salary" key="salary">
                                <SalaryTab personId={params.id} />
                            </TabsContent>
                            <TabsContent value="expenses" key="expenses">
                                <ExpensesTab personId={params.id} />
                            </TabsContent>
                            <TabsContent value="budgets" className="mt-0">
                                <BudgetsTab personId={params.id as string} />
                            </TabsContent>
                            <TabsContent value="income" key="income">
                                <IncomeSourcesTab personId={params.id as string} />
                            </TabsContent>
                            <TabsContent value="savings" key="savings">
                                <SavingsTab personId={params.id as string} />
                            </TabsContent>
                        </AnimatePresence>
                    </Tabs>
                </motion.div>
            </div>
        </div>
    )
}
