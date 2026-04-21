'use client'

export default function OfflinePage() {
    return (
        <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center text-white gap-6 px-6">
            <img src="/icons/icon-192.svg" alt="Life Tracker" className="w-24 h-24 rounded-2xl" />
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">You're offline</h1>
                <p className="text-white/50 text-sm">Check your connection and try again.</p>
            </div>
            <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors"
            >
                Try again
            </button>
        </div>
    )
}
