'use client'

import { ListChecks } from 'lucide-react'

export default function ExercisePage() {
    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <ListChecks className="w-8 h-8 text-white/40" />
                </div>
                <h1 className="text-2xl font-bold text-white">Exercise</h1>
                <p className="text-white/40 text-sm max-w-xs">
                    Coming soon — exercises will appear here.
                </p>
            </div>
        </div>
    )
}
