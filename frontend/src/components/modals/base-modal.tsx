'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { motion, AnimatePresence } from 'framer-motion'

interface BaseModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    description?: string
    children: React.ReactNode
    size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function BaseModal({
    isOpen,
    onClose,
    title,
    description,
    children,
    size = 'md'
}: BaseModalProps) {
    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl'
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className={`${sizeClasses[size]} bg-[#1a1b26] border-[#2a2b36]`}>
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">
                        {title}
                    </DialogTitle>
                    {description && (
                        <DialogDescription className="text-gray-400">
                            {description}
                        </DialogDescription>
                    )}
                </DialogHeader>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    {children}
                </motion.div>
            </DialogContent>
        </Dialog>
    )
}