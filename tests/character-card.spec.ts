import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHARACTER_EXTENSION,
  CharacterCardInvalidError,
  createCharacterCard,
  deleteCharacterCard,
  isCharacterId,
  listCharacterCards,
  readCharacterCard,
  saveCharacterCard,
} from '../src/character-card.ts'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-charc-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('character cards', () => {
  it('stores one .charc file per character and lists it back', async () => {
    const root = await workspace()
    const card = await createCharacterCard(root, {
      name: '林见夏',
      description: '夜班电车售票员',
      personality: '先听后说',
      tags: ['原创', '民国'],
      greetings: { first: '车厢里的灯灭了一盏。', alternates: ['第二天午后。'] },
    })
    expect(isCharacterId(card.id)).toBe(true)
    const files = await readdir(join(root, 'characters'))
    expect(files).toEqual([`${card.id}${CHARACTER_EXTENSION}`])

    const raw = JSON.parse(await readFile(join(root, 'characters', `${card.id}${CHARACTER_EXTENSION}`), 'utf8')) as {
      kind: string
      schema: number
      name: string
    }
    expect(raw).toMatchObject({ kind: 'dshtavern.character', schema: 1, name: '林见夏' })

    const listing = await listCharacterCards(root)
    expect(listing.problems).toEqual([])
    expect(listing.cards.map(entry => entry.id)).toEqual([card.id])
    expect(listing.cards[0]?.tags).toEqual(['原创', '民国'])
    expect(listing.cards[0]?.greetings.alternates).toEqual(['第二天午后。'])
  })

  it('saves changes while keeping identity and creation time', async () => {
    const root = await workspace()
    const created = await createCharacterCard(root, { name: '旧名字', description: '旧描述' })
    await new Promise(resolve => setTimeout(resolve, 5))
    const saved = await saveCharacterCard(root, created.id, { name: '新名字', description: '新描述' })
    expect(saved.id).toBe(created.id)
    expect(saved.name).toBe('新名字')
    expect(saved.createdAt).toBe(created.createdAt)
    expect(saved.updatedAt >= created.updatedAt).toBe(true)
    expect((await readCharacterCard(root, created.id))?.name).toBe('新名字')
  })

  it('deletes a card and reports missing files', async () => {
    const root = await workspace()
    const created = await createCharacterCard(root, { name: '删除我' })
    expect(await deleteCharacterCard(root, created.id)).toBe(true)
    expect(await deleteCharacterCard(root, created.id)).toBe(false)
    expect(await readCharacterCard(root, created.id)).toBeUndefined()
    expect((await listCharacterCards(root)).cards).toEqual([])
  })

  it('rejects invalid cards and unsafe ids', async () => {
    const root = await workspace()
    await expect(createCharacterCard(root, { name: '   ' })).rejects.toBeInstanceOf(CharacterCardInvalidError)
    await expect(readCharacterCard(root, '../escape')).rejects.toBeInstanceOf(CharacterCardInvalidError)
    await expect(deleteCharacterCard(root, '..\\escape')).rejects.toBeInstanceOf(CharacterCardInvalidError)
  })

  it('reports corrupt .charc files instead of hiding them', async () => {
    const root = await workspace()
    await createCharacterCard(root, { name: '正常卡' })
    await writeFile(join(root, 'characters', 'broken0000-0000-0000-0000-000000000000.charc'), '{ not json', 'utf8')
    const listing = await listCharacterCards(root)
    expect(listing.cards).toHaveLength(1)
    expect(listing.problems).toHaveLength(1)
    expect(listing.problems[0]?.error).toContain('JSON')
  })
})
