import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  activateEntries,
  buildEntry,
  emptyWorldbook,
  fromCardEntries,
  parseWorldbook,
  readWorldbook,
  renderLore,
  stageScanLines,
  worldbookPath,
  writeWorldbook,
} from '../src/worldbook.ts'
import type { WorldbookEntry } from '../src/worldbook.ts'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-wb-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function entry(overrides: Partial<WorldbookEntry> = {}): WorldbookEntry {
  return {
    id: 'e1',
    name: '星屑回廊',
    content: '回廊的地砖下埋着星屑。',
    keys: ['回廊'],
    secondaryKeys: [],
    logic: 'and_any',
    constant: false,
    order: 100,
    depth: 6,
    enabled: true,
    caseSensitive: false,
    wholeWords: false,
    visibility: 'all',
    characterIds: [],
    ...overrides,
  }
}

/** Activate as a character with the given card id, or as the director. */
function activateAs(
  entries: readonly WorldbookEntry[],
  text: string,
  reader: { kind: 'director' } | { kind: 'character'; characterId: string } = { kind: 'character', characterId: 'card-00000001' },
) {
  return activateEntries({ entries, scanText: text, recentLines: [text], reader })
}

const activate = (
  entries: readonly WorldbookEntry[],
  text: string,
  reader?: { kind: 'director' } | { kind: 'character'; characterId: string },
) => reader === undefined ? activateAs(entries, text) : activateAs(entries, text, reader)

describe('worldbook matching', () => {
  it('activates an entry whose primary key appears', () => {
    const lore = activate([entry()], '我推开回廊的门。')
    expect(lore).toHaveLength(1)
  })

  it('stays silent when no key appears', () => {
    expect(activate([entry()], '今天天气不错。')).toHaveLength(0)
  })

  it('treats primary keys as OR', () => {
    const lore = activate([entry({ keys: ['回廊', '法阵'] })], '法阵在转。')
    expect(lore).toHaveLength(1)
  })

  it('ignores keys when the entry is constant', () => {
    expect(activate([entry({ constant: true })], '什么都无关。')).toHaveLength(1)
  })

  it('never activates a keyless non-constant entry', () => {
    expect(activate([entry({ keys: [] })], '回廊')).toHaveLength(0)
  })

  it('respects the disabled flag', () => {
    expect(activate([entry({ enabled: false })], '回廊')).toHaveLength(0)
  })

  it('keeps a director-only entry out of every character prompt', () => {
    const secret = entry({ id: 'e2', visibility: 'director', keys: ['回廊'] })
    expect(activate([secret], '回廊')).toHaveLength(0)
    expect(activate([secret], '回廊', { kind: 'director' })).toHaveLength(1)
  })

  it('reaches only the characters an entry names', () => {
    const scoped = entry({ id: 'e3', visibility: 'characters', characterIds: ['yue'], keys: ['回廊'] })
    expect(activate([scoped], '回廊', { kind: 'character', characterId: 'yue' })).toHaveLength(1)
    expect(activate([scoped], '回廊', { kind: 'character', characterId: 'xing' })).toHaveLength(0)
    // The director still knows what a single character knows.
    expect(activate([scoped], '回廊', { kind: 'director' })).toHaveLength(1)
  })

  it('reaches everyone when visibility is all', () => {
    const shared = entry({ id: 'e4', visibility: 'all', keys: ['回廊'] })
    expect(activate([shared], '回廊', { kind: 'character', characterId: 'yue' })).toHaveLength(1)
    expect(activate([shared], '回廊', { kind: 'character', characterId: 'xing' })).toHaveLength(1)
    expect(activate([shared], '回廊', { kind: 'director' })).toHaveLength(1)
  })

  it('lets a card entry reach its own character', () => {
    const cardLore = fromCardEntries([
      { id: 'c1', name: '缎带', content: '姐姐的遗物。', keys: ['缎带'], position: 'before', constant: false, enabled: true },
    ])
    expect(activate(cardLore, '那条缎带')).toHaveLength(1)
  })
})

describe('secondary key logic', () => {
  const base = { keys: ['回廊'], secondaryKeys: ['结衣', '星奈'] }

  it('and_any needs one secondary hit', () => {
    expect(activate([entry({ ...base, logic: 'and_any' })], '回廊里结衣站着')).toHaveLength(1)
    expect(activate([entry({ ...base, logic: 'and_any' })], '回廊空无一人')).toHaveLength(0)
  })

  it('and_all needs every secondary hit', () => {
    const both = entry({ ...base, logic: 'and_all' })
    expect(activate([both], '回廊里结衣和星奈')).toHaveLength(1)
    expect(activate([both], '回廊里只有结衣')).toHaveLength(0)
  })

  it('not_any requires no secondary hit', () => {
    const none = entry({ ...base, logic: 'not_any' })
    expect(activate([none], '回廊空无一人')).toHaveLength(1)
    expect(activate([none], '回廊里结衣')).toHaveLength(0)
  })

  it('not_all requires a missing secondary hit', () => {
    const notAll = entry({ ...base, logic: 'not_all' })
    expect(activate([notAll], '回廊里只有结衣')).toHaveLength(1)
    expect(activate([notAll], '回廊里结衣和星奈')).toHaveLength(0)
  })
})

describe('matching options', () => {
  it('matches case-sensitively when asked', () => {
    const sensitive = entry({ keys: ['Moon'], caseSensitive: true })
    expect(activate([sensitive], 'moonlight')).toHaveLength(0)
    expect(activate([sensitive], 'Moonlight')).toHaveLength(1)
  })

  it('honours scan depth against the recent lines', () => {
    const shallow = entry({ keys: ['回廊'], depth: 1 })
    const lines = ['回廊', '甲', '乙']
    const hit = activateEntries({ entries: [shallow], scanText: '', recentLines: lines, reader: { kind: 'character', characterId: 'card-00000001' } })
    // Depth 1 covers only the last line, which does not mention the key.
    expect(hit).toHaveLength(0)
  })

  it('caps how many entries one request carries', () => {
    const many = Array.from({ length: 20 }, (_unused, index) =>
      entry({ id: `e${index}`, name: `条目${index}`, keys: ['回廊'] }))
    const lore = activateEntries({ entries: many, scanText: '回廊', recentLines: ['回廊'], reader: { kind: 'character', characterId: 'card-00000001' }, maxEntries: 3 })
    expect(lore).toHaveLength(3)
  })

  it('drops entries that exceed the character budget', () => {
    const big = entry({ content: 'x'.repeat(100) })
    const lore = activateEntries({ entries: [big], scanText: '回廊', recentLines: ['回廊'], reader: { kind: 'character', characterId: 'card-00000001' }, maxChars: 50 })
    expect(lore).toHaveLength(0)
  })

  it('orders one flat list by order then name', () => {
    const lore = activateEntries({
      entries: [
        entry({ id: 'b', name: 'B', order: 2 }),
        entry({ id: 'a', name: 'A', order: 1 }),
        entry({ id: 'c', name: 'C', order: 3 }),
      ],
      scanText: '回廊',
      recentLines: ['回廊'],
      reader: { kind: 'character', characterId: 'card-00000001' },
    })
    expect(lore.map(item => item.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('worldbook storage', () => {
  it('round-trips entries through the workspace file', async () => {
    const directory = await workspace()
    expect(await readWorldbook(directory)).toEqual(emptyWorldbook())
    await writeWorldbook(directory, [{ name: '星屑回廊', content: '设定', keys: ['回廊'] }])
    const stored = await readWorldbook(directory)
    expect(stored.entries).toHaveLength(1)
    expect(stored.entries[0]?.name).toBe('星屑回廊')
    expect(stored.updatedAt).toBeDefined()
    expect(worldbookPath(directory).endsWith('worldbook.json')).toBe(true)
  })

  it('rejects an entry without a name', () => {
    expect(() => buildEntry({ content: '没有名字' })).toThrow()
  })

  it('rejects a newer schema', () => {
    expect(() => parseWorldbook(JSON.stringify({ schema: 99, entries: [] }), 'x')).toThrow()
  })

  it('renders only non-empty contents, joined in order', () => {
    const text = renderLore([entry({ content: '第一段' }), entry({ id: 'e2', content: '  ' }), entry({ id: 'e3', content: '第二段' })])
    expect(text).toBe('第一段\n\n第二段')
  })

  it('builds scan lines that attribute speech to its speaker', () => {
    const lines = stageScanLines([
      { seq: 1, at: '', kind: 'narration', text: '风停了。', scope: 'observable' },
      { seq: 2, at: '', kind: 'speech', speaker: 'a', speakerName: '结衣', text: '出去。', scope: 'observable' },
    ])
    expect(lines[0]).toBe('风停了。')
    expect(lines[1]).toBe('结衣：出去。')
  })
})

describe('editor preview matches the host engine', () => {
  it('agrees on whole-word keys, which the old preview ignored', async () => {
    const { previewActivation } = await import('../src/client/worldbook.ts')
    const strict = {
      ...entry({ id: 'w1', name: '伞', content: '整词条目。', keys: ['伞'], wholeWords: true }),
    }
    // "雨伞架" contains 伞 but not on a word boundary.
    const inside = previewActivation([strict as never], '我看向雨伞架。')
    expect(inside).toHaveLength(0)
    // A key on a real boundary (start of text, then punctuation) does fire.
    const bounded = previewActivation([strict as never], '伞，雨伞架')
    expect(bounded).toHaveLength(1)
    // The host engine must agree in both directions.
    expect(activateEntries({ entries: [strict], scanText: '我看向雨伞架。', recentLines: [], reader: { kind: 'character', characterId: 'card-00000001' } })).toHaveLength(0)
    expect(activateEntries({ entries: [strict], scanText: '伞，雨伞架', recentLines: [], reader: { kind: 'character', characterId: 'card-00000001' } })).toHaveLength(1)
  })

  it('agrees on case sensitivity', async () => {
    const { previewActivation } = await import('../src/client/worldbook.ts')
    const sensitive = entry({ id: 'c1', name: 'Moon', content: '大写。', keys: ['Moon'], caseSensitive: true })
    expect(previewActivation([sensitive as never], 'moonlight')).toHaveLength(0)
    expect(previewActivation([sensitive as never], 'Moonlight')).toHaveLength(1)
    expect(activateEntries({ entries: [sensitive], scanText: 'moonlight', recentLines: [], reader: { kind: 'character', characterId: 'card-00000001' } })).toHaveLength(0)
  })
})

describe('worldbook visibility in the character prompt', () => {
  const character = {
    schema: 1, kind: 'dshtavern.character' as const, id: 'yue', name: '月见',
    description: '【角色描述】', personality: '', scenario: '', systemPrompt: '',
    exampleDialogues: '', greetings: { first: '', alternates: [] },
    tags: [], entries: [], createdAt: '', updatedAt: '',
  }

  it('injects a single worldbook block and keeps invisible entries out', async () => {
    const { buildCharacterSystem } = await import('../src/orchestrator.ts')
    const { defaultPromptLayout } = await import('../src/prompt-layout.ts')
    const system = buildCharacterSystem({
      layout: defaultPromptLayout(),
      card: character,
      stage: [],
      worldbook: [
        entry({ id: 'pub', name: '公开', content: '【公开】', constant: true, visibility: 'all' }),
        entry({ id: 'mine', name: '私有', content: '【私有】', constant: true, visibility: 'characters', characterIds: ['yue'] }),
        entry({ id: 'other', name: '他人', content: '【他人】', constant: true, visibility: 'characters', characterIds: ['xing'] }),
        entry({ id: 'dm', name: '秘辛', content: '【秘辛】', constant: true, visibility: 'director' }),
      ],
    })
    expect(system).toContain('【公开】')
    expect(system).toContain('【私有】')
    expect(system).not.toContain('【他人】')
    expect(system).not.toContain('【秘辛】')
  })

  it('drops the whole section when the worldbook block is disabled', async () => {
    const { buildCharacterSystem } = await import('../src/orchestrator.ts')
    const { defaultPromptLayout } = await import('../src/prompt-layout.ts')
    const layout = defaultPromptLayout()
    const off = {
      ...layout,
      blocks: layout.blocks.map(block => block.id === 'worldbook' ? { ...block, enabled: false } : block),
    }
    const system = buildCharacterSystem({
      layout: off,
      card: character,
      stage: [],
      worldbook: [entry({ id: 'pub', name: '公开', content: '【公开】', constant: true })],
    })
    expect(system).not.toContain('【公开】')
  })
})
