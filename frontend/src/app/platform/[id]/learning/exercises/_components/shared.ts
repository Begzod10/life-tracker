export const COUNT_OPTIONS = [3, 5, 8, 10] as const

export const DIFF_COLOR: Record<string, string> = {
    A1: 'text-green-400',
    A2: 'text-emerald-400',
    B1: 'text-blue-400',
    B2: 'text-indigo-400',
    C1: 'text-purple-400',
    C2: 'text-rose-400',
}

export function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.95
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
}

export function containsTargetWord(sentence: string, target: string): boolean {
    if (!sentence || !target) return false
    const stem = target.toLowerCase().replace(/[^a-z']/g, '')
    if (!stem) return false
    const escaped = stem.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    return new RegExp(`\\b${escaped}(s|es|ed|d|ing|er|est|ly|ies|ied)?\\b`, 'i').test(sentence)
}
