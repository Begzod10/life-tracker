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

/** Soft ascending major arpeggio (C5 → E5 → G5). */
export function playCorrect() {
    if (!isSoundEnabled()) return
    // Gentle peak gains + longer tails so it reads as chime, not alarm.
    blip(523.25, 0.18, 'sine', 0.14, 0)
    blip(659.25, 0.20, 'sine', 0.14, 0.07)
    blip(783.99, 0.30, 'sine', 0.18, 0.14)
}

/** Gentle two-note descent (F4 → D4) — "soft no" rather than buzzer. */
export function playWrong() {
    if (!isSoundEnabled()) return
    blip(349.23, 0.16, 'sine', 0.16, 0)      // F4
    blip(293.66, 0.30, 'sine', 0.16, 0.10)   // D4
}

/**
 * Round-complete chime: four-note ascending ladder ending on the octave.
 * Distinct from playCorrect (which is a three-note arpeggio) so the user
 * can tell "I got the question right" apart from "I cleared the round".
 */
export function playCheckpoint() {
    if (!isSoundEnabled()) return
    blip(523.25, 0.14, 'sine', 0.16, 0)      // C5
    blip(659.25, 0.14, 'sine', 0.16, 0.08)   // E5
    blip(783.99, 0.14, 'sine', 0.18, 0.16)   // G5
    blip(1046.50, 0.32, 'sine', 0.20, 0.24)  // C6
}

/**
 * Full-drill completion fanfare: held C-major chord with a high sparkle
 * on top. Noticeably bigger than the per-round checkpoint so the final
 * results screen feels earned.
 */
export function playComplete() {
    if (!isSoundEnabled()) return
    // Held C major chord underneath.
    blip(523.25, 0.55, 'sine', 0.12, 0)      // C5
    blip(659.25, 0.55, 'sine', 0.12, 0)      // E5
    blip(783.99, 0.55, 'sine', 0.12, 0)      // G5
    // Bright sparkle climbing on top.
    blip(1046.50, 0.22, 'sine', 0.16, 0.18)  // C6
    blip(1318.51, 0.45, 'sine', 0.18, 0.32)  // E6
}
