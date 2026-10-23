import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildOpeningSystem,
  parseOpeningReply,
  readOpeningScript,
  writeOpeningScript,
} from '../src/opening.ts'
import type { CharacterCard } from '../src/character-card.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function storyDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-opening-'))
  roots.push(root)
  return root
}

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  const now = '2026-10-22T00:00:00.000Z'
  return {
    schema: 1,
    kind: 'dshtavern.character',
    id: 'card-00000001',
    name: '林见夏',
    description: '夜班售票员',
    personality: '',
    scenario: '末班车上',
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

describe('buildOpeningSystem', () => {
  it('names every card with its id so the reply can reference one', () => {
    const system = buildOpeningSystem({ cards: [card(), card({ id: 'card-00000002', name: '苏鹤' })] })
    expect(system).toContain('card-00000001')
    expect(system).toContain('林见夏')
    expect(system).toContain('card-00000002')
    expect(system).toContain('苏鹤')
  })

  it('states the JSON shape and that cardId must come from the roster', () => {
    const system = buildOpeningSystem({ cards: [card()] })
    expect(system).toContain('"segments"')
    expect(system).toContain('cardId 必须来自上面的名单')
  })

  it('forbids speaking for the player', () => {
    const system = buildOpeningSystem({ cards: [card()] })
    expect(system).toContain('绝不替玩家')
  })

  it('says so when there are no cards', () => {
    expect(buildOpeningSystem({ cards: [] })).toContain('（没有角色卡）')
  })
})

describe('parseOpeningReply', () => {
  const cards = [card(), card({ id: 'card-00000002', name: '苏鹤' })]

  it('reads narration and speech segments in order', () => {
    const script = parseOpeningReply(JSON.stringify({
      segments: [
        { kind: 'narration', text: '雨下大了。' },
        { kind: 'speech', cardId: 'card-00000002', text: '上车吧。' },
      ],
    }), cards)
    expect(script.segments).toEqual([
      { kind: 'narration', text: '雨下大了。' },
      { kind: 'speech', cardId: 'card-00000002', speakerName: '苏鹤', text: '上车吧。' },
    ])
    expect(script.focusCardId).toBe('card-00000002')
  })

  it('resolves a speaker given by name', () => {
    const script = parseOpeningReply(JSON.stringify({
      segments: [{ kind: 'speech', cardId: '林见夏', text: '嗯。' }],
    }), cards)
    expect(script.segments[0]?.cardId).toBe('card-00000001')
  })

  it('drops a speech segment naming someone outside the cast', () => {
    // An unknown speaker would stage a line with no voice behind it.
    const script = parseOpeningReply(JSON.stringify({
      segments: [
        { kind: 'narration', text: '雨下大了。' },
        { kind: 'speech', cardId: 'nobody', text: '我是谁？' },
      ],
    }), cards)
    expect(script.segments).toHaveLength(1)
    expect(script.focusCardId).toBeUndefined()
  })

  it('tolerates a fenced reply', () => {
    const script = parseOpeningReply('```json\n{"segments":[{"kind":"narration","text":"雨。"}]}\n```', cards)
    expect(script.segments).toHaveLength(1)
  })

  it('returns an empty script for prose with no JSON', () => {
    expect(parseOpeningReply('雨下大了，她抬眼看你。', cards).segments).toEqual([])
  })

  it('skips segments with an unknown kind or empty text', () => {
    const script = parseOpeningReply(JSON.stringify({
      segments: [
        { kind: 'aside', text: '忽略' },
        { kind: 'narration', text: '   ' },
        { kind: 'narration', text: '保留' },
      ],
    }), cards)
    expect(script.segments).toEqual([{ kind: 'narration', text: '保留' }])
  })

  it('caps the segment count', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ kind: 'narration', text: `第${index}段` }))
    expect(parseOpeningReply(JSON.stringify({ segments: many }), cards).segments.length).toBeLessThanOrEqual(8)
  })
})

describe('stored opening script', () => {
  it('reads back the provider/model that generated it', async () => {
    const directory = await storyDirectory()
    await writeOpeningScript(directory, {
      segments: [{ kind: 'narration', text: '雨停了。' }],
      generatedBy: { provider: 'deepseek-official', model: 'deepseek-flash' },
      system: 'SYSTEM',
      message: '写开场。',
    })
    const stored = await readOpeningScript(directory)
    // The transcript turn stamps this label; losing it makes the opening's
    // trajectory row claim an unknown model.
    expect(stored?.generatedBy).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash' })
    expect(stored?.system).toBe('SYSTEM')
    expect(stored?.message).toBe('写开场。')
  })

  it('drops a half-filled or malformed provider/model pair', async () => {
    const directory = await storyDirectory()
    await writeOpeningScript(directory, {
      segments: [{ kind: 'narration', text: '雨停了。' }],
      generatedBy: { provider: 'only-provider', model: '' },
    })
    expect((await readOpeningScript(directory))?.generatedBy).toBeUndefined()
  })
})
