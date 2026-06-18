'use client'

import type { ExerciseItem } from '@/lib/hooks/use-exercises'
import { MultipleChoice } from './multiple-choice'
import { ClozeInput } from './cloze-input'
import { SpellingInput } from './spelling-input'
import { AnagramInput } from './anagram-input'
import { SentenceInput } from './sentence-input'
import { WordFormationInput } from './word-formation-input'
import { ErrorCorrectionInput } from './error-correction-input'
import { ClozeChoiceWidget } from './cloze-choice-widget'

interface Props {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    disabled?: boolean
}

export function ExerciseWidget({ item, value, onChange, disabled }: Props) {
    switch (item.exercise_type) {
        case 'collocation_mc':
        case 'meaning_mc':
        case 'reverse_mc':
        case 'synonym_antonym':
        case 'odd_one_out':
            return <MultipleChoice item={item} value={value} onChange={onChange} disabled={disabled} />
        case 'cloze':
            return <ClozeInput item={item} value={value} onChange={onChange} disabled={disabled} />
        case 'cloze_choice':
            return <ClozeChoiceWidget item={item} value={value} onChange={onChange} disabled={disabled} />
        case 'spelling':
            return <SpellingInput item={item} value={value} onChange={onChange} disabled={disabled} />
        case 'anagram':
            return <AnagramInput item={item} value={value} onChange={onChange} disabled={disabled} />
        case 'word_formation':
            return <WordFormationInput item={item} value={value} onChange={onChange} disabled={disabled} />
        case 'error_correction':
            return <ErrorCorrectionInput item={item} value={value} onChange={onChange} disabled={disabled} />
        default:
            // sentence, constrained_sentence, paraphrase, prompt_response
            // match / cloze_bank are never routed here — they render as GroupCard in answer-phase
            return <SentenceInput item={item} value={value} onChange={onChange} disabled={disabled} />
    }
}
