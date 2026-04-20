'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, X, Send, Loader2, Sparkles, ChevronDown, ListTodo, CheckCircle2, ChevronRight } from 'lucide-react'
import { API_ENDPOINTS } from '@/lib/api/endpoints'
import { AuthTokens } from '@/lib/utils/auth'
import { useGoalsList } from '@/lib/hooks/use-goals'
import { useUser } from '@/lib/hooks/use-auth'
import { useQueryClient } from '@tanstack/react-query'

type Message = {
    id: string
    role: 'user' | 'assistant'
    content: string
    tasks?: CreatedTask[]      // injected when AI creates tasks
    taskGoal?: string
    taskSummary?: string
}

type CreatedTask = {
    id: number
    name: string
    description?: string
    task_type: string
    due_date?: string
    priority: string
}

type Goal = {
    id: number
    name: string
    status: string
}

function generateId() {
    return Math.random().toString(36).slice(2)
}

const PRIORITY_COLOR: Record<string, string> = {
    high: 'text-red-400',
    medium: 'text-yellow-400',
    low: 'text-green-400',
}

// ─── Task Creation Panel ──────────────────────────────────────────────────────
function CreateTasksPanel({
    onCreated,
    onCancel,
}: {
    onCreated: (msg: Message) => void
    onCancel: () => void
}) {
    const { data: user } = useUser()
    const { data: goals = [] } = useGoalsList(user?.id)
    const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null)
    const [instructions, setInstructions] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const queryClient = useQueryClient()

    const activeGoals = (goals as Goal[]).filter(g => g.status !== 'completed')

    const handleCreate = async () => {
        if (!selectedGoalId) return
        setIsLoading(true)
        try {
            const token = AuthTokens.getAccessToken()
            const res = await fetch(API_ENDPOINTS.AI_COACH.CREATE_TASKS, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    goal_id: selectedGoalId,
                    context: instructions || undefined,
                }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || 'Failed')
            }
            const data = await res.json()

            // Invalidate tasks cache so they appear in the app
            queryClient.invalidateQueries({ queryKey: ['tasks'] })

            onCreated({
                id: generateId(),
                role: 'assistant',
                content: '',
                tasks: data.tasks,
                taskGoal: data.goal_name,
                taskSummary: data.ai_summary,
            })
        } catch (e: unknown) {
            onCreated({
                id: generateId(),
                role: 'assistant',
                content: e instanceof Error ? `Error: ${e.message}` : 'Something went wrong.',
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="px-3 py-3 border-t border-[#2a2b36] space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                    <ListTodo className="w-3.5 h-3.5" />
                    Create tasks with Groq
                </p>
                <button onClick={onCancel} className="text-gray-500 hover:text-gray-300">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Goal selector */}
            <select
                value={selectedGoalId ?? ''}
                onChange={e => setSelectedGoalId(Number(e.target.value) || null)}
                className="w-full bg-[#1e1f2e] border border-[#2a2b36] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors"
            >
                <option value="">Select a goal…</option>
                {activeGoals.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                ))}
            </select>

            {/* Optional instructions */}
            <input
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="Extra instructions (optional)…"
                className="w-full bg-[#1e1f2e] border border-[#2a2b36] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-violet-500 transition-colors"
            />

            <button
                onClick={handleCreate}
                disabled={!selectedGoalId || isLoading}
                className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Groq is generating…
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4" />
                        Generate & create tasks
                    </>
                )}
            </button>
        </div>
    )
}

// ─── Task Result Bubble ───────────────────────────────────────────────────────
function TaskResultBubble({ msg }: { msg: Message }) {
    return (
        <div className="flex gap-2 flex-row">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-[#1e1f2e] border border-[#2a2b36] px-3 py-2.5 text-sm space-y-2.5">
                <p className="text-purple-300 font-semibold text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    {msg.tasks?.length} tasks created for <span className="text-white">{msg.taskGoal}</span>
                </p>

                {msg.taskSummary && (
                    <p className="text-gray-400 text-xs leading-relaxed">{msg.taskSummary}</p>
                )}

                <div className="space-y-1.5">
                    {msg.tasks?.map(t => (
                        <div key={t.id} className="flex items-start gap-2 bg-white/4 rounded-lg px-2.5 py-2">
                            <ChevronRight className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-medium truncate">{t.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-xs ${PRIORITY_COLOR[t.priority] ?? 'text-gray-400'}`}>
                                        {t.priority}
                                    </span>
                                    <span className="text-white/30 text-xs">·</span>
                                    <span className="text-white/40 text-xs">{t.task_type}</span>
                                    {t.due_date && (
                                        <>
                                            <span className="text-white/30 text-xs">·</span>
                                            <span className="text-white/40 text-xs">{t.due_date}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AICoach() {
    const [isOpen, setIsOpen] = useState(false)
    const [showCreatePanel, setShowCreatePanel] = useState(false)
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: "Hi! I'm your AI Life Coach. I have access to your goals, tasks, and finances. What would you like to work on today?",
        },
    ])
    const [input, setInput] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [isOpen])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const sendMessage = useCallback(async () => {
        const text = input.trim()
        if (!text || isStreaming) return

        const userMsg: Message = { id: generateId(), role: 'user', content: text }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setIsStreaming(true)

        const assistantId = generateId()
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

        abortRef.current = new AbortController()

        try {
            const token = AuthTokens.getAccessToken()
            const history = [...messages, userMsg]
                .filter(m => m.id !== 'welcome' || m.role === 'assistant')
                .map(m => ({ role: m.role, content: m.content }))

            const res = await fetch(API_ENDPOINTS.AI_COACH.CHAT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ messages: history }),
                signal: abortRef.current.signal,
            })

            if (!res.ok) {
                throw new Error(await res.text())
            }

            const reader = res.body!.getReader()
            const decoder = new TextDecoder()
            let accumulated = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split('\n')

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    const data = line.slice(6)
                    if (data === '[DONE]') break
                    try {
                        const { content } = JSON.parse(data)
                        accumulated += content
                        setMessages(prev =>
                            prev.map(m =>
                                m.id === assistantId ? { ...m, content: accumulated } : m
                            )
                        )
                    } catch {}
                }
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== 'AbortError') {
                setMessages(prev =>
                    prev.map(m =>
                        m.id === assistantId
                            ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
                            : m
                    )
                )
            }
        } finally {
            setIsStreaming(false)
            abortRef.current = null
        }
    }, [input, isStreaming, messages])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const handleTasksCreated = (msg: Message) => {
        setMessages(prev => [...prev, msg])
        setShowCreatePanel(false)
    }

    return (
        <>
            {/* Floating Button */}
            <motion.button
                onClick={() => setIsOpen(v => !v)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg shadow-purple-900/40 flex items-center justify-center hover:scale-105 transition-transform"
                whileTap={{ scale: 0.95 }}
                title="AI Life Coach"
            >
                <AnimatePresence mode="wait" initial={false}>
                    {isOpen ? (
                        <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                            <ChevronDown className="w-6 h-6 text-white" />
                        </motion.span>
                    ) : (
                        <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                            <Sparkles className="w-6 h-6 text-white" />
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.button>

            {/* Chat Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-50 sm:w-[380px] max-h-[80vh] sm:max-h-[580px] flex flex-col rounded-2xl border border-[#2a2b36] bg-[#13141f] shadow-2xl shadow-black/60 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2b36] bg-gradient-to-r from-violet-900/40 to-purple-900/20">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">AI Life Coach</p>
                                <p className="text-xs text-purple-400">Powered by Groq · Llama 3.3</p>
                            </div>
                            <button
                                onClick={() => setShowCreatePanel(v => !v)}
                                title="Create tasks with Groq"
                                className={`p-1.5 rounded-lg transition-colors ${showCreatePanel ? 'text-purple-400 bg-purple-500/20' : 'text-gray-400 hover:text-purple-400 hover:bg-white/10'}`}
                            >
                                <ListTodo className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                            {messages.map(msg => (
                                msg.tasks ? (
                                    <TaskResultBubble key={msg.id} msg={msg} />
                                ) : (
                                    <div
                                        key={msg.id}
                                        className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                                    >
                                        {msg.role === 'assistant' && (
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <Bot className="w-3.5 h-3.5 text-white" />
                                            </div>
                                        )}
                                        <div
                                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                                                msg.role === 'user'
                                                    ? 'bg-violet-600 text-white rounded-tr-sm'
                                                    : 'bg-[#1e1f2e] text-gray-200 border border-[#2a2b36] rounded-tl-sm'
                                            }`}
                                        >
                                            {msg.content || (
                                                <span className="flex gap-1 items-center py-0.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Create Tasks Panel or Input */}
                        <AnimatePresence mode="wait">
                            {showCreatePanel ? (
                                <motion.div
                                    key="create-panel"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <CreateTasksPanel
                                        onCreated={handleTasksCreated}
                                        onCancel={() => setShowCreatePanel(false)}
                                    />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="input"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="px-3 py-3 border-t border-[#2a2b36] flex gap-2"
                                >
                                    <input
                                        ref={inputRef}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask your life coach..."
                                        disabled={isStreaming}
                                        className="flex-1 bg-[#1e1f2e] border border-[#2a2b36] rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
                                    />
                                    <button
                                        onClick={sendMessage}
                                        disabled={!input.trim() || isStreaming}
                                        className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
                                    >
                                        {isStreaming ? (
                                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4 text-white" />
                                        )}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
