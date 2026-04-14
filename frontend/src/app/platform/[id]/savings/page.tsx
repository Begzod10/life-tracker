'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
    PiggyBank,
    TrendingUp,
    Bitcoin,
    Building,
    Wallet,
    ArrowDownCircle,
    ArrowUpCircle,
    Percent,
    Plus,
    Edit2,
    Trash2,
    Loader2,
} from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useHttp } from '@/lib/hooks/use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'
import {
    FormField,
    TextInput,
    TextareaInput,
    SelectInput,
    NumberInput,
    DatePicker,
    SubmitButton,
    CancelButton,
} from '@/components/modals/form-components'

// ============================================================================
// TYPES
// ============================================================================

type SavingsAccount = {
    id: number
    person_id: number
    account_name: string
    account_type: string
    current_balance: number
    initial_amount: number
    target_amount: number
    currency: string
    interest_rate: number
    start_date: string
    maturity_date: string | null
    risk_level: string
    platform: string
    notes: string
    deleted: boolean
    created_at: string
    updated_at: string
}

type Transaction = {
    id: number
    saving_id: number
    transaction_type: 'deposit' | 'withdrawal'
    amount: number
    transaction_date: string
    description: string
    balance_before: number
    balance_after: number
    created_at: string
}

type CreateTransactionPayload = {
    amount: number
    description: string
    saving_id: number
    transaction_date: string
    transaction_type: 'deposit' | 'withdrawal'
}

// ============================================================================
// HOOKS
// ============================================================================

function useSavingsProfile(id: string) {
    const { request } = useHttp()
    return useQuery<SavingsAccount>({
        queryKey: ['savings', 'profile', id],
        queryFn: () => request(API_ENDPOINTS.SAVINGS.GET(id)),
        enabled: !!id,
    })
}

function useSavingsProfileUpdate(id: string) {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<SavingsAccount>) =>
            request(API_ENDPOINTS.SAVINGS.UPDATE(id), { method: 'PUT', body: data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings', 'profile', id] })
            queryClient.invalidateQueries({ queryKey: ['savings'] })
        },
    })
}

function useSavingsProfileDelete(id: string) {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => request(API_ENDPOINTS.SAVINGS.DELETE(id), { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savings'] }),
    })
}

function useSavingsTransactions(savingId: string) {
    const { request } = useHttp()
    return useQuery<Transaction[]>({
        queryKey: ['savings', 'transactions', savingId],
        queryFn: () => request(API_ENDPOINTS.SAVINGS_TRANSACTIONS.LIST(savingId)),
        enabled: !!savingId,
    })
}

function useSavingsTransactionCreate(savingId: string) {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateTransactionPayload) =>
            request(API_ENDPOINTS.SAVINGS_TRANSACTIONS.CREATE(savingId), { method: 'POST', body: data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings', 'transactions', savingId] })
            queryClient.invalidateQueries({ queryKey: ['savings', 'profile', savingId] })
            queryClient.invalidateQueries({ queryKey: ['savings'] })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        },
    })
}

function useSavingsTransactionDelete(savingId: string) {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (transactionId: number) =>
            request(API_ENDPOINTS.SAVINGS_TRANSACTIONS.DELETE(savingId, transactionId), { method: 'DELETE' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings', 'transactions', savingId] })
            queryClient.invalidateQueries({ queryKey: ['savings', 'profile', savingId] })
        },
    })
}

// ============================================================================
// HELPERS
// ============================================================================

const getAccountTypeConfig = (type: string) => {
    const config: Record<string, { icon: any; color: string; label: string }> = {
        savings: { icon: PiggyBank, color: 'from-blue-500 to-cyan-500', label: 'Savings' },
        investment: { icon: TrendingUp, color: 'from-violet-500 to-purple-500', label: 'Investment' },
        crypto: { icon: Bitcoin, color: 'from-orange-500 to-amber-500', label: 'Crypto' },
        'real-estate': { icon: Building, color: 'from-green-500 to-emerald-500', label: 'Real Estate' },
        other: { icon: Wallet, color: 'from-gray-500 to-slate-500', label: 'Other' },
    }
    return config[type] || config.other
}

const getRiskConfig = (risk: string) => {
    const config: Record<string, string> = {
        low: 'bg-green-500/10 text-green-400 border-green-500/20',
        medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        high: 'bg-red-500/10 text-red-400 border-red-500/20',
    }
    return config[risk] || config.low
}

const formatCurrency = (amount: number, currency: string) => {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
    } catch {
        return `${amount.toLocaleString()} ${currency}`
    }
}

// ============================================================================
// EDIT SAVINGS MODAL
// ============================================================================

function EditSavingsModal({ account }: { account: SavingsAccount }) {
    const [open, setOpen] = useState(false)
    const { mutate: update, isPending } = useSavingsProfileUpdate(String(account.id))

    const [formData, setFormData] = useState({
        account_name: account.account_name,
        account_type: account.account_type,
        currency: account.currency,
        initial_amount: account.initial_amount,
        target_amount: account.target_amount,
        interest_rate: account.interest_rate,
        start_date: account.start_date ? account.start_date.split('T')[0] : '',
        maturity_date: account.maturity_date ? account.maturity_date.split('T')[0] : '',
        risk_level: account.risk_level,
        platform: account.platform,
        notes: account.notes || '',
    })

    const updateField = (field: string, value: any) =>
        setFormData(prev => ({ ...prev, [field]: value }))

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        update(
            {
                ...formData,
                initial_amount: Number(formData.initial_amount),
                target_amount: Number(formData.target_amount),
                interest_rate: Number(formData.interest_rate),
                maturity_date: formData.maturity_date || undefined,
            },
            { onSuccess: () => setOpen(false) }
        )
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                    <Edit2 className="w-4 h-4" />
                    Edit Account
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-white">Edit Savings Account</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Account Name">
                            <TextInput value={formData.account_name} onChange={(v: string) => updateField('account_name', v)} placeholder="e.g. Emergency Fund" required />
                        </FormField>
                        <FormField label="Account Type">
                            <SelectInput value={formData.account_type} onChange={(v: string) => updateField('account_type', v)} options={[
                                { value: 'savings', label: 'Savings' },
                                { value: 'investment', label: 'Investment' },
                                { value: 'crypto', label: 'Crypto' },
                                { value: 'real-estate', label: 'Real Estate' },
                                { value: 'other', label: 'Other' },
                            ]} />
                        </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Platform / Bank">
                            <TextInput value={formData.platform} onChange={(v: string) => updateField('platform', v)} placeholder="e.g. NBU" />
                        </FormField>
                        <FormField label="Risk Level">
                            <SelectInput value={formData.risk_level} onChange={(v: string) => updateField('risk_level', v)} options={[
                                { value: 'low', label: 'Low Risk' },
                                { value: 'medium', label: 'Medium Risk' },
                                { value: 'high', label: 'High Risk' },
                            ]} />
                        </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Initial Amount">
                            <NumberInput value={formData.initial_amount} onChange={(v: number) => updateField('initial_amount', v)} />
                        </FormField>
                        <FormField label="Target Amount">
                            <NumberInput value={formData.target_amount} onChange={(v: number) => updateField('target_amount', v)} />
                        </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Interest Rate (%)">
                            <NumberInput value={formData.interest_rate} onChange={(v: number) => updateField('interest_rate', v)} />
                        </FormField>
                        <FormField label="Currency">
                            <SelectInput value={formData.currency} onChange={(v: string) => updateField('currency', v)} options={[
                                { value: 'UZS', label: 'UZS' },
                                { value: 'USD', label: 'USD' },
                                { value: 'EUR', label: 'EUR' },
                            ]} />
                        </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Start Date">
                            <DatePicker value={formData.start_date ? new Date(formData.start_date) : undefined} onChange={(date) => date && updateField('start_date', date.toISOString().split('T')[0])} />
                        </FormField>
                        <FormField label="Maturity Date">
                            <DatePicker value={formData.maturity_date ? new Date(formData.maturity_date) : undefined} onChange={(date) => date && updateField('maturity_date', date.toISOString().split('T')[0])} />
                        </FormField>
                    </div>
                    <FormField label="Notes">
                        <TextareaInput value={formData.notes} onChange={(v: string) => updateField('notes', v)} placeholder="Additional information..." />
                    </FormField>
                    <div className="flex justify-end gap-3 pt-4 border-t border-[#2a2b36]">
                        <CancelButton onClick={() => setOpen(false)} />
                        <SubmitButton isLoading={isPending}>Save Changes</SubmitButton>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// DELETE SAVINGS MODAL
// ============================================================================

function DeleteSavingsModal({ account }: { account: SavingsAccount }) {
    const [open, setOpen] = useState(false)
    const { mutate: deleteAccount, isPending } = useSavingsProfileDelete(String(account.id))

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full flex items-center gap-2 text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Delete Savings Account</DialogTitle>
                </DialogHeader>
                <p className="text-gray-400 my-4">
                    Are you sure you want to delete{' '}
                    <span className="text-white font-semibold">{account.account_name}</span>? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={() => deleteAccount(undefined, { onSuccess: () => window.history.back() })}
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

// ============================================================================
// ADD TRANSACTION MODAL
// ============================================================================

function AddTransactionModal({ account }: { account: SavingsAccount }) {
    const [open, setOpen] = useState(false)
    const { mutate: create, isPending } = useSavingsTransactionCreate(String(account.id))

    const today = new Date().toISOString().split('T')[0]
    const [formData, setFormData] = useState<{
        transaction_type: 'deposit' | 'withdrawal'
        amount: number
        transaction_date: string
        description: string
    }>({
        transaction_type: 'deposit',
        amount: 0,
        transaction_date: today,
        description: '',
    })

    const updateField = (field: string, value: any) =>
        setFormData(prev => ({ ...prev, [field]: value }))

    const resetForm = () => {
        setFormData(prev => ({
            ...prev,
            transaction_type: 'deposit',
            amount: 0,
            transaction_date: today,
            description: '',
        }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        create(
            {
                amount: Number(formData.amount),
                description: formData.description,
                saving_id: account.id,
                transaction_date: formData.transaction_date,
                transaction_type: formData.transaction_type,
            },
            { onSuccess: () => { setOpen(false); resetForm() } }
        )
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="bg-green-600/80 hover:bg-green-600 text-white flex items-center gap-1">
                    <Plus className="w-4 h-4" />
                    Add Transaction
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] transition-all max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-white">Add Transaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormField label="Type">
                        <SelectInput
                            value={formData.transaction_type}
                            onChange={(v: string) => updateField('transaction_type', v)}
                            options={[
                                { value: 'deposit', label: 'Deposit' },
                                { value: 'withdrawal', label: 'Withdrawal' },
                            ]}
                        />
                    </FormField>

                    <FormField label="Amount">
                        <NumberInput value={formData.amount} onChange={(v: number) => updateField('amount', v)} />
                    </FormField>
                    <FormField label="Date">
                        <DatePicker
                            value={formData.transaction_date ? new Date(formData.transaction_date) : undefined}
                            onChange={(date) => date && updateField('transaction_date', date.toISOString().split('T')[0])}
                        />
                    </FormField>
                    <FormField label="Description">
                        <TextInput
                            value={formData.description}
                            onChange={(v: string) => updateField('description', v)}
                            placeholder="e.g. Monthly savings contribution"
                        />
                    </FormField>

                    <div className="flex justify-end gap-3 pt-4 border-t border-[#2a2b36]">
                        <CancelButton onClick={() => setOpen(false)} />
                        <SubmitButton isLoading={isPending}>Add</SubmitButton>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// DELETE TRANSACTION CONFIRM
// ============================================================================

function DeleteTransactionButton({ savingId, transaction }: { savingId: string; transaction: Transaction }) {
    const [open, setOpen] = useState(false)
    const { mutate: delSavingsTx, isPending } = useSavingsTransactionDelete(savingId)

    const handleDelete = () => {
        delSavingsTx(transaction.id, { onSuccess: () => setOpen(false) })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1b26] border border-[#2a2b36]">
                <DialogHeader>
                    <DialogTitle className="text-white">Delete Transaction</DialogTitle>
                </DialogHeader>
                <p className="text-gray-400 my-4">
                    Delete transaction <span className="text-white font-semibold">{transaction.description || `#${transaction.id}`}</span>?
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">Cancel</Button>
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

// ============================================================================
// BALANCE OVERVIEW
// ============================================================================

function BalanceOverviewCard({ account }: { account: SavingsAccount }) {
    const growth = (account.current_balance || 0) - (account.initial_amount || 0)
    const growthPercent = account.initial_amount ? (growth / account.initial_amount) * 100 : 0
    const progressPercent = account.target_amount ? ((account.current_balance || 0) / account.target_amount) * 100 : 0
    const isPositive = growth >= 0

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="p-6 border border-white/5 bg-white/[0.025] backdrop-blur-sm hover:border-white/10 transition-all">
                <div className="mb-6">
                    <p className="text-gray-400 text-sm mb-2">Current Balance</p>
                    <h2 className="text-4xl font-bold text-white">
                        {formatCurrency(account.current_balance || 0, account.currency)}
                    </h2>
                    <p className={`text-sm mt-2 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{formatCurrency(growth, account.currency)} ({growthPercent.toFixed(1)}%)
                    </p>
                </div>
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-gray-400 text-sm">Progress to Goal</p>
                        <span className="text-white font-semibold">{Math.min(progressPercent, 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(progressPercent, 100)}%` }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <p className="text-gray-400 text-xs uppercase mb-1">Initial</p>
                        <p className="text-white font-semibold">{formatCurrency(account.initial_amount, account.currency)}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-xs uppercase mb-1">Target</p>
                        <p className="text-white font-semibold">{formatCurrency(account.target_amount, account.currency)}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-xs uppercase mb-1">To Goal</p>
                        <p className="text-white font-semibold">
                            {formatCurrency(Math.max(0, account.target_amount - (account.current_balance || 0)), account.currency)}
                        </p>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

// ============================================================================
// TRANSACTION HISTORY
// ============================================================================

function TransactionHistoryCard({ account, transactions, isLoading }: { account: SavingsAccount; transactions: Transaction[]; isLoading: boolean }) {
    const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all')

    const filtered = filter === 'all' ? transactions : transactions.filter(t => t.transaction_type === filter)

    const getIcon = (type: string) => {
        if (type === 'deposit') return <ArrowDownCircle className="w-5 h-5 text-green-400" />
        if (type === 'withdrawal') return <ArrowUpCircle className="w-5 h-5 text-red-400" />
        return <Percent className="w-5 h-5 text-blue-400" />
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="p-6 border border-white/5 bg-white/[0.025] backdrop-blur-sm hover:border-white/10 transition-all">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">Transaction History</h3>
                    <AddTransactionModal account={account} />
                </div>

                <div className="flex gap-2 mb-6">
                    {(['all', 'deposit', 'withdrawal'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            className={`px-3 py-1 text-sm rounded-full transition-all ${filter === tab ? 'bg-white/10 text-white border border-white/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="space-y-2">
                    {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-14 rounded-lg" />
                        ))
                    ) : filtered.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No transactions yet</p>
                    ) : (
                        filtered.map((tx, idx) => (
                            <motion.div
                                key={tx.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.04 }}
                                className="group flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {getIcon(tx.transaction_type)}
                                    <div>
                                        <p className="text-white text-sm font-medium">
                                            {tx.description ? tx.description.replace(/^Expense:\s*/i, '').replace(/\s*\(expense_id=\d+\)/g, '').replace(/\s*\[backfilled\]/g, '') : tx.transaction_type}
                                        </p>
                                        <p className="text-gray-400 text-xs flex items-center gap-2">
                                            {format(parseISO(tx.transaction_date), 'MMM dd, yyyy')}
                                            {tx.balance_before != null && tx.balance_after != null && (
                                                <span className="text-gray-500">
                                                    {formatCurrency(tx.balance_before, account.currency)} → {formatCurrency(tx.balance_after, account.currency)}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className={`font-semibold ${tx.transaction_type === 'withdrawal' ? 'text-red-400' : 'text-green-400'}`}>
                                        {tx.transaction_type === 'withdrawal' ? '-' : '+'}{formatCurrency(tx.amount, account.currency)}
                                    </p>
                                    <DeleteTransactionButton savingId={String(account.id)} transaction={tx} />
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </Card>
        </motion.div>
    )
}

// ============================================================================
// BALANCE GROWTH CHART
// ============================================================================

function BalanceGrowthChart({ account, transactions }: { account: SavingsAccount; transactions: Transaction[] }) {
    const sortedTx = [...transactions].sort(
        (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    )

    const dataPoints = [
        { date: parseISO(account.start_date), balance: account.initial_amount },
        ...sortedTx.map(tx => ({ date: parseISO(tx.transaction_date), balance: tx.balance_after })),
    ]

    if (dataPoints[dataPoints.length - 1].balance !== account.current_balance) {
        dataPoints.push({ date: new Date(), balance: account.current_balance })
    }

    const width = 400
    const height = 160
    const padding = 30
    const plotW = width - padding * 2
    const plotH = height - padding * 2

    const balances = dataPoints.map(p => p.balance)
    const minB = Math.min(...balances)
    const maxB = Math.max(...balances)
    const rangeB = maxB - minB || 1

    const points = dataPoints.map((p, i) => ({
        x: padding + (i / Math.max(dataPoints.length - 1, 1)) * plotW,
        y: padding + plotH - ((p.balance - minB) / rangeB) * plotH,
    }))

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ')
    const fillD = `${pathD} L ${points[points.length - 1].x},${height - padding} L ${padding},${height - padding} Z`

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="p-6 border border-white/5 bg-white/[0.025] backdrop-blur-sm hover:border-white/10 transition-all">
                <h3 className="text-lg font-semibold text-white mb-4">Balance Growth</h3>
                <svg width={width} height={height} className="w-full">
                    <defs>
                        <linearGradient id="balGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path d={fillD} fill="url(#balGrad)" />
                    <path d={pathD} stroke="#06b6d4" strokeWidth="2" fill="none" />
                    {points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="4" fill="#06b6d4" />
                    ))}
                </svg>
            </Card>
        </motion.div>
    )
}

// ============================================================================
// ACCOUNT DETAILS
// ============================================================================

function AccountDetailsCard({ account }: { account: SavingsAccount }) {
    const daysUntilMaturity = account.maturity_date
        ? differenceInDays(parseISO(account.maturity_date), new Date())
        : null

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="p-6 border border-white/5 bg-white/[0.025] backdrop-blur-sm hover:border-white/10 transition-all space-y-4">
                <h3 className="text-base font-semibold text-white">Account Details</h3>
                <div>
                    <p className="text-gray-400 text-xs mb-1">Interest Rate</p>
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        <p className="text-white font-semibold">{account.interest_rate}% per year</p>
                    </div>
                </div>
                <div>
                    <p className="text-gray-400 text-xs mb-1">Platform</p>
                    <p className="text-white font-semibold">{account.platform || '—'}</p>
                </div>
                <div>
                    <p className="text-gray-400 text-xs mb-1">Start Date</p>
                    <p className="text-white font-semibold">
                        {account.start_date ? format(parseISO(account.start_date), 'MMM dd, yyyy') : '—'}
                    </p>
                </div>
                <div>
                    <p className="text-gray-400 text-xs mb-1">Maturity Date</p>
                    <p className="text-white font-semibold">
                        {account.maturity_date ? format(parseISO(account.maturity_date), 'MMM dd, yyyy') : 'No expiry'}
                    </p>
                    {daysUntilMaturity !== null && daysUntilMaturity > 0 && (
                        <p className="text-green-400 text-xs mt-1">{daysUntilMaturity} days remaining</p>
                    )}
                </div>
                <div>
                    <p className="text-gray-400 text-xs mb-1">Risk Level</p>
                    <Badge className={`border ${getRiskConfig(account.risk_level)}`}>
                        {account.risk_level.charAt(0).toUpperCase() + account.risk_level.slice(1)}
                    </Badge>
                </div>
                {account.notes && (
                    <div>
                        <p className="text-gray-400 text-xs mb-1">Notes</p>
                        <p className="text-gray-300 text-sm">{account.notes}</p>
                    </div>
                )}
            </Card>
        </motion.div>
    )
}

// ============================================================================
// PROJECTED VALUE
// ============================================================================

function ProjectedValueCard({ account }: { account: SavingsAccount }) {
    if (!account.interest_rate || !account.maturity_date) return null

    const start = parseISO(account.start_date)
    const maturity = parseISO(account.maturity_date)
    const years = differenceInDays(maturity, start) / 365.25
    const base = account.current_balance || account.initial_amount
    const projected = base * Math.pow(1 + account.interest_rate / 100, years)
    const profit = projected - base

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="p-6 border border-white/5 bg-white/[0.025] backdrop-blur-sm hover:border-white/10 transition-all">
                <h3 className="text-base font-semibold text-white mb-4">Projected Value</h3>
                <div className="space-y-3">
                    <div>
                        <p className="text-gray-400 text-xs mb-1">At Maturity</p>
                        <p className="text-2xl font-bold text-white">{formatCurrency(projected, account.currency)}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-xs mb-1">Projected Profit</p>
                        <p className="text-lg font-semibold text-green-400">+{formatCurrency(profit, account.currency)}</p>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SavingsProfilePage() {
    const params = useParams<{ id: string }>()

    const { data: account, isLoading: accountLoading, isError } = useSavingsProfile(params.id)
    const { data: transactionsData, isLoading: txLoading } = useSavingsTransactions(params.id)

    const baseTransactions: Transaction[] = Array.isArray(transactionsData) ? transactionsData : []

    // Merge and sort all transactions
    const allTransactions = [...baseTransactions].sort(
        (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    )

    // Optional: Recalculate balances chronologically
    let currentBalance = account?.initial_amount || 0
    const transactions = allTransactions.map(tx => {
        const balBefore = currentBalance
        if (tx.transaction_type === 'deposit') {
            currentBalance += tx.amount
        } else if (tx.transaction_type === 'withdrawal' || tx.transaction_type === 'expense') {
            currentBalance -= tx.amount
        }
        return {
            ...tx,
            balance_before: tx.balance_before || balBefore,  // Keep original if backend provided it, else use calculated
            balance_after: tx.balance_after || currentBalance,
        }
    })

    const isLoading = accountLoading || txLoading

    if (accountLoading || isLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] p-6">
                <div className="max-w-7xl mx-auto">
                    <Skeleton className="h-12 w-48 mb-4" />
                    <Skeleton className="h-6 w-32 mb-8" />
                    <div className="grid lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <Skeleton className="h-64 rounded-lg" />
                            <Skeleton className="h-96 rounded-lg" />
                            <Skeleton className="h-48 rounded-lg" />
                        </div>
                        <div className="space-y-6">
                            <Skeleton className="h-48 rounded-lg" />
                            <Skeleton className="h-64 rounded-lg" />
                            <Skeleton className="h-48 rounded-lg" />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (isError || !account) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] p-6 flex items-center justify-center">
                <Card className="p-8 border border-white/5 bg-white/[0.025] max-w-md text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Account Not Found</h2>
                    <p className="text-gray-400 mb-6">The savings account you&apos;re looking for doesn&apos;t exist.</p>
                    <Button onClick={() => window.history.back()} className="w-full">Go Back</Button>
                </Card>
            </div>
        )
    }

    const typeConfig = getAccountTypeConfig(account.account_type)
    const TypeIcon = typeConfig.icon

    return (
        <div className="min-h-screen bg-[#0a0a0f] p-6">
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl font-bold text-white mb-2">{account.account_name}</h1>
                    <p className="text-gray-400 mb-4">{account.platform}</p>
                    <div className="flex gap-3 flex-wrap">
                        <Badge className={`bg-gradient-to-r ${typeConfig.color} text-white border-0`}>
                            <TypeIcon className="w-3 h-3 mr-1" />
                            {typeConfig.label}
                        </Badge>
                        <Badge className={`border ${getRiskConfig(account.risk_level)}`}>
                            {account.risk_level.charAt(0).toUpperCase() + account.risk_level.slice(1)} Risk
                        </Badge>
                    </div>
                </motion.div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Left column */}
                    <div className="lg:col-span-2 space-y-6">
                        <BalanceOverviewCard account={account} />
                        <TransactionHistoryCard account={account} transactions={transactions} isLoading={isLoading} />
                        <BalanceGrowthChart account={account} transactions={transactions} />
                    </div>

                    {/* Right column */}
                    <div className="space-y-6">
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="sticky top-4">
                            <Card className="p-6 border border-white/5 bg-white/[0.025] backdrop-blur-sm hover:border-white/10 transition-all space-y-3">
                                <EditSavingsModal account={account} />
                                <DeleteSavingsModal account={account} />
                            </Card>
                        </motion.div>
                        <AccountDetailsCard account={account} />
                        <ProjectedValueCard account={account} />
                    </div>
                </div>
            </div>
        </div>
    )
}
