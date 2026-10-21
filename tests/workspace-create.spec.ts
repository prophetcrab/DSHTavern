import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MARKER_SCHEMA,
  TavernInputError,
  createTavernWorkspace,
  defaultTavernRoot,
  markerPath,
  overviewTaverns,
  parseMarker,
  tavernSlug,
} from '../src/index.ts'
import type { TavernWorkspaceRecord, TavernWorkspaceRegistrar } from '../src/index.ts'

const temporaryRoots: string[] = []
const originalDshHome = process.env.DSH_HOME

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-create-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

class FakeRegistrar implements TavernWorkspaceRegistrar {
  readonly calls: Array<{ directory: string; title: string | undefined }> = []
  private readonly byDirectory = new Map<string, TavernWorkspaceRecord>()

  async create(directory: string, title?: string): Promise<TavernWorkspaceRecord> {
    this.calls.push({ directory, title })
    const existing = this.byDirectory.get(directory)
    if (existing !== undefined) return existing
    const record: TavernWorkspaceRecord = {
      id: `workspace-${String(this.byDirectory.size + 1)}`,
      path: directory,
      title: title ?? directory,
    }
    this.byDirectory.set(directory, record)
    return record
  }

  records(): TavernWorkspaceRecord[] {
    return [...this.byDirectory.values()]
  }
}

describe('tavern slug', () => {
  it('keeps readable text and strips path separators', () => {
    expect(tavernSlug('雾都夜话')).toBe('雾都夜话')
    expect(tavernSlug('雾都/夜话: 上')).toBe('雾都-夜话-上')
    expect(tavernSlug('  ~~ ')).toBe('~~')
    expect(tavernSlug('   ')).toBe('tavern')
  })
})

describe('default tavern root', () => {
  it('uses DSH_HOME when set', async () => {
    const home = await temporaryRoot()
    process.env.DSH_HOME = home
    expect(defaultTavernRoot()).toBe(join(home, 'taverns'))
  })
})

describe('createTavernWorkspace', () => {
  it('creates the directory, writes the marker, then registers the workspace', async () => {
    const root = await temporaryRoot()
    const registrar = new FakeRegistrar()
    const view = await createTavernWorkspace(registrar, { title: '雾都夜话' }, root)

    const directory = join(root, '雾都夜话')
    expect(view.path).toBe(directory)
    expect(view.title).toBe('雾都夜话')
    expect(view.marker.schema).toBe(MARKER_SCHEMA)
    expect(view.marker.title).toBe('雾都夜话')

    const stored = parseMarker(await readFile(markerPath(directory), 'utf8'))
    expect(stored?.tavernId).toBe(view.marker.tavernId)
    expect(registrar.calls).toEqual([{ directory, title: '雾都夜话' }])
  })

  it('accepts an explicit absolute directory and titles it from the final segment', async () => {
    const root = await temporaryRoot()
    const directory = join(root, 'custom', 'tavern-a')
    const view = await createTavernWorkspace(new FakeRegistrar(), { path: directory }, root)
    expect(view.path).toBe(directory)
    expect(view.title).toBe('tavern-a')
    expect((await readFile(markerPath(directory), 'utf8')).length).toBeGreaterThan(0)
  })

  it('reuses the registered workspace and its marker on a repeated request', async () => {
    const root = await temporaryRoot()
    const registrar = new FakeRegistrar()
    const first = await createTavernWorkspace(registrar, { title: 'same' }, root)
    const second = await createTavernWorkspace(registrar, { title: 'same' }, root)
    expect(second.workspaceId).toBe(first.workspaceId)
    expect(second.marker.tavernId).toBe(first.marker.tavernId)
  })

  it('rejects a relative directory', async () => {
    const root = await temporaryRoot()
    await expect(createTavernWorkspace(new FakeRegistrar(), { path: 'relative/dir' }, root))
      .rejects.toBeInstanceOf(TavernInputError)
  })

  it('rejects a filesystem root directory', async () => {
    const root = await temporaryRoot()
    await expect(createTavernWorkspace(new FakeRegistrar(), { path: 'D:\\' }, root))
      .rejects.toBeInstanceOf(TavernInputError)
  })

  it('requires a title when no directory is given', async () => {
    const root = await temporaryRoot()
    await expect(createTavernWorkspace(new FakeRegistrar(), {}, root))
      .rejects.toBeInstanceOf(TavernInputError)
  })
})

describe('overviewTaverns', () => {
  it('reports taverns and every workspace tavern flag in source order', async () => {
    const root = await temporaryRoot()
    const registrar = new FakeRegistrar()
    const tavern = await createTavernWorkspace(registrar, { title: 'marked' }, root)
    const plain = join(root, 'plain')
    await mkdir(plain, { recursive: true })

    const records = [...registrar.records(), { id: 'workspace-plain', path: plain, title: 'plain' }]
    const overview = await overviewTaverns({
      list: () => records,
      get: id => records.find(record => record.id === id),
    })

    expect(overview.taverns.map(view => view.workspaceId)).toEqual([tavern.workspaceId])
    expect(overview.workspaces.map(workspace => [workspace.id, workspace.tavern])).toEqual([
      [tavern.workspaceId, true],
      ['workspace-plain', false],
    ])
  })

  it('treats an unreadable workspace directory as unmarked', async () => {
    const missing = join(await temporaryRoot(), 'missing')
    const overview = await overviewTaverns({
      list: () => [{ id: 'gone', path: missing, title: 'gone' }],
      get: () => undefined,
    })
    expect(overview.taverns).toEqual([])
    expect(overview.workspaces[0]?.tavern).toBe(false)
  })
})
