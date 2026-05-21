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

/** Bright ascending major arpeggio: C5 → E5 → G5. */
export function playCorrect() {
    if (!isSoundEnabled()) return
    blip(523.25, 0.12, 'sine', 0.18, 0)
    blip(659.25, 0.12, 'sine', 0.18, 0.06)
    blip(783.99, 0.20, 'sine', 0.22, 0.12)
}

/**
 * Two-note descending "wah-wah" dud. Sits in the mid range because phone
 * speakers roll off hard below ~300 Hz, so the earlier sub-bass version
 * was effectively silent on mobile. Sawtooth gives it a buzzy "wrong"
 * texture that doesn't blend with the success arpeggio.
 */
export function playWrong() {
    if (!isSoundEnabled()) return
    blip(392.00, 0.14, 'sawtooth', 0.22, 0)      // G4
    blip(311.13, 0.26, 'sawtooth', 0.22, 0.09)   // Eb4
}
