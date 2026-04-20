import { useEffect, useRef } from 'react'

const SESSION_KEY = 'voice_greeted'

function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

function pickFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    // Priority list — most natural/pleasant female voices across platforms
    const preferred = [
        'Google UK English Female',
        'Microsoft Aria Online (Natural) - English (United States)',
        'Microsoft Zira - English (United States)',
        'Microsoft Hazel - English (Great Britain)',
        'Samantha',           // macOS
        'Karen',              // macOS Australian
        'Moira',              // macOS Irish
        'Victoria',           // macOS
        'Google US English',  // fallback Google voice
    ]

    for (const name of preferred) {
        const match = voices.find(v => v.name === name)
        if (match) return match
    }

    // Fallback: any English female-leaning voice
    return (
        voices.find(v => /female/i.test(v.name) && /en[-_]/i.test(v.lang)) ??
        voices.find(v => /en[-_]/i.test(v.lang)) ??
        voices[0] ??
        null
    )
}

export function useVoiceGreeting(name: string | undefined) {
    const spoken = useRef(false)

    useEffect(() => {
        if (!name) return
        if (spoken.current) return
        if (sessionStorage.getItem(SESSION_KEY)) return
        if (typeof window === 'undefined' || !window.speechSynthesis) return

        spoken.current = true

        const greet = () => {
            const voices = window.speechSynthesis.getVoices()
            const voice = pickFemaleVoice(voices)

            const firstName = name.split(' ')[0]
            const greeting = getGreeting()
            const text = `${greeting}, ${firstName}! Welcome back to your life tracker. Let's make today count.`

            const utt = new SpeechSynthesisUtterance(text)
            if (voice) utt.voice = voice
            utt.rate = 0.95
            utt.pitch = 1.1
            utt.volume = 0.9

            window.speechSynthesis.cancel()
            window.speechSynthesis.speak(utt)
            sessionStorage.setItem(SESSION_KEY, '1')
        }

        // Voices may not be loaded yet on first render
        const voices = window.speechSynthesis.getVoices()
        if (voices.length > 0) {
            greet()
        } else {
            window.speechSynthesis.addEventListener('voiceschanged', greet, { once: true })
        }

        return () => {
            window.speechSynthesis.removeEventListener('voiceschanged', greet)
        }
    }, [name])
}
