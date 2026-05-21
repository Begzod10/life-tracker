'use client'

/**
 * Tiny synth-only sound effects for practice feedback.
 *
 * Synthesised at runtime via Web Audio rather than shipped as MP3/OGG files
 * so we don't add asset weight or hosting concerns. Tones are short
 * (<250ms) and shaped with an exponential decay envelope to avoid the
 * harsh click that raw oscillator starts produce.
 *
 * iOS / Chromium auto-suspend rules: the AudioContext is created lazily
 * on first call (which happens inside a click / swipe handler) and resumed
 * defensively each call in case the browser put it back to sleep.
 */

const SOUND_KEY = 'practice:sfx_enabled'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (ctx) return ctx
    try {
        const Ctor = window.AudioContext
            ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return null
        ctx = new Ctor()
        return ctx
    } catch {
        return null
    }
}

export function isSoundEnabled(): boolean {
    if (typeof window === 'undefined') return true
    try {
        const v = window.localStorage.getItem(SOUND_KEY)
        return v === null ? true : v === '1'
    } catch {
        return true
    }
}

export function setSoundEnabled(enabled: boolean) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(SOUND_KEY, enabled ? '1' : '0')
    } catch {
        // Storage disabled / quota — preference simply won't persist this session.
    }
}

/**
 * Schedule a single tone with a short attack + exponential decay so it
 * doesn't click. `startOffset` lets the caller stagger notes into an
 * arpeggio without juggling timers.
 *
 * If the audio context is still suspended (typical on first page load
 * before any user gesture, or after the browser auto-pauses it), we
 * defer the scheduling until `resume()` resolves. Otherwise the tones
 * would be queued against a frozen clock and silently dropped once the
 * context actually starts running.
 */
function blip(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    peakGain = 0.18,
    startOffset = 0,
) {
    const ac = getCtx()
    if (!ac) return

    const schedule = () => {
        const now = ac.currentTime + startOffset
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        osc.type = type
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(peakGain, now + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
        osc.connect(gain).connect(ac.destination)
        osc.start(now)
        osc.stop(now + duration + 0.02)
    }

    if (ac.state === 'suspended') {
        ac.resume().then(schedule).catch(() => { /* ignore — non-fatal */ })
    } else {
        schedule()
    }
}

/**
 * Call once from a user-gesture handler to wake the audio context up
 * front. Subsequent `playCorrect()` / `playWrong()` calls will then run
 * synchronously instead of paying a resume-roundtrip on the first cue.
 * Safe to call repeatedly — no-op when already running.
 */
export function primeAudio() {
    const ac = getCtx()
    if (!ac) return
    if (ac.state === 'suspended') {
        ac.resume().catch(() => { /* ignore */ })
    }
}

// ── Spoken affirmations ─────────────────────────────────────────────────────
//
// A short word from a human-ish synthesised voice layered on top of the
// chime makes the feedback feel like a friendly tutor instead of a game
// arcade. Pools are tiny + memorable; we avoid the same phrase twice in a
// row so the loop doesn't feel robotic.

const CORRECT_PHRASES = ['Nice', 'Great', 'Well done', 'Excellent', 'Perfect', 'Good job', 'Awesome']
const WRONG_PHRASES = ['Almost', 'Not quite', 'Close one', 'Try again', 'Keep going']

let lastCorrectIdx = -1
let lastWrongIdx = -1

function pickPhrase(pool: string[], lastIdx: number): { text: string; idx: number } {
    if (pool.length === 1) return { text: pool[0], idx: 0 }
    let i: number
    do {
        i = Math.floor(Math.random() * pool.length)
    } while (i === lastIdx)
    return { text: pool[i], idx: i }
}

function speakAffirmation(text: string, pitch: number, rate: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.pitch = pitch
    u.rate = rate
    u.volume = 0.85
    // Don't cancel here — the chime is web-audio, the voice is its own
    // queue. Cancelling would also kill the flashcard's word pronunciation
    // that fires when the next card advances.
    window.speechSynthesis.speak(u)
}

type FeedbackOpts = {
    /**
     * Whether to layer in a spoken affirmation alongside the chime.
     * Defaults to true. Flashcard mode passes `false` because the next
     * card's auto-TTS cancels the speech queue ~320ms after the swipe,
     * which would chop the affirmation mid-syllable.
     */
    voice?: boolean
}

/** Soft ascending major arpeggio (C5 → E5 → G5) + a warm spoken word. */
export function playCorrect(opts: FeedbackOpts = {}) {
    if (!isSoundEnabled()) return
    // Gentler peak gains + longer tails than before — feels chime-like
    // rather than alarmy.
    blip(523.25, 0.18, 'sine', 0.14, 0)
    blip(659.25, 0.20, 'sine', 0.14, 0.07)
    blip(783.99, 0.30, 'sine', 0.18, 0.14)
    if (opts.voice !== false) {
        const pick = pickPhrase(CORRECT_PHRASES, lastCorrectIdx)
        lastCorrectIdx = pick.idx
        // Slightly raised pitch + relaxed rate reads as "encouraging".
        speakAffirmation(pick.text, 1.15, 1.0)
    }
}

/**
 * Gentle two-note descent (F4 → D4) using sine waves so it feels more
 * "soft no" than buzzer. Paired with a kind spoken cue.
 */
export function playWrong(opts: FeedbackOpts = {}) {
    if (!isSoundEnabled()) return
    blip(349.23, 0.16, 'sine', 0.16, 0)      // F4
    blip(293.66, 0.30, 'sine', 0.16, 0.10)   // D4
    if (opts.voice !== false) {
        const pick = pickPhrase(WRONG_PHRASES, lastWrongIdx)
        lastWrongIdx = pick.idx
        // Lower pitch + slightly slower rate reads as "patient".
        speakAffirmation(pick.text, 0.9, 0.95)
    }
}
