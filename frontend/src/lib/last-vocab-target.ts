// Remembers the folder/module the user last saved a vocab word into so the
// next "Save to dictionary" flow can pre-select the same target. Stored in
// localStorage so it survives page reloads but stays per-device.

export const LAST_VOCAB_FOLDER_KEY = 'lt:lastVocabFolderId'
export const LAST_VOCAB_MODULE_KEY = 'lt:lastVocabModuleId'

const readId = (key: string): number | undefined => {
    if (typeof window === 'undefined') return undefined
    const raw = window.localStorage.getItem(key)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : undefined
}

export function readLastVocabTarget(): { folderId?: number; moduleId?: number } {
    return {
        folderId: readId(LAST_VOCAB_FOLDER_KEY),
        moduleId: readId(LAST_VOCAB_MODULE_KEY),
    }
}

export function rememberLastVocabTarget(folderId?: number, moduleId?: number): void {
    if (typeof window === 'undefined') return
    if (folderId) window.localStorage.setItem(LAST_VOCAB_FOLDER_KEY, String(folderId))
    else window.localStorage.removeItem(LAST_VOCAB_FOLDER_KEY)
    if (moduleId) window.localStorage.setItem(LAST_VOCAB_MODULE_KEY, String(moduleId))
    else window.localStorage.removeItem(LAST_VOCAB_MODULE_KEY)
}
