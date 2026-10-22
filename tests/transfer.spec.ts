import { describe, expect, it } from 'vitest'
import {
  CHARACTER_KIND,
  exportCharacterCardText,
  parseCharacterCardImport,
  parseCharacterCard,
} from '../src/character-card.ts'
import {
  WORLDBOOK_EXPORT_KIND,
  exportWorldbookText,
  parseWorldbookImport,
} from '../src/worldbook.ts'

const CARD_TEXT = JSON.stringify({
  schema: 1,
  kind: CHARACTER_KIND,
  id: 'a4f6540e-e289-4fd9-89e3-1653408cc286',
  name: '林见夏',
  description: '夜班售票员',
  personality: '说话慢',
  scenario: '末班车',
  systemPrompt: '',
  exampleDialogues: '',
  greetings: { first: '上车吧。', alternates: [] },
  tags: ['原创'],
  entries: [],
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
})

describe('character card export/import', () => {
  it('exports the stored card verbatim', () => {
    const card = parseCharacterCard(CARD_TEXT, 'x.charc')
    const text = exportCharacterCardText(card)
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual(JSON.parse(CARD_TEXT))
  })

  it('imports an exported card with a fresh id and timestamps', () => {
    const card = parseCharacterCard(CARD_TEXT, 'x.charc')
    const imported = parseCharacterCardImport(exportCharacterCardText(card), 'import.charc')
    expect(imported.name).toBe('林见夏')
    expect(imported.description).toBe('夜班售票员')
    expect(imported.tags).toEqual(['原创'])
    expect(imported.greetings.first).toBe('上车吧。')
    // A fresh identity keeps an import from overwriting the source card.
    expect(imported.id).not.toBe(card.id)
    expect(imported.createdAt).not.toBe(card.createdAt)
  })

  it('accepts a hand-written card without kind or schema', () => {
    const imported = parseCharacterCardImport(JSON.stringify({ name: '无名', description: '测试' }), 'x.charc')
    expect(imported.name).toBe('无名')
  })

  it('rejects a document from another tool', () => {
    expect(() => parseCharacterCardImport(JSON.stringify({ kind: 'other', name: 'x' }), 'x.charc'))
      .toThrow('不是酒馆角色卡')
  })

  it('rejects a document with no name', () => {
    expect(() => parseCharacterCardImport(JSON.stringify({ description: 'x' }), 'x.charc'))
      .toThrow('角色卡需要名称')
  })

  it('rejects malformed JSON', () => {
    expect(() => parseCharacterCardImport('{ not json', 'x.charc')).toThrow('不是合法 JSON')
  })
})

describe('worldbook export/import', () => {
  const ENTRY = {
    id: 'e1',
    name: '归雾桥',
    content: '封站三年的老站',
    keys: ['归雾桥'],
    secondaryKeys: [],
    logic: 'and_any' as const,
    constant: false,
    position: 'before' as const,
    order: 10,
    depth: 8,
    enabled: true,
    caseSensitive: false,
    wholeWords: false,
    audience: 'all' as const,
  }

  it('wraps entries in a tagged envelope', () => {
    const text = exportWorldbookText({ schema: 1, entries: [ENTRY] }, '长夜环线')
    const parsed = JSON.parse(text)
    expect(parsed.kind).toBe(WORLDBOOK_EXPORT_KIND)
    expect(parsed.source).toBe('长夜环线')
    expect(parsed.entries).toHaveLength(1)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('round-trips an exported book', () => {
    const text = exportWorldbookText({ schema: 1, entries: [ENTRY] }, '长夜环线')
    const entries = parseWorldbookImport(text, 'x.world')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe('归雾桥')
    expect(entries[0]?.keys).toEqual(['归雾桥'])
    expect(entries[0]?.depth).toBe(8)
  })

  it('accepts a bare entry array', () => {
    const entries = parseWorldbookImport(JSON.stringify([ENTRY]), 'x.world')
    expect(entries).toHaveLength(1)
  })

  it('rejects a document tagged as another kind', () => {
    expect(() => parseWorldbookImport(JSON.stringify({ kind: 'other', entries: [] }), 'x.world'))
      .toThrow('不是酒馆世界书文件')
  })

  it('rejects a document without an entries array', () => {
    expect(() => parseWorldbookImport(JSON.stringify({ kind: WORLDBOOK_EXPORT_KIND }), 'x.world'))
      .toThrow('缺少 entries 数组')
  })

  it('rejects an entry missing its name', () => {
    expect(() => parseWorldbookImport(JSON.stringify([{ content: 'x' }]), 'x.world'))
      .toThrow('世界书条目需要名称')
  })

  it('rejects malformed JSON', () => {
    expect(() => parseWorldbookImport('nope', 'x.world')).toThrow('不是合法 JSON')
  })
})
