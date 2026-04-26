'use client'

import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { BookOpen, Dumbbell, ArrowRight, Trophy, Target, Zap } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useDictStats } from '@/lib/hooks/use-dictionary'
import { usePracticeHistory } from '@/lib/hooks/use-practice'

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

    const recentSessions = history.slice(0, 5)

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
                    <h1 className="text-3xl font-bold text-white">Learning</h1>
                    <p className="text-white/50 mt-1">English vocabulary and practice</p>
                </motion.div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    {[
                        { label: 'Words', value: stats?.total ?? 0, icon: BookOpen, color: 'text-blue-400' },
                        { label: 'Reviewed', value: stats?.reviewed ?? 0, icon: Target, color: 'text-green-400' },
                        { label: 'Accuracy', value: `${stats?.accuracy ?? 0}%`, icon: Trophy, color: 'text-yellow-400' },
                    ].map((s, i) => (
                        <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                            <Card className="p-5 bg-white/2.5 border border-white/5 hover:border-white/10">
                                <s.icon className={`w-5 h-5 ${s.color} mb-3`} />
                                <p className="text-2xl font-bold text-white">{s.value}</p>
                                <p className="text-xs text-white/50 mt-1">{s.label}</p>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Main sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Dictionary */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <Card
                            onClick={() => router.push(`/platform/${params.id}/learning/dictionary`)}
                            className="p-6 bg-white/2.5 border border-white/5 hover:border-blue-500/30 hover:bg-white/5 cursor-pointer transition-all group"
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
                            className="p-6 bg-white/2.5 border border-white/5 hover:border-indigo-500/30 hover:bg-white/5 cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2.5 rounded-lg bg-indigo-500/10">
                                    <Dumbbell className="w-6 h-6 text-indigo-400" />
                                </div>
                                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                            </div>
                            <h2 className="text-lg font-semibold text-white mb-1">Practice</h2>
                            <p className="text-sm text-white/50">
                                {stats && stats.total >= 2 ? 'Flashcard, Quiz, Spelling' : 'Add 2+ words to start'}
                            </p>

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
