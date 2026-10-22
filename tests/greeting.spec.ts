import { describe, expect, it } from 'vitest'
import {
  greetingStageLine,
  hasOpening,
  openingNarrationStageLine,
  selectGreeting,
  selectOpening,
} from '../src/greeting.ts'
import type { CharacterCard } from '../src/character-card.ts'

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  const now = '2026-10-22T00:00:00.000Z'
  return {
    schema: 1,
    kind: 'dshtavern.character',
    id: 'card-00000001',
    name: '林见夏',
    description: '',
    personality: '',
    scenario: '',
    systemPrompt: '',
    exampleDialogues: '',
    greetings: { first: '', alternates: [] },
    tags: [],
    entries: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('selectGreeting', () => {
  it('returns the first card that defines one', () => {
    const greeting = selectGreeting([
      card({ id: 'card-00000001', name: '甲', greetings: { first: '', alternates: [] } }),
      card({ id: 'card-00000002', name: '乙', greetings: { first: '雨下大了。', alternates: [] } }),
    ])
    expect(greeting).toEqual({ cardId: 'card-00000002', name: '乙', text: '雨下大了。' })
  })

  it('returns undefined when no card defines one', () => {
    expect(selectGreeting([card(), card({ id: 'card-00000002' })])).toBeUndefined()
  })

  it('returns undefined for an empty cast', () => {
    expect(selectGreeting([])).toBeUndefined()
  })

  it('treats a whitespace-only greeting as absent', () => {
    expect(selectGreeting([card({ greetings: { first: '   \n ', alternates: [] } })])).toBeUndefined()
  })

  it('trims stray indentation the card picked up elsewhere', () => {
    const greeting = selectGreeting([card({ greetings: { first: '  车厢的灯灭了一盏。\n\n她抬眼看你。  ', alternates: [] } })])
    expect(greeting?.text).toBe('车厢的灯灭了一盏。\n\n她抬眼看你。')
  })
})

describe('greetingStageLine', () => {
  it('stages the opening as observable speech by its card', () => {
    const line = greetingStageLine({ cardId: 'card-00000001', name: '林见夏', text: '上车吧。' })
    expect(line).toEqual({
      kind: 'speech',
      speaker: 'card-00000001',
      speakerName: '林见夏',
      text: '上车吧。',
      scope: 'observable',
    })
  })
})

describe('selectOpening', () => {
  const withScenario = (scenario: string, overrides: Partial<CharacterCard> = {}): CharacterCard =>
    card({ scenario, ...overrides })

  it('takes the scene from the first card that defines one', () => {
    const opening = selectOpening([
      withScenario('', { id: 'card-00000001' }),
      withScenario('连下七天雨，末班车只挂三节车厢。', { id: 'card-00000002' }),
      withScenario('另一个场景。', { id: 'card-00000003' }),
    ])
    expect(opening.narration).toEqual({ cardId: 'card-00000002', text: '连下七天雨，末班车只挂三节车厢。' })
  })

  it('resolves the scene and the first line independently', () => {
    // Card A has a scene but no greeting; card B has the greeting. Both show.
    const opening = selectOpening([
      withScenario('雨夜的电车。', { id: 'card-00000001', name: '甲' }),
      card({ id: 'card-00000002', name: '乙', greetings: { first: '上来吧。', alternates: [] } }),
    ])
    expect(opening.narration?.text).toBe('雨夜的电车。')
    expect(opening.greeting).toEqual({ cardId: 'card-00000002', name: '乙', text: '上来吧。' })
  })

  it('returns just the scene when no card has a greeting', () => {
    const opening = selectOpening([withScenario('雨夜的电车。')])
    expect(opening.narration?.text).toBe('雨夜的电车。')
    expect(opening.greeting).toBeUndefined()
    expect(hasOpening(opening)).toBe(true)
  })

  it('returns just the greeting when no card has a scene', () => {
    const opening = selectOpening([card({ greetings: { first: '上来吧。', alternates: [] } })])
    expect(opening.narration).toBeUndefined()
    expect(opening.greeting?.text).toBe('上来吧。')
    expect(hasOpening(opening)).toBe(true)
  })

  it('reports an empty opening when cards define neither', () => {
    expect(hasOpening(selectOpening([card()]))).toBe(false)
    expect(hasOpening(selectOpening([]))).toBe(false)
  })

  it('treats a whitespace-only scene as absent', () => {
    expect(selectOpening([withScenario('  \n ')]).narration).toBeUndefined()
  })
})

describe('openingNarrationStageLine', () => {
  it('stages the scene as observable narration', () => {
    expect(openingNarrationStageLine({ cardId: 'card-00000001', text: '雨夜的电车。' })).toEqual({
      kind: 'narration',
      text: '雨夜的电车。',
      scope: 'observable',
    })
  })
})
