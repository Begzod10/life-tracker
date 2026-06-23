'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Trophy, Flame, ArrowUpCircle, Target, BookHeart, Check, Loader2, Sparkles, RefreshCw } from 'lucide-react'
import { useDailyLog, useDailyLogUpsert, useDailyLogAnalyze, type DailyLogPayload } from '@/lib/hooks/use-daily-log'

function toLocalDate(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, n: number) {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + n)
    return toLocalDate(d)
}

function formatDisplay(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const MOOD_EMOJIS = ['', '😞', '😟', '😕', '😐', '🙂', '😊', '😄', '😁', '🤩', '🥳']
const ENERGY_EMOJIS = ['', '🪫', '😴', '😪', '🥱', '😑', '🙂', '💪', '⚡', '🚀', '⚡🔥']

function Slider({ label, emoji, value, onChange }: {
    label: string; emoji: string[]; value: number; onChange: (v: number) => void
}) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white/60">{label}</span>
                <span className="text-xl">{value > 0 ? emoji[value] : '—'} <span className="text-white/40 text-sm ml-1">{value > 0 ? value : ''}</span></span>
            </div>
            <div className="flex gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <button
                        key={n}
                        onClick={() => onChange(n)}
                        className={`flex-1 h-8 rounded text-xs font-semibold transition-all ${
                            value >= n
                                ? 'bg-indigo-500 text-white'
                                : 'bg-white/5 text-white/30 hover:bg-white/10'
                        }`}
                    >
                        {n}
                    </button>
                ))}
            </div>
        </div>
    )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <span className="text-white/50">{icon}</span>
                <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">{title}</h3>
            </div>
            {children}
        </div>
    )
}

const TEXTAREA_CLASS = "w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white/90 placeholder-white/25 resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all min-h-[100px]"
const INPUT_CLASS = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/90 placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"

type Form = {
    mood: number
    energy: number
    journal: string
    wins: string
    challenges: string
    improvements: string
    intention_1: string
    intention_2: string
    intention_3: string
}

const EMPTY_FORM: Form = {
    mood: 0, energy: 0,
    journal: '', wins: '', challenges: '', improvements: '',
    intention_1: '', intention_2: '', intention_3: '',
}

export default function DailyLogPage() {
    useParams<{ id: string }>()
    const today = toLocalDate(new Date())
    const [date, setDate] = useState(today)
    const [form, setForm] = useState<Form>(EMPTY_FORM)
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

    const { data: existing, isLoading, error } = useDailyLog(date)
    const upsert = useDailyLogUpsert()
    const analyze = useDailyLogAnalyze()

    useEffect(() => {
        if (existing) {
            setForm({
                mood: existing.mood ?? 0,
                energy: existing.energy ?? 0,
                journal: existing.journal ?? '',
                wins: existing.wins ?? '',
                challenges: existing.challenges ?? '',
                improvements: existing.improvements ?? '',
                intention_1: existing.intention_1 ?? '',
                intention_2: existing.intention_2 ?? '',
                intention_3: existing.intention_3 ?? '',
            })
        } else if (error) {
            setForm(EMPTY_FORM)
        }
    }, [existing, error, date])

    const save = useCallback(async (overrides?: Partial<Form>) => {
        const data = { ...form, ...overrides }
        setSaveState('saving')
        const payload: DailyLogPayload = {
            date,
            mood: data.mood > 0 ? data.mood : null,
            energy: data.energy > 0 ? data.energy : null,
            journal: data.journal || null,
            wins: data.wins || null,
            challenges: data.challenges || null,
            improvements: data.improvements || null,
            intention_1: data.intention_1 || null,
            intention_2: data.intention_2 || null,
            intention_3: data.intention_3 || null,
        }
        await upsert.mutateAsync(payload)
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
    }, [form, date, upsert])

    const set = (field: keyof Form) => (val: string | number) =>
        setForm(prev => ({ ...prev, [field]: val }))

    const blurSave = (field: keyof Form) => (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        save({ [field]: e.target.value })
    }

    const isFuture = date > today

    return (
        <div className="min-h-screen p-3 sm:p-6">
            <div className="max-w-2xl mx-auto flex flex-col gap-5">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <BookHeart className="w-6 h-6 text-indigo-400" />
                        <div>
                            <h1 className="text-xl font-bold text-white">Daily Log</h1>
                            <p className="text-xs text-white/40">Evening reflection</p>
                        </div>
                    </div>

                    {/* Date nav */}
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDate(d => addDays(d, -1))}
                            className="p-1.5 rounded-lg hover:bg-white/8 text-white/50 hover:text-white transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDate(today)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                date === today ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-white/50 hover:bg-white/8'
                            }`}>
                            Today
                        </button>
                        <span className="text-sm text-white/70 hidden sm:block">{formatDisplay(date)}</span>
                        <button onClick={() => setDate(d => addDays(d, 1))}
                            disabled={date >= today}
                            className="p-1.5 rounded-lg hover:bg-white/8 text-white/50 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <p className="text-sm text-white/50 sm:hidden">{formatDisplay(date)}</p>

                {isFuture && (
                    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-center text-sm text-white/40">
                        You can&apos;t log a future day.
                    </div>
                )}

                {!isFuture && isLoading && (
                    <div className="flex justify-center py-16">
                        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                    </div>
                )}

                {!isFuture && !isLoading && (
                    <>
                        {/* Mood & Energy */}
                        <Section icon={<span className="text-base">🎭</span>} title="Mood & Energy">
                            <Slider label="Mood" emoji={MOOD_EMOJIS} value={form.mood}
                                onChange={v => { set('mood')(v); save({ mood: v }) }} />
                            <Slider label="Energy" emoji={ENERGY_EMOJIS} value={form.energy}
                                onChange={v => { set('energy')(v); save({ energy: v }) }} />
                        </Section>

                        {/* Journal */}
                        <Section icon={<BookHeart className="w-4 h-4" />} title="Journal">
                            <textarea
                                className={TEXTAREA_CLASS}
                                placeholder="How was your day? Write anything..."
                                value={form.journal}
                                onChange={e => set('journal')(e.target.value)}
                                onBlur={blurSave('journal')}
                                rows={5}
                            />
                        </Section>

                        {/* Wins */}
                        <Section icon={<Trophy className="w-4 h-4 text-yellow-400" />} title="Wins">
                            <textarea
                                className={TEXTAREA_CLASS}
                                placeholder="What went well today?"
                                value={form.wins}
                                onChange={e => set('wins')(e.target.value)}
                                onBlur={blurSave('wins')}
                                rows={3}
                            />
                        </Section>

                        {/* Challenges */}
                        <Section icon={<Flame className="w-4 h-4 text-orange-400" />} title="Challenges">
                            <textarea
                                className={TEXTAREA_CLASS}
                                placeholder="What was hard or didn&apos;t go as planned?"
                                value={form.challenges}
                                onChange={e => set('challenges')(e.target.value)}
                                onBlur={blurSave('challenges')}
                                rows={3}
                            />
                        </Section>

                        {/* Improvements */}
                        <Section icon={<ArrowUpCircle className="w-4 h-4 text-cyan-400" />} title="Improvements">
                            <textarea
                                className={TEXTAREA_CLASS}
                                placeholder="What would you do differently?"
                                value={form.improvements}
                                onChange={e => set('improvements')(e.target.value)}
                                onBlur={blurSave('improvements')}
                                rows={3}
                            />
                        </Section>

                        {/* Tomorrow's intentions */}
                        <Section icon={<Target className="w-4 h-4 text-emerald-400" />} title="Tomorrow's Intentions">
                            <div className="flex flex-col gap-2">
                                {(['intention_1', 'intention_2', 'intention_3'] as const).map((field, i) => (
                                    <div key={field} className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-white/30 w-5 shrink-0">{i + 1}</span>
                                        <input
                                            className={INPUT_CLASS}
                                            placeholder={`Priority ${i + 1}`}
                                            value={form[field]}
                                            onChange={e => set(field)(e.target.value)}
                                            onBlur={blurSave(field)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </Section>

                        {/* AI Reflection */}
                        <Section icon={<Sparkles className="w-4 h-4 text-violet-400" />} title="AI Reflection">
                            {existing?.ai_reflection ? (
                                <div className="flex flex-col gap-3">
                                    <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                                        {existing.ai_reflection}
                                    </p>
                                    <button
                                        onClick={() => analyze.mutate(date)}
                                        disabled={analyze.isPending}
                                        className="self-start flex items-center gap-1.5 text-xs text-white/40 hover:text-violet-300 transition-colors disabled:opacity-40"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${analyze.isPending ? 'animate-spin' : ''}`} />
                                        Regenerate
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <p className="text-sm text-white/40">
                                        Save your log first, then get a personal AI reflection on your day.
                                    </p>
                                    <button
                                        onClick={() => analyze.mutate(date)}
                                        disabled={analyze.isPending}
                                        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-sm font-medium transition-all disabled:opacity-50"
                                    >
                                        {analyze.isPending ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                                        ) : (
                                            <><Sparkles className="w-4 h-4" /> Generate reflection</>
                                        )}
                                    </button>
                                    {analyze.isError && (
                                        <p className="text-xs text-rose-400">Failed to generate. Make sure your log has some content.</p>
                                    )}
                                </div>
                            )}
                        </Section>

                        {/* Save button */}
                        <button
                            onClick={() => save()}
                            disabled={upsert.isPending}
                            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            {saveState === 'saving' || upsert.isPending ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                            ) : saveState === 'saved' ? (
                                <><Check className="w-4 h-4" /> Saved</>
                            ) : (
                                'Save Log'
                            )}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
