// Remembers the folder/module the user last saved a vocab word into so the
// next "Save to dictionary" flow can pre-select the same target. Stored in
// localStorage so it survives page reloads but stays per-device.
//
// Two scopes are kept:
//   - global  : last save from anywhere (reading page, any book)
//   - per-book: last save from a specific book. Each book carries its own
//               last-used pair, so when you reopen a different book you get
//               that book's history back instead of bleeding the previous
//               book's target into it.
//
// The reader prefers the per-book pair and falls back to the global one.

export const LAST_VOCAB_FOLDER_KEY = 'lt:lastVocabFolderId'
export const LAST_VOCAB_MODULE_KEY = 'lt:lastVocabModuleId'
const BOOK_TARGET_PREFIX = 'lt:lastVocabTarget:book:'

export interface VocabTarget {
    folderId?: number
    moduleId?: number
}

const readId = (key: string): number | undefined => {
    if (typeof window === 'undefined') return undefined
    const raw = window.localStorage.getItem(key)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : undefined
}

const sanitizeId = (n: unknown): number | undefined =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined

export function readLastVocabTarget(): VocabTarget {
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

export function readLastVocabTargetForBook(bookId: number): VocabTarget {
    if (typeof window === 'undefined' || !bookId) return {}
    const raw = window.localStorage.getItem(`${BOOK_TARGET_PREFIX}${bookId}`)
    if (!raw) return {}
    try {
        const parsed = JSON.parse(raw) as VocabTarget
        return {
            folderId: sanitizeId(parsed.folderId),
            moduleId: sanitizeId(parsed.moduleId),
        }
    } catch {
        return {}
    }
}

export function rememberLastVocabTargetForBook(
    bookId: number, folderId?: number, moduleId?: number,
): void {
    if (typeof window === 'undefined' || !bookId) return
    const key = `${BOOK_TARGET_PREFIX}${bookId}`
    if (!folderId && !moduleId) {
        window.localStorage.removeItem(key)
        return
    }
    window.localStorage.setItem(key, JSON.stringify({ folderId, moduleId }))
}
