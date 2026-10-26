import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ImageStoreError,
  activePortrait,
  inspectImage,
  listSceneImages,
  readPortraitFile,
  readPortraitIndex,
  readSceneImageFile,
  setActivePortrait,
  writePortrait,
  writeSceneImage,
} from '../src/image/store.ts'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-image-store-'))
  roots.push(root)
  return root
}

function png(size = 2048): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return bytes
}

const approvedAt = '2026-10-26T00:00:00.000Z'

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('image store', () => {
  it('writes, lists and reads scene images by turn', async () => {
    const root = await workspace()
    const first = await writeSceneImage(root, 's1', {
      turn: 2,
      bytes: png(),
      mime: 'image/png',
      draftPrompt: '草稿',
      finalPrompt: '雨夜车厢',
      provider: 'openai-images',
      model: 'gpt-image-1',
      aspect: '3:2',
      style: 'anime',
      approvedAt,
    })
    const second = await writeSceneImage(root, 's1', {
      turn: 3,
      bytes: png(),
      mime: 'image/png',
      draftPrompt: '草稿',
      finalPrompt: '第二天',
      provider: 'jimeng',
      model: 'jimeng_t2i_v40',
      aspect: '2:3',
      style: 'cinematic',
      approvedAt,
    })
    expect(first.id).not.toBe(second.id)
    const all = await listSceneImages(root, 's1')
    expect(all.map(image => image.turn)).toEqual([3, 2])
    expect(await listSceneImages(root, 's1', 2)).toHaveLength(1)
    const file = await readSceneImageFile(root, 's1', first.id)
    expect((await readFile(file.path)).byteLength).toBe(2048)
    expect(file.record.finalPrompt).toBe('雨夜车厢')
  })

  it('skips a damaged index line instead of hiding the gallery', async () => {
    const root = await workspace()
    await writeSceneImage(root, 's1', {
      turn: 1,
      bytes: png(),
      mime: 'image/png',
      draftPrompt: 'd',
      finalPrompt: 'f',
      provider: 'openai-images',
      model: 'm',
      aspect: '1:1',
      style: 'anime',
      approvedAt,
    })
    await appendFile(join(root, '.dshtavern', 'stories', 's1', 'images', 'index.jsonl'), '{bad json}\n', 'utf8')
    expect(await listSceneImages(root, 's1')).toHaveLength(1)
  })

  it('rejects path traversal and non-image payloads', async () => {
    const root = await workspace()
    await expect(readSceneImageFile(root, 's1', '../escape')).rejects.toBeInstanceOf(ImageStoreError)
    expect(() => inspectImage(new Uint8Array([1, 2, 3]), 2048)).toThrow(ImageStoreError)
    expect(() => inspectImage(new TextEncoder().encode('<svg>'.repeat(400)), 4096)).toThrow(ImageStoreError)
  })

  it('writes portraits, switches active and keeps a history', async () => {
    const root = await workspace()
    const one = await writePortrait(root, {
      cardId: 'card-1',
      bytes: png(),
      mime: 'image/png',
      draftPrompt: 'd',
      finalPrompt: '第一张',
      provider: 'jimeng',
      model: 'jimeng_t2i_v40',
      aspect: '2:3',
      style: 'anime',
      approvedAt,
    })
    const two = await writePortrait(root, {
      cardId: 'card-1',
      bytes: png(),
      mime: 'image/png',
      draftPrompt: 'd',
      finalPrompt: '第二张',
      provider: 'jimeng',
      model: 'jimeng_t2i_v40',
      aspect: '2:3',
      style: 'anime',
      approvedAt,
    })
    expect((await readPortraitIndex(root, 'card-1')).items).toHaveLength(2)
    expect(await activePortrait(root, 'card-1')).toBeUndefined()
    await setActivePortrait(root, 'card-1', two.id)
    expect((await activePortrait(root, 'card-1'))?.id).toBe(two.id)
    const file = await readPortraitFile(root, 'card-1', one.id)
    expect((await readFile(file.path)).byteLength).toBe(2048)
    await expect(setActivePortrait(root, 'card-1', 'missing')).rejects.toBeInstanceOf(ImageStoreError)
  })
})
