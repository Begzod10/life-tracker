'use client'

import React, { useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { format, parse } from 'date-fns'
import { Edit, Edit2, Trash2, Repeat, Star, Plus, LayoutGrid, LayoutList, Briefcase, Building2, Calendar, DollarSign, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useSalaryMonth, useSalaryMonthDelete } from '@/lib/hooks/use-salary'
import { useExpensesBySalaryMonth, useExpenseCreate, useExpenseUpdate, useExpenseDelete } from '@/lib/hooks/use-expenses'
import { useJob } from '@/lib/hooks/use-jobs'
import { FormField, TextInput, TextareaInput, SelectInput, NumberInput, DatePicker, SubmitButton, CancelButton } from '@/components/modals/form-components'

// Types
type SalaryMonthData = {
    id: number
    job_id: number
    person_id: number
    month: string
    salary_amount: number
    deductions: number
    net_amount: number
    received_date: string | null
    remaining_amount: number
    total_spent: number
    currency: string
}

type JobData = {
    id: number
    name: string
    company: string
    employment_type: string
    currency: string
    salary: number
    department?: string
    active: boolean
    start_date: string
    end_date?: string | null
    notes?: string
}

type Expense = {
    id: number
    person_id: number
    salary_month_id: number
    saving_id: number
    saving_transaction_id: number
    name: string
    description: string
    amount: number
    currency: string
    category: string
    subcategory: string
    payment_type: string
    payment_method: string
    date: string
    is_recurring: boolean
    recurrence_frequency: string
    is_essential: boolean
    receipt_photo: string
    location: string
    tags: string
    source: 'salary' | 'savings' | 'other'
    deleted: boolean
    created_at: string
    updated_at: string
}

// Components
function SalaryHeaderSkeleton() {
    return (
        <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-48" />
            <div className="flex gap-2 mt-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-20" />
            </div>
        </div>
    )
}

function SalaryHeader({ data, job, onEdit }: { data: SalaryMonthData | null; job: JobData | null; onEdit: () => void }) {
    if (!data) return <SalaryHeaderSkeleton />

    const monthDate = parse(data.month, 'yyyy-MM', new Date())
    const monthLabel = format(monthDate, 'MMMM yyyy')
    const isReceived = !!data.received_date

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
            <div>
                <h1 className="text-3xl font-bold text-white">{monthLabel}</h1>
                {job && (
                    <p className="text-sm text-white/60 mt-1">
                        {job.name} at {job.company}
                    </p>
                )}
                <div className="flex gap-2 mt-3 flex-wrap">
                    {job && (
                        <Badge variant="outline" className="text-xs border-white/20 text-white/80">
                            {job.employment_type}
                        </Badge>
                    )}
                    {job && (
                        <Badge variant="outline" className="text-xs border-white/20 text-white/80">
                            {job.currency}
                        </Badge>
                    )}
                    <Badge variant={isReceived ? 'default' : 'secondary'} className={`text-xs ${isReceived ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}`}>
                        {isReceived ? 'Received' : 'Pending'}
                    </Badge>
                </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onEdit} className="text-white/60 hover:text-white hover:bg-white/5">
                <Edit className="w-5 h-5" />
            </Button>
        </motion.div>
    )
}

function JobInfoCard({ job }: { job: JobData | null | undefined }) {
    if (job === undefined) {
        return (
            <Card className="p-6 bg-white/2.5 border border-white/5">
                <Skeleton className="h-40" />
            </Card>
        )
    }

    if (!job) return null

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="p-6 bg-white/2.5 border border-white/5 hover:border-white/10">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Job Details</h3>
                    <Badge variant="outline" className={`text-xs ${job.active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                        {job.active ? 'Active' : 'Inactive'}
                    </Badge>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Briefcase className="w-4 h-4 text-white/40 shrink-0" />
                        <div>
                            <p className="text-xs text-white/50">Position</p>
                            <p className="text-sm text-white font-medium">{job.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-white/40 shrink-0" />
                        <div>
                            <p className="text-xs text-white/50">Company</p>
                            <p className="text-sm text-white font-medium">{job.company}</p>
                        </div>
                    </div>
                    {job.department && (
                        <div className="flex items-center gap-3">
                            <Building2 className="w-4 h-4 text-white/40 shrink-0" />
                            <div>
                                <p className="text-xs text-white/50">Department</p>
                                <p className="text-sm text-white">{job.department}</p>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-white/40 shrink-0" />
                        <div>
                            <p className="text-xs text-white/50">Start Date</p>
                            <p className="text-sm text-white">{job.start_date}</p>
                        </div>
                    </div>
                    {job.end_date && (
                        <div className="flex items-center gap-3">
                            <Calendar className="w-4 h-4 text-white/40 shrink-0" />
                            <div>
                                <p className="text-xs text-white/50">End Date</p>
                                <p className="text-sm text-white">{job.end_date}</p>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <DollarSign className="w-4 h-4 text-white/40 shrink-0" />
                        <div>
                            <p className="text-xs text-white/50">Base Salary</p>
                            <p className="text-sm text-white font-medium">
                                {job.salary.toLocaleString()} <span className="text-white/60">{job.currency}</span>
                            </p>
                        </div>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs border-white/20 text-white/70">{job.employment_type}</Badge>
                </div>
                {job.notes && (
                    <p className="mt-3 text-xs text-white/40 italic">{job.notes}</p>
                )}
            </Card>
        </motion.div>
    )
}

function SpendingBreakdownCard({ data }: { data: SalaryMonthData | null }) {
    if (!data) {
        return (
            <Card className="p-6 bg-white/2.5 border border-white/5">
                <Skeleton className="h-32" />
            </Card>
        )
    }

    const spentPercentage = data.net_amount > 0 ? (data.total_spent / data.net_amount) * 100 : 0
    let barColor = 'bg-green-500'
    if (spentPercentage > 90) {
        barColor = 'bg-red-500'
    } else if (spentPercentage > 70) {
        barColor = 'bg-yellow-500'
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="h-full">
            <Card className="h-full p-6 bg-white/2.5 border border-white/5 hover:border-white/10">
                <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide mb-4">Spending Breakdown</h3>
                <div className="space-y-3">
                    <div className="flex justify-between items-baseline">
                        <span className="text-white/60 text-sm">Gross Salary</span>
                        <span className="text-white font-semibold text-lg">{data.salary_amount.toLocaleString()} {data.currency}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                        <span className="text-white/60 text-sm">Deductions</span>
                        <span className="text-red-400 font-semibold text-lg">-{data.deductions.toLocaleString()} {data.currency}</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
                        <span className="text-white/80 text-sm font-medium">Net Amount</span>
                        <span className="text-green-400 font-bold text-xl">{data.net_amount.toLocaleString()} {data.currency}</span>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-white/10">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-white/60">Spent</span>
                        <span className="text-sm font-semibold text-white">{data.total_spent.toLocaleString()} / {data.net_amount.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            className={`h-full ${barColor} rounded-full`}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(spentPercentage, 100)}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                    </div>
                    <div className="text-xs text-white/50 mt-2">{spentPercentage.toFixed(1)}% of net salary spent</div>
                </div>
            </Card>
        </motion.div>
    )
}

function EditExpenseForm({ expense, salaryMonthId, onClose, onSavingChange }: {
    expense: Expense
    salaryMonthId: number
    onClose: () => void
    onSavingChange?: (v: boolean) => void
}) {
    const { mutate: updateExpense, isPending } = useExpenseUpdate()

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
    })

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        onSavingChange?.(true)
        updateExpense({
            id: expense.id,
            data: {
                ...formData,
                person_id: expense.person_id,
                salary_month_id: salaryMonthId,
                date: formData.date.toISOString().split('T')[0],
                recurrence_frequency: formData.is_recurring ? formData.recurrence_frequency : undefined,
            }
        }, {
            onSuccess: () => onClose(),
            onError: () => onSavingChange?.(false),
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Expense Name" required>
                <TextInput value={formData.name} onChange={(v: string) => updateField('name', v)} />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
                <FormField label="Amount" required>
                    <NumberInput value={formData.amount} onChange={(v: number) => updateField('amount', v)} placeholder="0" min={0} />
                </FormField>
                <FormField label="Currency">
                    <SelectInput value={formData.currency} onChange={(v: string) => updateField('currency', v)}
                        options={[{ value: 'UZS', label: 'UZS' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }]} />
                </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <FormField label="Category">
                    <SelectInput value={formData.category} onChange={(v: string) => updateField('category', v)}
                        options={[
                            { value: 'food', label: 'Food' }, { value: 'transport', label: 'Transport' },
                            { value: 'education', label: 'Education' }, { value: 'entertainment', label: 'Entertainment' },
                            { value: 'bills', label: 'Bills' }, { value: 'health', label: 'Health' }, { value: 'shopping', label: 'Shopping' }
                        ]} />
                </FormField>
                <FormField label="Subcategory">
                    <TextInput value={formData.subcategory} onChange={(v: string) => updateField('subcategory', v)} />
                </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <FormField label="Payment Type">
                    <SelectInput value={formData.payment_type} onChange={(v: string) => updateField('payment_type', v)}
                        options={[{ value: 'card', label: 'Card' }, { value: 'cash', label: 'Cash' }, { value: 'transfer', label: 'Transfer' }]} />
                </FormField>
                <FormField label="Date">
                    <DatePicker value={formData.date} onChange={(date) => date && updateField('date', date)} />
                </FormField>
            </div>

            <FormField label="Description">
                <TextareaInput value={formData.description} onChange={(v: string) => updateField('description', v)} />
            </FormField>

            <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t border-white/10">
                <div className="flex gap-4 items-center">
                    <button type="button" onClick={() => updateField('is_essential', !formData.is_essential)}
                        className={`text-sm flex items-center gap-2 ${formData.is_essential ? 'text-green-400' : 'text-gray-400'}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.is_essential ? 'border-green-400 bg-green-400/20' : 'border-gray-500'}`}>
                            {formData.is_essential && <div className="w-2 h-2 rounded bg-green-400" />}
                        </div>
                        Essential
                    </button>
                    <button type="button" onClick={() => updateField('is_recurring', !formData.is_recurring)}
                        className={`text-sm flex items-center gap-2 ${formData.is_recurring ? 'text-blue-400' : 'text-gray-400'}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.is_recurring ? 'border-blue-400 bg-blue-400/20' : 'border-gray-500'}`}>
                            {formData.is_recurring && <div className="w-2 h-2 rounded bg-blue-400" />}
                        </div>
                        Recurring
                    </button>
                    {formData.is_recurring && (
                        <div className="w-32">
                            <SelectInput value={formData.recurrence_frequency} onChange={(v: string) => updateField('recurrence_frequency', v)}
                                options={[{ value: 'none', label: 'None' }, { value: 'daily', label: 'Daily' },
                                    { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
                        </div>
                    )}
                </div>
                <div className="flex gap-3 ml-auto">
                    <CancelButton onClick={onClose} />
                    <SubmitButton isLoading={isPending}>Save</SubmitButton>
                </div>
            </div>
        </form>
    )
}

function ExpenseCard({ expense, salaryMonthId }: { expense: Expense; salaryMonthId: number }) {
    const [editOpen, setEditOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const { mutate: deleteExpense, isPending: isDeleting } = useExpenseDelete()

    const categoryEmojis: Record<string, string> = {
        'Food': '🍔', 'food': '🍔',
        'Entertainment': '🎬', 'entertainment': '🎬',
        'Transport': '🚗', 'transport': '🚗',
        'Utilities': '⚡',
        'Shopping': '🛍️', 'shopping': '🛍️',
        'Health': '🏥', 'health': '🏥',
        'education': '📚', 'Education': '📚',
        'bills': '🧾', 'Bills': '🧾',
    }

    const emoji = categoryEmojis[expense.category] || '💰'

    const handleDelete = () => {
        deleteExpense(expense.id, { onSuccess: () => setDeleteOpen(false) })
    }

    return (
        <>
            <div className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors group">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                        <span className="text-xl">{emoji}</span>
                        <div className="flex-1">
                            <p className="text-white font-medium text-sm">{expense.name}</p>
                            <p className="text-white/50 text-xs">{expense.date}</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setEditOpen(true)}
                                disabled={isSaving}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-all disabled:opacity-50"
                            >
                                {isSaving
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                                    : <Edit2 className="w-3.5 h-3.5" />
                                }
                            </button>
                            <button
                                onClick={() => setDeleteOpen(true)}
                                disabled={isDeleting}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded transition-all disabled:opacity-50"
                            >
                                {isDeleting
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                                    : <Trash2 className="w-3.5 h-3.5" />
                                }
                            </button>
                        </div>
                        <span className="text-white font-bold text-sm">{expense.amount.toLocaleString()} {expense.currency}</span>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                    <Badge variant="outline" className="text-xs bg-white/5 border-white/10 text-white/70">{expense.category}</Badge>
                    <Badge variant="outline" className="text-xs bg-white/5 border-white/10 text-white/70">{expense.payment_type}</Badge>
                    {expense.is_recurring && <Repeat className="w-3 h-3 text-white/50" />}
                    {expense.is_essential && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[80vh] overflow-y-auto w-full max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white">Edit Expense</DialogTitle>
                    </DialogHeader>
                    <EditExpenseForm expense={expense} salaryMonthId={salaryMonthId} onClose={() => { setEditOpen(false); setIsSaving(false) }} onSavingChange={setIsSaving} />
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent className="bg-[#0a0a0f] border border-white/10">
                    <AlertDialogTitle className="text-white">Delete Expense</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">
                        Are you sure you want to delete &quot;{expense.name}&quot;? This action cannot be undone.
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-3 mt-6">
                        <AlertDialogCancel className="bg-white/5 border-white/20 text-white hover:bg-white/10">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2">
                            {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

function ExpensesListCard({ expenses, onAddExpense, salaryMonthId }: { expenses: Expense[]; onAddExpense: () => void; salaryMonthId: number }) {
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-full">
            <Card className="h-full flex flex-col p-6 bg-white/2.5 border border-white/5 hover:border-white/10">
                <div className="flex items-center justify-between mb-6 flex-none">
                    <h3 className="text-lg font-semibold text-white">Expenses</h3>
                    <div className="flex gap-2 items-center">
                        <div className="flex gap-1 bg-white/5 p-1 rounded">
                            <Button
                                size="sm"
                                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                                className="h-8 w-8 p-0"
                                onClick={() => setViewMode('cards')}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                size="sm"
                                variant={viewMode === 'table' ? 'default' : 'ghost'}
                                className="h-8 w-8 p-0"
                                onClick={() => setViewMode('table')}
                            >
                                <LayoutList className="w-4 h-4" />
                            </Button>
                        </div>
                        <Button size="sm" onClick={onAddExpense} className="gap-2 bg-white/10 hover:bg-white/15 text-white">
                            <Plus className="w-4 h-4" />
                            Add
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {expenses.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-white/50">No expenses yet</p>
                        </div>
                    ) : viewMode === 'cards' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {expenses.map((expense) => (
                                <ExpenseCard key={expense.id} expense={expense} salaryMonthId={salaryMonthId} />
                            ))}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-2 px-3 text-white/60 font-medium">Name</th>
                                        <th className="text-left py-2 px-3 text-white/60 font-medium">Category</th>
                                        <th className="text-left py-2 px-3 text-white/60 font-medium">Amount</th>
                                        <th className="text-left py-2 px-3 text-white/60 font-medium">Payment</th>
                                        <th className="text-left py-2 px-3 text-white/60 font-medium">Date</th>
                                        <th className="text-left py-2 px-3 text-white/60 font-medium">Essential</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map((expense) => (
                                        <tr key={expense.id} className="border-b border-white/5 hover:bg-white/5">
                                            <td className="py-3 px-3 text-white">{expense.name}</td>
                                            <td className="py-3 px-3 text-white/70">{expense.category}</td>
                                            <td className="py-3 px-3 text-white font-medium">{expense.amount.toLocaleString()}</td>
                                            <td className="py-3 px-3 text-white/70 text-xs">{expense.payment_type}</td>
                                            <td className="py-3 px-3 text-white/70">{expense.date}</td>
                                            <td className="py-3 px-3">{expense.is_essential ? <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Card>
        </motion.div>
    )
}

function SalaryStatsCard({ data }: { data: SalaryMonthData | null }) {
    if (!data) {
        return (
            <Card className="p-6 bg-white/2.5 border border-white/5">
                <Skeleton className="h-48" />
            </Card>
        )
    }

    const savingsRate = data.net_amount > 0 ? (data.remaining_amount / data.net_amount) * 100 : 0
    const isNegativeBalance = data.remaining_amount < 0

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-3">
            <Card className="p-4 bg-white/2.5 border border-white/5 hover:border-white/10">
                <p className="text-white/60 text-xs uppercase tracking-wide mb-2">Remaining</p>
                <p className={`text-2xl font-bold ${isNegativeBalance ? 'text-red-400' : 'text-green-400'}`}>
                    {data.remaining_amount.toLocaleString()} {data.currency}
                </p>
            </Card>

            <Card className="p-4 bg-white/2.5 border border-white/5 hover:border-white/10">
                <p className="text-white/60 text-xs uppercase tracking-wide mb-2">Total Spent</p>
                <p className="text-2xl font-bold text-white">{data.total_spent.toLocaleString()} {data.currency}</p>
            </Card>

            <Card className="p-4 bg-white/2.5 border border-white/5 hover:border-white/10">
                <p className="text-white/60 text-xs uppercase tracking-wide mb-2">Savings Rate</p>
                <p className="text-2xl font-bold text-white">{savingsRate.toFixed(1)}%</p>
                <p className="text-xs text-white/50 mt-1">of net salary saved</p>
            </Card>
        </motion.div>
    )
}

function QuickActionsCard({ data, isReceived, onToggleReceived, onEdit, onDelete }: { data: SalaryMonthData | null; isReceived: boolean; onToggleReceived: () => void; onEdit: () => void; onDelete: () => void }) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="p-6 bg-white/2.5 border border-white/5 hover:border-white/10 sticky top-6">
                <div className="space-y-3">
                    <Button onClick={onToggleReceived} variant="outline" className="w-full text-white border-white/20 hover:border-white/40 hover:bg-white/5">
                        {isReceived ? 'Mark as Pending' : 'Mark as Received'}
                    </Button>
                    <Button onClick={onEdit} variant="outline" className="w-full text-white border-white/20 hover:border-white/40 hover:bg-white/5">
                        Edit Salary Month
                    </Button>
                    <Button onClick={onDelete} variant="destructive" className="w-full">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                    </Button>
                </div>
            </Card>
        </motion.div>
    )
}


function AddExpenseForm({ personId, salaryMonthId, onClose }: {
    personId: number
    salaryMonthId: number
    onClose: () => void
}) {
    const { mutate: createExpense, isPending } = useExpenseCreate()

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
    })

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        createExpense({
            ...formData,
            person_id: personId,
            salary_month_id: salaryMonthId,
            date: formData.date.toISOString().split('T')[0],
            recurrence_frequency: formData.is_recurring ? formData.recurrence_frequency : undefined,
        }, {
            onSuccess: () => {
                onClose()
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
                })
            }
        })
    }

    return (
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
                        options={[
                            { value: 'UZS', label: 'UZS' },
                            { value: 'USD', label: 'USD' },
                            { value: 'EUR', label: 'EUR' }
                        ]}
                    />
                </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <FormField label="Category">
                    <SelectInput
                        value={formData.category}
                        onChange={(value: string) => updateField('category', value)}
                        options={[
                            { value: 'food', label: 'Food' },
                            { value: 'transport', label: 'Transport' },
                            { value: 'education', label: 'Education' },
                            { value: 'entertainment', label: 'Entertainment' },
                            { value: 'bills', label: 'Bills' },
                            { value: 'health', label: 'Health' },
                            { value: 'shopping', label: 'Shopping' }
                        ]}
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

            <FormField label="Description">
                <TextareaInput
                    value={formData.description}
                    onChange={(value: string) => updateField('description', value)}
                    placeholder="Add any additional notes here..."
                />
            </FormField>

            <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t border-white/10">
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
                    <CancelButton onClick={onClose} />
                    <SubmitButton isLoading={isPending}>
                        Add Expense
                    </SubmitButton>
                </div>
            </div>
        </form>
    )
}

export default function SalaryPageWrapper() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>}>
            <SalaryPage />
        </Suspense>
    )
}

// Main Page Component
function SalaryPage() {
    const params = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    // salary month ID comes from query param ?id=, fallback to path param for backwards compat
    const salaryId = searchParams.get('id') ?? (params.id as string)

    const { data, isLoading } = useSalaryMonth(salaryId)
    const { data: job, isLoading: isJobLoading } = useJob(data?.job_id)
    const { data: expenses = [] } = useExpensesBySalaryMonth(salaryId)
    const { mutate: deleteSalary, isPending: isDeleting } = useSalaryMonthDelete()

    const [editModalOpen, setEditModalOpen] = useState(false)
    const [addExpenseModalOpen, setAddExpenseModalOpen] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [isReceived, setIsReceived] = useState(!!data?.received_date)

    const handleDelete = () => {
        deleteSalary(salaryId, {
            onSuccess: () => {
                setDeleteConfirmOpen(false)
                router.push(`/platform/${params.id}/finances`)
            }
        })
    }

    if (!data && !isLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] p-8">
                <Card className="p-8 text-center border border-red-500/50 bg-red-500/5">
                    <h2 className="text-xl font-semibold text-white mb-4">Salary Month Not Found</h2>
                    <p className="text-white/50 text-sm mb-4">The requested salary month could not be loaded.</p>
                    <Button onClick={() => router.push('/platform')} className="mt-4">
                        Back to Platform
                    </Button>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f] p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <SalaryHeader data={data} job={job ?? null} onEdit={() => setEditModalOpen(true)} />

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8 items-start">
                    {/* Left Column */}
                    <div className="lg:col-span-2 grid grid-rows-2 gap-6 h-[760px]">
                        <SpendingBreakdownCard data={data} />
                        <ExpensesListCard expenses={expenses} onAddExpense={() => setAddExpenseModalOpen(true)} salaryMonthId={data?.id ?? 0} />
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        <SalaryStatsCard data={data} />
                        <JobInfoCard job={isJobLoading ? undefined : (job ?? null)} />
                        <QuickActionsCard data={data} isReceived={isReceived} onToggleReceived={() => setIsReceived(!isReceived)} onEdit={() => setEditModalOpen(true)} onDelete={() => setDeleteConfirmOpen(true)} />
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
                <DialogContent className="bg-[#0a0a0f] border border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Edit Salary Month</DialogTitle>
                        <DialogDescription className="text-white/60">Update the salary information for {data?.month}</DialogDescription>
                    </DialogHeader>
                    <div className="text-white/50 py-8">
                        Edit form coming soon
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Expense Modal */}
            <Dialog open={addExpenseModalOpen} onOpenChange={setAddExpenseModalOpen}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[80vh] overflow-y-auto w-full max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white">Add New Expense</DialogTitle>
                        <DialogDescription className="text-white/60">{data?.month}</DialogDescription>
                    </DialogHeader>
                    {data && (
                        <AddExpenseForm
                            personId={data.person_id}
                            salaryMonthId={data.id}
                            onClose={() => setAddExpenseModalOpen(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent className="bg-[#0a0a0f] border border-white/10">
                    <AlertDialogTitle className="text-white">Delete Salary Month</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">
                        Are you sure you want to delete salary for "{data?.month}"? This action cannot be undone.
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-3 mt-6">
                        <AlertDialogCancel className="bg-white/5 border-white/20 text-white hover:bg-white/10">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2">
                            {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
