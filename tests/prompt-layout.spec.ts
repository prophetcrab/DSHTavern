import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROMPT_BLOCK_IDS,
  PROMPT_LAYOUT_SCHEMA,
  PromptLayoutInvalidError,
  PromptLayoutVersionError,
  defaultPromptLayout,
  normalizePromptBlocks,
  promptBlockViews,
  promptLayoutPath,
  readPromptLayout,
  renderPromptText,
  writePromptLayout,
} from '../src/prompt-layout.ts'

const temporaryRoots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-prompt-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('prompt catalogue', () => {
  it('exposes every system-prompt block exactly once', () => {
    expect(PROMPT_BLOCK_IDS).toContain('main-template')
    expect(PROMPT_BLOCK_IDS).toContain('dsh-runtime')
    expect(new Set(PROMPT_BLOCK_IDS).size).toBe(PROMPT_BLOCK_IDS.length)
  })

  it('builds the default layout in catalogue order with every block enabled', () => {
    const layout = defaultPromptLayout()
    expect(layout.schema).toBe(PROMPT_LAYOUT_SCHEMA)
    expect(layout.blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS])
    expect(layout.blocks.every(block => block.enabled)).toBe(true)
  })

  it('applies persisted enabled flags and text overrides to catalogue views', () => {
    const views = promptBlockViews({
      schema: PROMPT_LAYOUT_SCHEMA,
      blocks: [
        { id: 'post-history', enabled: false },
        { id: 'main-template', enabled: true, content: '自定义主模板' },
      ],
    })
    expect(views.map(view => [view.id, view.enabled])).toEqual([
      ['post-history', false],
      ['main-template', true],
    ])
    expect(views[0]?.label).toBe('历史后指令')
    expect(views[0]?.content).toBe('保持 {{char}} 的角色设定与说话风格；不要跳出角色，不要总结或解释。')
    expect(views[1]?.content).toBe('自定义主模板')
    expect(views[1]?.overridden).toBe(true)
    expect(views[1]?.defaultContent.length).toBeGreaterThan(0)
  })
  it('renders enabled non-empty blocks in order for the system prompt', () => {
    const views = promptBlockViews({
      schema: PROMPT_LAYOUT_SCHEMA,
      blocks: [
        { id: 'main-template', enabled: true },
        { id: 'author-note', enabled: true },
        { id: 'user-persona', enabled: false },
        { id: 'post-history', enabled: true },
      ],
    })
    const text = renderPromptText(views)
    expect(text.startsWith('你正在进行一场角色扮演对话')).toBe(true)
    expect(text).toContain('不要跳出角色')
    expect(text).not.toContain('{{user}} 是一个普通旅人。')
    expect(text.split('\n\n')).toHaveLength(2)
  })

  it('substitutes char and user placeholders before the prompt reaches DSH', () => {
    const views = promptBlockViews({
      schema: PROMPT_LAYOUT_SCHEMA,
      blocks: [
        { id: 'main-template', enabled: true },
        { id: 'user-persona', enabled: true },
      ],
    })
    const text = renderPromptText(views, { char: '艾琳', user: '旅人' })
    expect(text).toContain('以 艾琳 的身份回应 旅人')
    expect(text).toContain('旅人 是一个普通旅人')
    expect(text).not.toContain('{{char}}')
    expect(text).not.toContain('{{user}}')
  })
})

describe('normalizePromptBlocks', () => {
  it('accepts a complete reordering', () => {
    const blocks = [...PROMPT_BLOCK_IDS].reverse().map(id => ({ id, enabled: id !== 'examples' }))
    expect(normalizePromptBlocks(blocks).map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS].reverse())
  })

  it.each([
    ['not an array', { id: 'main-template' }],
    ['a non-object entry', ['main-template']],
    ['a missing id', [{ enabled: true }]],
    ['an unknown id', [{ id: 'nope', enabled: true }]],
    ['a missing enabled flag', [{ id: 'main-template' }]],
    ['a non-boolean enabled flag', [{ id: 'main-template', enabled: 'yes' }]],
  ])('rejects %s', (_label, value) => {
    expect(() => normalizePromptBlocks(value)).toThrow(PromptLayoutInvalidError)
  })

  it('accepts per-block text overrides and rejects oversized ones', () => {
    const blocks = PROMPT_BLOCK_IDS.map(id => ({
      id,
      enabled: true,
      ...(id === 'main-template' ? { content: '自定义主模板' } : {}),
    }))
    expect(normalizePromptBlocks(blocks).find(item => item.id === 'main-template')?.content).toBe('自定义主模板')
    expect(() => normalizePromptBlocks(PROMPT_BLOCK_IDS.map(id => ({
      id,
      enabled: true,
      ...(id === 'main-template' ? { content: 'x'.repeat(70 * 1024) } : {}),
    })))).toThrow(/too large/)
  })

  it('rejects a layout that is missing blocks', () => {
    expect(() => normalizePromptBlocks([{ id: 'main-template', enabled: true }])).toThrow(/missing/)
  })

  it('collapses the legacy worldbook block ids onto one block', () => {
    const legacy = [
      { id: 'main-template', enabled: true },
      { id: 'worldbook-before', enabled: false },
      { id: 'worldbook-after', enabled: false },
      { id: 'lore-tail', enabled: true },
      ...PROMPT_BLOCK_IDS
        .filter(id => id !== 'main-template' && id !== 'worldbook')
        .map(id => ({ id, enabled: true })),
    ]
    const blocks = normalizePromptBlocks(legacy)
    expect(blocks.filter(block => block.id === 'worldbook')).toHaveLength(1)
    // One legacy block being enabled keeps the merged block enabled.
    expect(blocks.find(block => block.id === 'worldbook')?.enabled).toBe(true)
  })
})

describe('prompt layout files', () => {
  it('falls back to the default when no file exists', async () => {
    const workspace = await temporaryRoot()
    const layout = await readPromptLayout(workspace)
    expect(layout.blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS])
  })

  it('stores text overrides but strips content equal to the catalogue default', async () => {
    const workspace = await temporaryRoot()
    const defaultLayout = defaultPromptLayout()
    const blocks = defaultLayout.blocks.map(item => ({
      ...item,
      ...(item.id === 'main-template' ? { content: '自定义主模板' } : {}),
      ...(item.id === 'post-history' ? { content: '保持 {{char}} 的角色设定与说话风格；不要跳出角色，不要总结或解释。' } : {}),
    }))
    const written = await writePromptLayout(workspace, blocks)
    const stored = JSON.parse(await readFile(promptLayoutPath(workspace), 'utf8')) as {
      blocks: Array<{ id: string; content?: string }>
    }
    const byId = new Map(stored.blocks.map(item => [item.id, item]))
    expect(byId.get('main-template')?.content).toBe('自定义主模板')
    expect(byId.get('post-history')?.content).toBeUndefined()
    expect(written.blocks.find(item => item.id === 'main-template')?.content).toBe('自定义主模板')
    const reread = await readPromptLayout(workspace)
    expect(promptBlockViews(reread).find(view => view.id === 'main-template')?.content).toBe('自定义主模板')
  })

  it('writes and reads back a reordered, partially disabled layout', async () => {
    const workspace = await temporaryRoot()
    const blocks = [...PROMPT_BLOCK_IDS].reverse().map((id, index) => ({ id, enabled: index % 2 === 0 }))
    const written = await writePromptLayout(workspace, blocks)
    expect(written.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const stored = JSON.parse(await readFile(promptLayoutPath(workspace), 'utf8')) as {
      schema: number
      blocks: Array<{ id: string; enabled: boolean }>
    }
    expect(stored.schema).toBe(PROMPT_LAYOUT_SCHEMA)
    expect(stored.blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS].reverse())
    const read = await readPromptLayout(workspace)
    expect(read.blocks.map(block => [block.id, block.enabled])).toEqual(blocks.map(block => [block.id, block.enabled]))
  })

  it('rejects invalid input without writing a file', async () => {
    const workspace = await temporaryRoot()
    await expect(writePromptLayout(workspace, [{ id: 'nope', enabled: true }]))
      .rejects.toBeInstanceOf(PromptLayoutInvalidError)
    await expect(readPromptLayout(workspace)).resolves.toMatchObject({ schema: PROMPT_LAYOUT_SCHEMA })
  })

  it('rejects corrupt JSON and newer schemas', async () => {
    const workspace = await temporaryRoot()
    const path = promptLayoutPath(workspace)
    await mkdir(join(workspace, 'prompts'), { recursive: true })
    await writeFile(path, '{ not json', 'utf8')
    await expect(readPromptLayout(workspace)).rejects.toBeInstanceOf(PromptLayoutInvalidError)
    await writeFile(path, JSON.stringify({ schema: 99, blocks: [] }), 'utf8')
    await expect(readPromptLayout(workspace)).rejects.toBeInstanceOf(PromptLayoutVersionError)
  })

  it('fills blocks a version-1 layout predates without losing the stored order', async () => {
    const workspace = await temporaryRoot()
    const path = promptLayoutPath(workspace)
    await mkdir(join(workspace, 'prompts'), { recursive: true })
    // The version-1 catalogue had no lore-tail / character-stage / character-duty.
    const legacy = PROMPT_BLOCK_IDS
      .filter(id => id !== 'lore-tail' && id !== 'character-stage' && id !== 'character-duty')
      .reverse()
      .map((id, index) => ({ id, enabled: index !== 0 }))
    await writeFile(path, JSON.stringify({ schema: 1, blocks: legacy }), 'utf8')

    const layout = await readPromptLayout(workspace)
    expect(layout.schema).toBe(PROMPT_LAYOUT_SCHEMA)
    // Every current block is present exactly once.
    expect([...layout.blocks.map(block => block.id)].sort()).toEqual([...PROMPT_BLOCK_IDS].sort())
    // The stored relative order survives: the first stored block still comes
    // before the second one.
    const storedOrder = layout.blocks.map(block => block.id).filter(id => legacy.some(item => item.id === id))
    expect(storedOrder).toEqual(legacy.map(item => item.id))
    // A block the file predates takes the catalogue default: enabled.
    expect(layout.blocks.find(block => block.id === 'character-stage')?.enabled).toBe(true)
  })
})
