import { describe, expect, it } from 'vitest'
import { greetingStageLine, selectGreeting } from '../src/greeting.ts'
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
