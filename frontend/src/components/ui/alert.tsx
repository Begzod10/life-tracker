// src/components/ui/alert.tsx
// Переиспользуемый компонент для уведомлений об ошибках и других сообщениях

"use client"

import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type AlertVariant = 'error' | 'success' | 'info' | 'warning'

interface AlertProps {
    variant: AlertVariant
    message: string
    onClose?: () => void
    className?: string
}

// Конфигурация для разных типов alert
const alertConfig = {
    error: {
        icon: AlertCircle,
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        text: 'text-red-400',
        iconColor: 'text-red-500'
    },
    success: {
        icon: CheckCircle2,
        bg: 'bg-green-500/10',
        border: 'border-green-500/20',
        text: 'text-green-400',
        iconColor: 'text-green-500'
    },
    warning: {
        icon: AlertCircle,
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/20',
        text: 'text-yellow-400',
        iconColor: 'text-yellow-500'
    },
    info: {
        icon: Info,
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        text: 'text-blue-400',
        iconColor: 'text-blue-500'
    }
}

export function Alert({ variant, message, onClose, className }: AlertProps) {
    const config = alertConfig[variant]
    const Icon = config.icon

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
                'p-3 rounded-lg flex items-center gap-3 border',
                config.bg,
                config.border,
                className
            )}
        >
            <Icon className={cn('w-5 h-5 flex-shrink-0', config.iconColor)} />
            <span className={cn('text-sm flex-1', config.text)}>{message}</span>
            {onClose && (
                <button
                    onClick={onClose}
                    className={cn('hover:opacity-70 transition-opacity', config.iconColor)}
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </motion.div>
    )
}