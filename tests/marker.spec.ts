import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MARKER_SCHEMA,
  TavernMarkerInvalidError,
  TavernMarkerRegistry,
  TavernMarkerVersionError,
  TavernWorkspaceNotFoundError,
  createMarker,
  ensureMarker,
  markerPath,
  parseMarker,
  readMarker,
  removeMarker,
  tavernDirectory,
} from '../src/index.ts'
import type { TavernWorkspaceRecord, TavernWorkspaceSource } from '../src/index.ts'

const temporaryRoots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

class FakeWorkspaces implements TavernWorkspaceSource {
  constructor(private readonly records: readonly TavernWorkspaceRecord[]) {}

  list(): readonly TavernWorkspaceRecord[] {
    return this.records
  }

  get(id: string): TavernWorkspaceRecord | undefined {
    return this.records.find(record => record.id === id)
  }
}

describe('marker value', () => {
  it('creates and parses a marker', () => {
    const marker = createMarker('雾都夜话')
    expect(marker.schema).toBe(MARKER_SCHEMA)
    expect(marker.kind).toBe('dshtavern')
    expect(marker.tavernId).toMatch(/^[0-9a-f-]{36}$/)
    expect(marker.title).toBe('雾都夜话')
    expect(parseMarker(JSON.stringify(marker))).toEqual(marker)
  })

  it('omits an absent title', () => {
    const marker = createMarker()
    expect('title' in marker).toBe(false)
  })

  it.each([
    ['not json', 'nope'],
    ['an array', '[]'],
    ['a wrong kind', '{"schema":1,"kind":"other","tavernId":"x","createdAt":"t"}'],
    ['a missing tavern id', '{"schema":1,"kind":"dshtavern","createdAt":"t"}'],
    ['a non-string title', '{"schema":1,"kind":"dshtavern","tavernId":"x","createdAt":"t","title":1}'],
    ['a non-integer schema', '{"schema":1.5,"kind":"dshtavern","tavernId":"x","createdAt":"t"}'],
  ])('rejects %s', (_label, text) => {
    expect(parseMarker(text)).toBeUndefined()
  })
})

describe('marker file', () => {
  it('writes, reads, and removes a marker', async () => {
    const root = await temporaryRoot()
    await ensureMarker(root, '雾都夜话')
    expect(await readMarker(root)).toMatchObject({ kind: 'dshtavern', title: '雾都夜话' })
    expect(markerPath(root)).toBe(join(root, '.dshtavern', 'tavern.json'))
    expect(tavernDirectory(root)).toBe(join(root, '.dshtavern'))
    expect(await removeMarker(root)).toBe(true)
    expect(await removeMarker(root)).toBe(false)
    expect(await readMarker(root)).toBeUndefined()
  })

  it('is idempotent when a marker already exists', async () => {
    const root = await temporaryRoot()
    const first = await ensureMarker(root, 'one')
    const second = await ensureMarker(root, 'two')
    expect(second.tavernId).toBe(first.tavernId)
    expect(second.title).toBe('one')
  })

  it('keeps the marker JSON readable', async () => {
    const root = await temporaryRoot()
    await ensureMarker(root, '雾都夜话')
    const text = await readFile(markerPath(root), 'utf8')
    expect(text).toMatch(/\n$/)
    expect(parseMarker(text)).toMatchObject({ kind: 'dshtavern', title: '雾都夜话' })
  })

  it('refuses to overwrite an invalid marker without force', async () => {
    const root = await temporaryRoot()
    await mkdir(tavernDirectory(root), { recursive: true })
    await writeFile(markerPath(root), '{ broken', 'utf8')
    expect(await readMarker(root)).toBeUndefined()
    await expect(ensureMarker(root)).rejects.toBeInstanceOf(TavernMarkerInvalidError)
    const repaired = await ensureMarker(root, undefined, { force: true })
    expect(repaired.kind).toBe('dshtavern')
    expect(await readMarker(root)).toEqual(repaired)
  })

  it('refuses a newer marker schema', async () => {
    const root = await temporaryRoot()
    await mkdir(tavernDirectory(root), { recursive: true })
    await writeFile(markerPath(root), JSON.stringify({
      schema: MARKER_SCHEMA + 1,
      kind: 'dshtavern',
      tavernId: 'future',
      createdAt: '2026-10-21T00:00:00.000Z',
    }), 'utf8')
    expect(await readMarker(root)).toMatchObject({ schema: MARKER_SCHEMA + 1 })
    await expect(ensureMarker(root)).rejects.toBeInstanceOf(TavernMarkerVersionError)
    expect((await readMarker(root))?.tavernId).toBe('future')
  })
})

describe('marker registry', () => {
  it('lists only marked workspaces', async () => {
    const tavernRoot = await temporaryRoot()
    const plainRoot = await temporaryRoot()
    await ensureMarker(tavernRoot)
    const registry = new TavernMarkerRegistry(new FakeWorkspaces([
      { id: 'tavern', path: tavernRoot, title: 'Tavern' },
      { id: 'plain', path: plainRoot, title: 'Plain' },
    ]))
    const listed = await registry.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ workspaceId: 'tavern', path: tavernRoot, title: 'Tavern' })
  })

  it('adopts and untags a registered workspace', async () => {
    const root = await temporaryRoot()
    const registry = new TavernMarkerRegistry(new FakeWorkspaces([
      { id: 'target', path: root, title: 'Target' },
    ]))
    expect(await registry.isTavernDirectory(root)).toBe(false)
    const view = await registry.adopt('target')
    expect(view.marker.kind).toBe('dshtavern')
    expect(await registry.isTavernDirectory(root)).toBe(true)
    expect(await registry.untag('target')).toBe(true)
    expect(await registry.isTavernDirectory(root)).toBe(false)
  })

  it('rejects unknown workspaces', async () => {
    const registry = new TavernMarkerRegistry(new FakeWorkspaces([]))
    await expect(registry.adopt('missing')).rejects.toBeInstanceOf(TavernWorkspaceNotFoundError)
    await expect(registry.untag('missing')).rejects.toBeInstanceOf(TavernWorkspaceNotFoundError)
  })

  it('detects tavern session working directories', async () => {
    const root = await temporaryRoot()
    const plain = await temporaryRoot()
    await ensureMarker(root)
    const registry = new TavernMarkerRegistry(new FakeWorkspaces([]))
    expect(await registry.isTavernSessionCwd(root)).toBe(true)
    expect(await registry.isTavernSessionCwd(plain)).toBe(false)
    expect(await registry.isTavernSessionCwd(undefined)).toBe(false)
    expect(await registry.isTavernSessionCwd('.')).toBe(false)
  })

  it('skips a workspace whose marker is invalid', async () => {
    const root = await temporaryRoot()
    await mkdir(tavernDirectory(root), { recursive: true })
    await writeFile(markerPath(root), '{}', 'utf8')
    const registry = new TavernMarkerRegistry(new FakeWorkspaces([
      { id: 'broken', path: root, title: 'Broken' },
    ]))
    expect(await registry.list()).toEqual([])
  })
})
