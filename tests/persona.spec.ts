import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildPersona,
  emptyPersonaFile,
  parsePersonaFile,
  personaPath,
  readActivePersona,
  readPersonaFile,
  renderPersona,
  writePersonaFile,
} from '../src/persona.ts'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-persona-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const stamps = { createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z' }

describe('persona records', () => {
  it('builds a persona from caller fields', () => {
    const persona = buildPersona({
      name: ' 林澈 ',
      description: '二十出头，深灰风衣',
      personality: '谨慎',
      background: '从北方来',
      speakingStyle: '说话简短',
      tags: ['旅人', ' ', '剑士'],
    }, stamps)
    expect(persona.name).toBe('林澈')
    expect(persona.tags).toEqual(['旅人', '剑士'])
    expect(persona.id.length).toBeGreaterThan(0)
  })

  it('requires a name', () => {
    expect(() => buildPersona({ name: '   ' }, stamps)).toThrow()
  })

  it('rejects a non-string field', () => {
    expect(() => buildPersona({ name: '甲', description: 42 as never }, stamps)).toThrow()
  })
})

describe('persona rendering', () => {
  it('renders the name and only the fields that carry text', () => {
    const persona = buildPersona({ name: '林澈', description: '深灰风衣', background: '' }, stamps)
    const text = renderPersona(persona)
    expect(text).toContain('玩家扮演「林澈」')
    expect(text).toContain('外观：深灰风衣')
    expect(text).not.toContain('背景：')
  })

  it('renders a name-only persona as a single line', () => {
    const persona = buildPersona({ name: '林澈' }, stamps)
    expect(renderPersona(persona)).toBe('玩家扮演「林澈」。')
  })
})

describe('persona storage', () => {
  it('reads an empty library before the first write', async () => {
    const directory = await workspace()
    expect(await readPersonaFile(directory)).toEqual(emptyPersonaFile())
    expect(await readActivePersona(directory)).toBeUndefined()
    expect(personaPath(directory).endsWith('persona.json')).toBe(true)
  })

  it('round-trips personas and the active pointer', async () => {
    const directory = await workspace()
    const first = buildPersona({ name: '林澈' }, stamps)
    const second = buildPersona({ name: '白鹭' }, stamps)
    await writePersonaFile(directory, { personas: [first, second], activeId: second.id })
    const stored = await readPersonaFile(directory)
    expect(stored.personas.map(persona => persona.name)).toEqual(['林澈', '白鹭'])
    expect(stored.activeId).toBe(second.id)
    expect((await readActivePersona(directory))?.name).toBe('白鹭')
  })

  it('falls back to the first persona when the active id is unknown', () => {
    const file = parsePersonaFile(JSON.stringify({
      schema: 1,
      activeId: 'missing',
      personas: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }],
    }), 'x')
    expect(file.activeId).toBe('a')
  })

  it('rejects a newer schema', () => {
    expect(() => parsePersonaFile(JSON.stringify({ schema: 99, personas: [] }), 'x')).toThrow()
  })

  it('rejects a non-JSON document', () => {
    expect(() => parsePersonaFile('not json', 'x')).toThrow()
  })
})

describe('persona character sheet', () => {
  it('stores the character sheet separately from the background', () => {
    const persona = buildPersona({
      name: '林澈',
      background: '从北边的矿镇来。',
      characterSheet: '持有：旧短剑。能力：夜视。',
    }, stamps)
    expect(persona.background).toBe('从北边的矿镇来。')
    expect(persona.characterSheet).toBe('持有：旧短剑。能力：夜视。')
  })

  it('renders the character sheet as its own labelled line', () => {
    const persona = buildPersona({ name: '林澈', characterSheet: '持有：旧短剑。' }, stamps)
    const text = renderPersona(persona)
    expect(text).toContain('角色设定：持有：旧短剑。')
  })

  it('omits the line when the sheet is empty', () => {
    const persona = buildPersona({ name: '林澈' }, stamps)
    expect(renderPersona(persona)).not.toContain('角色设定')
  })
})
