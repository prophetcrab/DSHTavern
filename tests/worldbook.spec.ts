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
    position: 'before',
    order: 100,
    depth: 6,
    enabled: true,
    caseSensitive: false,
    wholeWords: false,
    audience: 'all',
    ...overrides,
  }
}

function activate(entries: readonly WorldbookEntry[], text: string, audience: 'character' | 'director' = 'character') {
  return activateEntries({ entries, scanText: text, recentLines: [text], audience })
}

describe('worldbook matching', () => {
  it('activates an entry whose primary key appears', () => {
    const lore = activate([entry()], '我推开回廊的门。')
    expect(lore.before).toHaveLength(1)
  })

  it('stays silent when no key appears', () => {
    expect(activate([entry()], '今天天气不错。').before).toHaveLength(0)
  })

  it('treats primary keys as OR', () => {
    const lore = activate([entry({ keys: ['回廊', '法阵'] })], '法阵在转。')
    expect(lore.before).toHaveLength(1)
  })

  it('ignores keys when the entry is constant', () => {
    expect(activate([entry({ constant: true })], '什么都无关。').before).toHaveLength(1)
  })

  it('never activates a keyless non-constant entry', () => {
    expect(activate([entry({ keys: [] })], '回廊').before).toHaveLength(0)
  })

  it('respects the disabled flag', () => {
    expect(activate([entry({ enabled: false })], '回廊').before).toHaveLength(0)
  })

  it('sends director-only entries to the director and never to a character', () => {
    const secret = entry({ id: 'e2', audience: 'director', keys: ['回廊'] })
    expect(activate([secret], '回廊', 'character').before).toHaveLength(0)
    expect(activate([secret], '回廊', 'director').before).toHaveLength(1)
  })

  it('lets a card entry reach its own character', () => {
    const cardLore = fromCardEntries([
      { id: 'c1', name: '缎带', content: '姐姐的遗物。', keys: ['缎带'], position: 'before', constant: false, enabled: true },
    ])
    expect(activate(cardLore, '那条缎带').before).toHaveLength(1)
  })
})

describe('secondary key logic', () => {
  const base = { keys: ['回廊'], secondaryKeys: ['结衣', '星奈'] }

  it('and_any needs one secondary hit', () => {
    expect(activate([entry({ ...base, logic: 'and_any' })], '回廊里结衣站着').before).toHaveLength(1)
    expect(activate([entry({ ...base, logic: 'and_any' })], '回廊空无一人').before).toHaveLength(0)
  })

  it('and_all needs every secondary hit', () => {
    const both = entry({ ...base, logic: 'and_all' })
    expect(activate([both], '回廊里结衣和星奈').before).toHaveLength(1)
    expect(activate([both], '回廊里只有结衣').before).toHaveLength(0)
  })

  it('not_any requires no secondary hit', () => {
    const none = entry({ ...base, logic: 'not_any' })
    expect(activate([none], '回廊空无一人').before).toHaveLength(1)
    expect(activate([none], '回廊里结衣').before).toHaveLength(0)
  })

  it('not_all requires a missing secondary hit', () => {
    const notAll = entry({ ...base, logic: 'not_all' })
    expect(activate([notAll], '回廊里只有结衣').before).toHaveLength(1)
    expect(activate([notAll], '回廊里结衣和星奈').before).toHaveLength(0)
  })
})

describe('matching options', () => {
  it('matches case-sensitively when asked', () => {
    const sensitive = entry({ keys: ['Moon'], caseSensitive: true })
    expect(activate([sensitive], 'moonlight').before).toHaveLength(0)
    expect(activate([sensitive], 'Moonlight').before).toHaveLength(1)
  })

  it('honours scan depth against the recent lines', () => {
    const shallow = entry({ keys: ['回廊'], depth: 1 })
    const lines = ['回廊', '甲', '乙']
    const hit = activateEntries({ entries: [shallow], scanText: '', recentLines: lines, audience: 'character' })
    // Depth 1 covers only the last line, which does not mention the key.
    expect(hit.before).toHaveLength(0)
  })

  it('caps how many entries one request carries', () => {
    const many = Array.from({ length: 20 }, (_unused, index) =>
      entry({ id: `e${index}`, name: `条目${index}`, keys: ['回廊'] }))
    const lore = activateEntries({ entries: many, scanText: '回廊', recentLines: ['回廊'], audience: 'character', maxEntries: 3 })
    expect(lore.before.length + lore.after.length + lore.tail.length).toBe(3)
  })

  it('drops entries that exceed the character budget', () => {
    const big = entry({ content: 'x'.repeat(100) })
    const lore = activateEntries({ entries: [big], scanText: '回廊', recentLines: ['回廊'], audience: 'character', maxChars: 50 })
    expect(lore.before).toHaveLength(0)
  })

  it('orders by order then name and groups by position', () => {
    const lore = activateEntries({
      entries: [
        entry({ id: 'b', name: 'B', order: 2, position: 'tail' }),
        entry({ id: 'a', name: 'A', order: 1, position: 'before' }),
        entry({ id: 'c', name: 'C', order: 3, position: 'after' }),
      ],
      scanText: '回廊',
      recentLines: ['回廊'],
      audience: 'character',
    })
    expect(lore.before.map(item => item.id)).toEqual(['a'])
    expect(lore.after.map(item => item.id)).toEqual(['c'])
    expect(lore.tail.map(item => item.id)).toEqual(['b'])
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
