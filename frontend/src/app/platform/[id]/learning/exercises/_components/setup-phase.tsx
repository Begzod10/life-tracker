'use client'

import { motion } from 'framer-motion'
import { Loader2, PenLine, Sparkles, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useFolders, useModules } from '@/lib/hooks/use-dictionary'
import type { ExerciseMode, Source } from '@/lib/hooks/use-exercises'
import { COUNT_OPTIONS } from './shared'

interface SetupPhaseProps {
    source: Source
    setSource: (v: Source) => void
    mode: ExerciseMode
    setMode: (v: ExerciseMode) => void
    count: number
    setCount: (v: number) => void
    folderId: number | undefined
    setFolderId: (v: number | undefined) => void
    moduleId: number | undefined
    setModuleId: (v: number | undefined) => void
    startRun: () => void
    error: string | null
    isLoading: boolean
}

const SOURCE_OPTIONS: { id: Source; label: string; hint: string }[] = [
    { id: 'smart', label: 'Smart mix', hint: 'Default' },
    { id: 'due', label: 'Due review', hint: 'SRS due' },
    { id: 'weak', label: 'Weak words', hint: '<70% acc' },
    { id: 'all', label: 'All words', hint: 'Random' },
]

const MODE_OPTIONS: { id: ExerciseMode; label: string; hint: string }[] = [
    { id: 'auto', label: 'Smart', hint: 'SRS-driven' },
    { id: 'recognition', label: 'Recognition', hint: 'MC only' },
    { id: 'cloze', label: 'Fill-in', hint: 'Cloze/Spelling' },
    { id: 'production', label: 'Writing', hint: 'Sentences' },
    { id: 'mixed', label: 'Mixed', hint: 'Variety' },
]

export function SetupPhase({
    source, setSource,
    mode, setMode,
    count, setCount,
    folderId, setFolderId,
    moduleId, setModuleId,
    startRun, error, isLoading,
}: SetupPhaseProps) {
    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
        >
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 rounded-lg bg-amber-500/10">
                        <PenLine className="w-5 h-5 text-amber-400" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Exercises</h1>
                </div>
                <p className="text-sm text-white/50">
                    Practice vocabulary with different question types. Correct answers strengthen SRS intervals.
                </p>
            </div>

            <Card className="p-5 sm:p-6 bg-white/2.5 border border-white/5 space-y-6">
                {/* Mode */}
                <section>
                    <h2 className="text-xs uppercase tracking-wide text-white/40 mb-3">Exercise mode</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {MODE_OPTIONS.map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => setMode(opt.id)}
                                className={`px-3 py-3 rounded-lg border text-left transition-colors ${
                                    mode === opt.id
                                        ? 'border-amber-500/50 bg-amber-500/10 text-white'
                                        : 'border-white/10 hover:border-white/20 bg-white/2.5 text-white/70'
                                }`}
                            >
                                <div className="text-sm font-medium">{opt.label}</div>
                                <div className="text-[11px] text-white/40 mt-0.5">{opt.hint}</div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Source */}
                <section>
                    <h2 className="text-xs uppercase tracking-wide text-white/40 mb-3">Word source</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {SOURCE_OPTIONS.map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => setSource(opt.id)}
                                className={`px-3 py-3 rounded-lg border text-left transition-colors ${
                                    source === opt.id
                                        ? 'border-amber-500/50 bg-amber-500/10 text-white'
                                        : 'border-white/10 hover:border-white/20 bg-white/2.5 text-white/70'
                                }`}
                            >
                                <div className="text-sm font-medium">{opt.label}</div>
                                <div className="text-[11px] text-white/40 mt-0.5">{opt.hint}</div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Folder / Module */}
                <section>
                    <h2 className="text-xs uppercase tracking-wide text-white/40 mb-3">Scope</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                            value={folderId ?? ''}
                            onChange={(e) =>
                                setFolderId(e.target.value ? Number(e.target.value) : undefined)
                            }
                            className="bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-colors"
                        >
                            <option value="">All folders</option>
                            {(folders as { id: number; name: string }[]).map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                        <select
                            value={moduleId ?? ''}
                            onChange={(e) =>
                                setModuleId(e.target.value ? Number(e.target.value) : undefined)
                            }
                            disabled={!folderId}
                            className="bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 disabled:opacity-50 transition-colors"
                        >
                            <option value="">{folderId ? 'All modules in folder' : 'Pick a folder first'}</option>
                            {(modules as { id: number; name: string }[]).map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                </section>

                {/* Count */}
                <section>
                    <h2 className="text-xs uppercase tracking-wide text-white/40 mb-3">How many words</h2>
                    <div className="flex gap-2">
                        {COUNT_OPTIONS.map((n) => (
                            <button
                                key={n}
                                onClick={() => setCount(n)}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                    count === n
                                        ? 'border-amber-500/50 bg-amber-500/10 text-white'
                                        : 'border-white/10 hover:border-white/20 bg-white/2.5 text-white/70'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </section>

                {error && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                        <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <span className="text-sm text-red-200">{error}</span>
                    </div>
                )}

                <Button
                    onClick={startRun}
                    disabled={isLoading}
                    className="w-full h-11 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Loading…
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Start exercises
                        </>
                    )}
                </Button>
            </Card>
        </motion.div>
    )
}
