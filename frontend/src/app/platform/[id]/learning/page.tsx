'use client'

import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { BookOpen, Dumbbell, ArrowRight, Trophy, Target, Zap, FileText, PenLine, Library, Flame, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useDictStats } from '@/lib/hooks/use-dictionary'
import { usePracticeHistory, useDueCounts, useDailyStreak } from '@/lib/hooks/use-practice'
import { useLibraryStats } from '@/lib/hooks/use-books'

const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DIFF_COLOR: Record<string, string> = {
    A1: 'text-green-400', A2: 'text-emerald-400',
    B1: 'text-blue-400', B2: 'text-indigo-400',
    C1: 'text-purple-400', C2: 'text-rose-400',
}

export default function LearningPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const { data: stats } = useDictStats()
    const { data: history = [] } = usePracticeHistory()
    const { data: libraryStats } = useLibraryStats()
    const { data: dueCounts } = useDueCounts()
    const { streak, practicedToday } = useDailyStreak()

    const recentSessions = history.slice(0, 5)

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-10">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Learning</h1>
                    <p className="text-sm text-white/50 mt-1">English vocabulary and practice</p>
                </motion.div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
                    {[
                        { label: 'Words', value: stats?.total ?? 0, icon: BookOpen, color: 'text-blue-400' },
                        { label: 'Reviewed', value: stats?.reviewed ?? 0, icon: Target, color: 'text-green-400' },
                        { label: 'Accuracy', value: `${stats?.accuracy ?? 0}%`, icon: Trophy, color: 'text-yellow-400' },
                    ].map((s, i) => (
                        <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                            <Card className="p-3 sm:p-5 bg-white/2.5 border border-white/5 hover:border-white/10">
                                <s.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.color} mb-2 sm:mb-3`} />
                                <p className="text-xl sm:text-2xl font-bold text-white">{s.value}</p>
                                <p className="text-[10px] sm:text-xs text-white/50 mt-1">{s.label}</p>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Main sections */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-6 mb-8">
                    {/* Dictionary */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <Card
                            onClick={() => router.push(`/platform/${params.id}/learning/dictionary`)}
                            className="p-4 sm:p-6 bg-white/2.5 border border-white/5 hover:border-blue-500/30 hover:bg-white/5 cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2.5 rounded-lg bg-blue-500/10">
                                    <BookOpen className="w-6 h-6 text-blue-400" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                            </div>
                            <h2 className="text-lg font-semibold text-white mb-1">Dictionary</h2>
                            <p className="text-sm text-white/50">
                                {stats?.total ? `${stats.total} words saved` : 'Add your first word'}
                            </p>

                            {/* By difficulty breakdown */}
                            {stats?.by_difficulty && Object.keys(stats.by_difficulty).length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {DIFFICULTIES.filter(d => stats.by_difficulty[d]).map(d => (
                                        <span key={d} className={`text-xs font-medium ${DIFF_COLOR[d]}`}>
                                            {d}: {stats.by_difficulty[d]}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </motion.div>

                    {/* Practice */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <Card
                            onClick={() => router.push(`/platform/${params.id}/learning/practice`)}
                            className="p-4 sm:p-6 bg-white/2.5 border border-white/5 hover:border-indigo-500/30 hover:bg-white/5 cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2.5 rounded-lg bg-indigo-500/10">
                                    <Dumbbell className="w-6 h-6 text-indigo-400" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                            </div>
                            <h2 className="text-lg font-semibold text-white mb-1">Practice</h2>
                            <p className="text-sm text-white/50">
                                {stats && stats.total >= 2 ? 'Flashcard, Quiz, Spelling, Cloze' : 'Add 2+ words to start'}
                            </p>

                            {/* Streak + due chips — primary motivator on this card.
                                Hidden until the user has at least started practicing. */}
                            {(streak > 0 || (dueCounts && dueCounts.due > 0)) && (
                                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                                    {streak > 0 && (
                                        <span
                                            title={practicedToday
                                                ? `${streak}-day streak`
                                                : `${streak}-day streak — practice today to keep it`}
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                                practicedToday
                                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                                    : 'border-white/15 bg-white/5 text-white/60'
                                            }`}
                                        >
                                            <Flame className={`w-3 h-3 ${practicedToday ? 'text-amber-300' : 'text-white/40'}`} />
                                            {streak}
                                        </span>
                                    )}
                                    {dueCounts && dueCounts.due > 0 && (
                                        <span
                                            title="Words whose review interval has elapsed"
                                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                        >
                                            <Clock className="w-3 h-3" />
                                            {dueCounts.due} due
                                        </span>
                                    )}
                                </div>
                            )}

                            {recentSessions.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-xs text-white/40 mb-2">Recent sessions</p>
                                    <div className="space-y-1">
                                        {recentSessions.slice(0, 3).map(s => (
                                            <div key={s.id} className="flex justify-between text-xs">
                                                <span className="text-white/60 capitalize">{s.mode}</span>
                                                <span className="text-white/50">
                                                    {s.correct_answers}/{s.total_questions}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>
                    </motion.div>

                    {/* Reading mode */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <Card
                            onClick={() => router.push(`/platform/${params.id}/learning/reading`)}
                            className="p-4 sm:p-6 bg-white/2.5 border border-white/5 hover:border-emerald-500/30 hover:bg-white/5 cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2.5 rounded-lg bg-emerald-500/10">
                                    <FileText className="w-6 h-6 text-emerald-400" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                            </div>
                            <h2 className="text-lg font-semibold text-white mb-1">Reading</h2>
                            <p className="text-sm text-white/50">
                                Paste any text — AI mines vocabulary at your level.
                            </p>
                        </Card>
                    </motion.div>

                    {/* Writing */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                        <Card
                            onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                            className="p-4 sm:p-6 bg-white/2.5 border border-white/5 hover:border-amber-500/30 hover:bg-white/5 cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2.5 rounded-lg bg-amber-500/10">
                                    <PenLine className="w-6 h-6 text-amber-400" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                            </div>
                            <h2 className="text-lg font-semibold text-white mb-1">Writing</h2>
                            <p className="text-sm text-white/50">
                                AI-graded essays. Quick check or deep review.
                            </p>
                        </Card>
                    </motion.div>

                    {/* Library */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                        <Card
                            onClick={() => router.push(`/platform/${params.id}/learning/library`)}
                            className="p-4 sm:p-6 bg-white/2.5 border border-white/5 hover:border-violet-500/30 hover:bg-white/5 cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2.5 rounded-lg bg-violet-500/10">
                                    <Library className="w-6 h-6 text-violet-400" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                            </div>
                            <h2 className="text-lg font-semibold text-white mb-1">Library</h2>
                            <p className="text-sm text-white/50">
                                {libraryStats?.total_books
                                    ? `${libraryStats.total_books} book${libraryStats.total_books === 1 ? '' : 's'}${
                                          libraryStats.pages_last_30d
                                              ? ` · ${libraryStats.pages_last_30d}p · 30d`
                                              : ''
                                      }`
                                    : 'Upload PDFs, save words as you read'}
                            </p>
                            {libraryStats && libraryStats.by_status?.reading > 0 && (
                                <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-amber-300/80">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    {libraryStats.by_status.reading} reading now
                                </div>
                            )}
                        </Card>
                    </motion.div>
                </div>

                {/* Quick tip */}
                {(!stats || stats.total < 2) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                        <Card className="p-4 bg-blue-500/5 border border-blue-500/20">
                            <div className="flex items-center gap-3">
                                <Zap className="w-4 h-4 text-blue-400 shrink-0" />
                                <p className="text-sm text-white/70">
                                    Start by adding words to your dictionary. Add at least 2 to unlock practice mode.
                                </p>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </div>
        </div>
    )
}
