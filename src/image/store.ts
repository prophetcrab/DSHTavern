/**
 * Image files and their sidecar metadata.
 *
 * Scene images belong to a chat and a turn; portraits belong to a character.
 * Bytes are written as ordinary files (never base64 in a session log), and a
 * small index beside them records the approved prompt and the provider that
 * produced each image.
 */
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { IMAGE_MIN_BYTES } from './config.js'
import { storyDirectory } from '../stage.js'

/** Directory holding one chat's scene images. */
export const SCENE_IMAGES_DIRECTORY = 'images'

/** Scene image metadata file. */
export const SCENE_INDEX_FILE = 'index.jsonl'

/** Directory holding one character's portraits. */
export const PORTRAITS_DIRECTORY = 'portraits'

/** Portrait metadata file. */
export const PORTRAIT_INDEX_FILE = 'index.json'

/** Schema stamped on every record. */
export const IMAGE_RECORD_SCHEMA = 1

/** Most characters in an id or file name. */
const ID_MAX = 80

/** A stored image record is invalid or a file is outside its directory. */
export class ImageStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageStoreError'
  }
}

/** One scene image record. */
export interface SceneImageRecord {
  readonly schema: number
  readonly id: string
  readonly turn: number
  readonly file: string
  readonly mime: string
  readonly sizeBytes: number
  readonly draftPrompt: string
  readonly refinedPrompt?: string
  readonly finalPrompt: string
  readonly provider: string
  readonly model: string
  readonly seed?: number
  readonly aspect: string
  readonly style: string
  readonly refineModel?: string
  readonly approvedAt: string
  readonly createdAt: string
}

/** One portrait record. */
export interface PortraitRecord {
  readonly schema: number
  readonly id: string
  readonly cardId: string
  readonly file: string
  readonly mime: string
  readonly sizeBytes: number
  readonly draftPrompt: string
  readonly refinedPrompt?: string
  readonly finalPrompt: string
  readonly provider: string
  readonly model: string
  readonly seed?: number
  readonly aspect: string
  readonly style: string
  readonly refineModel?: string
  readonly approvedAt: string
  readonly createdAt: string
}

/** Metadata written for one new scene image. */
export interface SceneImageInput {
  readonly turn: number
  readonly bytes: Uint8Array
  readonly mime: string
  readonly draftPrompt: string
  readonly refinedPrompt?: string
  readonly finalPrompt: string
  readonly provider: string
  readonly model: string
  readonly seed?: number
  readonly aspect: string
  readonly style: string
  readonly refineModel?: string
  readonly approvedAt: string
}

/** Metadata written for one new portrait. */
export interface PortraitInput extends Omit<SceneImageInput, 'turn'> {
  readonly cardId: string
}

/** One character's portrait index. */
export interface PortraitIndex {
  readonly schema: number
  readonly activeId?: string
  readonly items: readonly PortraitRecord[]
}

/** @param workspaceDir - tavern workspace root. @param session - chat id. @returns the scene image directory. */
export function sceneImagesDirectory(workspaceDir: string, session: string): string {
  return join(storyDirectory(workspaceDir, session), SCENE_IMAGES_DIRECTORY)
}

/** @param workspaceDir - tavern workspace root. @param session - chat id. @returns the scene index path. */
export function sceneIndexPath(workspaceDir: string, session: string): string {
  return join(sceneImagesDirectory(workspaceDir, session), SCENE_INDEX_FILE)
}

/** @param workspaceDir - tavern workspace root. @param cardId - character id. @returns the portrait directory. */
export function portraitsDirectory(workspaceDir: string, cardId: string): string {
  return join(workspaceDir, '.dshtavern', 'characters', safeId(cardId), PORTRAITS_DIRECTORY)
}

/** @param workspaceDir - tavern workspace root. @param cardId - character id. @returns the portrait index path. */
export function portraitsIndexPath(workspaceDir: string, cardId: string): string {
  return join(portraitsDirectory(workspaceDir, cardId), PORTRAIT_INDEX_FILE)
}

/** Validate an id used in a path or query. */
export function safeId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new ImageStoreError('图片 id 非法')
  return value
}

/** Map a MIME type to the extension written beside the index. */
export function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  throw new ImageStoreError(`不支持的图片类型：${mime}`)
}

/**
 * Validate image bytes and return their real MIME type.
 * @param bytes - decoded bytes.
 * @param maxBytes - configured ceiling.
 * @returns the detected MIME and extension.
 * @throws ImageStoreError when the payload is empty, oversized, or not a supported image.
 */
export function inspectImage(bytes: Uint8Array, maxBytes: number): { mime: string; extension: string } {
  if (bytes.byteLength < IMAGE_MIN_BYTES) throw new ImageStoreError('图片内容过小')
  if (bytes.byteLength > maxBytes) throw new ImageStoreError('图片超过大小上限')
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mime: 'image/png', extension: 'png' }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' }
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', extension: 'webp' }
  }
  throw new ImageStoreError('返回值不是 PNG、JPEG 或 WebP 图片')
}

/** Make one unique id. */
function newId(): string {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

/** Write one file atomically. */
async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  const temporary = `${path}.tmp-${randomUUID()}`
  await writeFile(temporary, data)
  try {
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

/** Resolve a stored file name inside its directory. */
function resolveImageFile(directory: string, file: string): string {
  if (file !== basename(file) || !/^[A-Za-z0-9_-]{1,120}\.(?:png|jpg|webp)$/.test(file)) {
    throw new ImageStoreError('图片文件名非法')
  }
  const target = resolve(directory, file)
  if (!target.startsWith(resolve(directory) + sep)) throw new ImageStoreError('图片路径越界')
  return target
}

/**
 * Write one scene image and append its metadata.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat id.
 * @param input - bytes and the approved request.
 * @returns the stored record.
 */
export async function writeSceneImage(
  workspaceDir: string,
  session: string,
  input: SceneImageInput,
): Promise<SceneImageRecord> {
  const inspected = inspectImage(input.bytes, 52_428_800)
  const directory = sceneImagesDirectory(workspaceDir, session)
  const id = newId()
  const file = `${id}.${inspected.extension}`
  const record: SceneImageRecord = {
    schema: IMAGE_RECORD_SCHEMA,
    id,
    turn: input.turn,
    file,
    mime: inspected.mime,
    sizeBytes: input.bytes.byteLength,
    draftPrompt: input.draftPrompt,
    ...(input.refinedPrompt === undefined ? {} : { refinedPrompt: input.refinedPrompt }),
    finalPrompt: input.finalPrompt,
    provider: input.provider,
    model: input.model,
    ...(input.seed === undefined ? {} : { seed: input.seed }),
    aspect: input.aspect,
    style: input.style,
    ...(input.refineModel === undefined ? {} : { refineModel: input.refineModel }),
    approvedAt: input.approvedAt,
    createdAt: new Date().toISOString(),
  }
  await mkdir(directory, { recursive: true })
  await writeAtomic(join(directory, file), input.bytes)
  try {
    await appendFile(sceneIndexPath(workspaceDir, session), `${JSON.stringify(record)}\n`, 'utf8')
  } catch (error) {
    await unlink(join(directory, file)).catch(() => undefined)
    throw error
  }
  return record
}

/** Parse one scene record, skipping damaged lines. */
function parseSceneRecord(value: unknown): SceneImageRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.turn !== 'number') return undefined
  if (typeof record.file !== 'string' || typeof record.mime !== 'string') return undefined
  if (typeof record.finalPrompt !== 'string' || typeof record.provider !== 'string') return undefined
  if (typeof record.model !== 'string' || typeof record.createdAt !== 'string') return undefined
  if (typeof record.approvedAt !== 'string' || typeof record.aspect !== 'string' || typeof record.style !== 'string') {
    return undefined
  }
  return {
    schema: typeof record.schema === 'number' ? record.schema : IMAGE_RECORD_SCHEMA,
    id: record.id,
    turn: record.turn,
    file: record.file,
    mime: record.mime,
    sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : 0,
    draftPrompt: typeof record.draftPrompt === 'string' ? record.draftPrompt : record.finalPrompt,
    ...(typeof record.refinedPrompt === 'string' ? { refinedPrompt: record.refinedPrompt } : {}),
    finalPrompt: record.finalPrompt,
    provider: record.provider,
    model: record.model,
    ...(typeof record.seed === 'number' ? { seed: record.seed } : {}),
    aspect: record.aspect,
    style: record.style,
    ...(typeof record.refineModel === 'string' ? { refineModel: record.refineModel } : {}),
    approvedAt: record.approvedAt,
    createdAt: record.createdAt,
  }
}

/**
 * List a chat's scene images, newest first.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat id.
 * @param turn - optional turn filter.
 * @returns usable records.
 */
export async function listSceneImages(
  workspaceDir: string,
  session: string,
  turn?: number,
): Promise<SceneImageRecord[]> {
  let text: string
  try {
    text = await readFile(sceneIndexPath(workspaceDir, session), 'utf8')
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
  const records: SceneImageRecord[] = []
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const record = parseSceneRecord(JSON.parse(line))
      if (record !== undefined && (turn === undefined || record.turn === turn)) records.push(record)
    } catch {
      // One damaged line must not hide the rest of the gallery.
    }
  }
  return records.reverse()
}

/**
 * Resolve one scene image file.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat id.
 * @param id - image id.
 * @returns the record and absolute path.
 * @throws ImageStoreError when the id is unknown.
 */
export async function readSceneImageFile(
  workspaceDir: string,
  session: string,
  id: string,
): Promise<{ record: SceneImageRecord; path: string }> {
  const safe = safeId(id)
  const records = await listSceneImages(workspaceDir, session)
  const record = records.find(item => item.id === safe)
  if (record === undefined) throw new ImageStoreError('图片不存在')
  return { record, path: resolveImageFile(sceneImagesDirectory(workspaceDir, session), record.file) }
}

/** @param workspaceDir - tavern workspace root. @param cardId - character id. @returns an empty index. */
export function emptyPortraitIndex(): PortraitIndex {
  return { schema: IMAGE_RECORD_SCHEMA, items: [] }
}

/** Normalize one portrait record. */
function parsePortraitRecord(value: unknown): PortraitRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.cardId !== 'string') return undefined
  if (typeof record.file !== 'string' || typeof record.mime !== 'string') return undefined
  if (typeof record.finalPrompt !== 'string' || typeof record.provider !== 'string') return undefined
  if (typeof record.model !== 'string' || typeof record.createdAt !== 'string') return undefined
  if (typeof record.approvedAt !== 'string' || typeof record.aspect !== 'string' || typeof record.style !== 'string') {
    return undefined
  }
  return {
    schema: typeof record.schema === 'number' ? record.schema : IMAGE_RECORD_SCHEMA,
    id: record.id,
    cardId: record.cardId,
    file: record.file,
    mime: record.mime,
    sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : 0,
    draftPrompt: typeof record.draftPrompt === 'string' ? record.draftPrompt : record.finalPrompt,
    ...(typeof record.refinedPrompt === 'string' ? { refinedPrompt: record.refinedPrompt } : {}),
    finalPrompt: record.finalPrompt,
    provider: record.provider,
    model: record.model,
    ...(typeof record.seed === 'number' ? { seed: record.seed } : {}),
    aspect: record.aspect,
    style: record.style,
    ...(typeof record.refineModel === 'string' ? { refineModel: record.refineModel } : {}),
    approvedAt: record.approvedAt,
    createdAt: record.createdAt,
  }
}

/**
 * Read one character's portrait index.
 * @param workspaceDir - tavern workspace root.
 * @param cardId - character id.
 * @returns the index; damaged items are skipped.
 */
export async function readPortraitIndex(workspaceDir: string, cardId: string): Promise<PortraitIndex> {
  let text: string
  try {
    text = await readFile(portraitsIndexPath(workspaceDir, cardId), 'utf8')
  } catch (error) {
    if (isMissing(error)) return emptyPortraitIndex()
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return emptyPortraitIndex()
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyPortraitIndex()
  const record = value as Record<string, unknown>
  const items = Array.isArray(record.items)
    ? record.items.map(parsePortraitRecord).filter((item): item is PortraitRecord => item !== undefined)
    : []
  const activeId = typeof record.activeId === 'string' && items.some(item => item.id === record.activeId)
    ? record.activeId
    : undefined
  return { schema: IMAGE_RECORD_SCHEMA, ...(activeId === undefined ? {} : { activeId }), items }
}

/** Write one portrait index atomically. */
async function writePortraitIndex(workspaceDir: string, cardId: string, index: PortraitIndex): Promise<void> {
  const target = portraitsIndexPath(workspaceDir, cardId)
  await mkdir(portraitsDirectory(workspaceDir, cardId), { recursive: true })
  await writeAtomic(target, `${JSON.stringify({ ...index, schema: IMAGE_RECORD_SCHEMA }, null, 2)}\n`)
}

/**
 * Write one portrait and append it to the character's index.
 * @param workspaceDir - tavern workspace root.
 * @param input - bytes and the approved request.
 * @returns the stored record.
 */
export async function writePortrait(workspaceDir: string, input: PortraitInput): Promise<PortraitRecord> {
  const inspected = inspectImage(input.bytes, 52_428_800)
  const directory = portraitsDirectory(workspaceDir, input.cardId)
  const id = newId()
  const file = `${id}.${inspected.extension}`
  const record: PortraitRecord = {
    schema: IMAGE_RECORD_SCHEMA,
    id,
    cardId: safeId(input.cardId),
    file,
    mime: inspected.mime,
    sizeBytes: input.bytes.byteLength,
    draftPrompt: input.draftPrompt,
    ...(input.refinedPrompt === undefined ? {} : { refinedPrompt: input.refinedPrompt }),
    finalPrompt: input.finalPrompt,
    provider: input.provider,
    model: input.model,
    ...(input.seed === undefined ? {} : { seed: input.seed }),
    aspect: input.aspect,
    style: input.style,
    ...(input.refineModel === undefined ? {} : { refineModel: input.refineModel }),
    approvedAt: input.approvedAt,
    createdAt: new Date().toISOString(),
  }
  const index = await readPortraitIndex(workspaceDir, input.cardId)
  await mkdir(directory, { recursive: true })
  await writeAtomic(join(directory, file), input.bytes)
  try {
    await writePortraitIndex(workspaceDir, input.cardId, { ...index, items: [...index.items, record] })
  } catch (error) {
    await unlink(join(directory, file)).catch(() => undefined)
    throw error
  }
  return record
}

/**
 * Switch one character's active portrait.
 * @param workspaceDir - tavern workspace root.
 * @param cardId - character id.
 * @param id - portrait id, or `undefined` to clear.
 * @returns the updated index.
 */
export async function setActivePortrait(
  workspaceDir: string,
  cardId: string,
  id: string | undefined,
): Promise<PortraitIndex> {
  const index = await readPortraitIndex(workspaceDir, cardId)
  if (id !== undefined && !index.items.some(item => item.id === id)) {
    throw new ImageStoreError('立绘不存在')
  }
  const next: PortraitIndex = id === undefined
    ? { schema: index.schema, items: index.items }
    : { schema: index.schema, activeId: id, items: index.items }
  await writePortraitIndex(workspaceDir, cardId, next)
  return next
}

/**
 * Resolve one portrait file.
 * @param workspaceDir - tavern workspace root.
 * @param cardId - character id.
 * @param id - portrait id.
 * @returns the record and absolute path.
 */
export async function readPortraitFile(
  workspaceDir: string,
  cardId: string,
  id: string,
): Promise<{ record: PortraitRecord; path: string }> {
  const index = await readPortraitIndex(workspaceDir, cardId)
  const record = index.items.find(item => item.id === safeId(id))
  if (record === undefined) throw new ImageStoreError('立绘不存在')
  return { record, path: resolveImageFile(portraitsDirectory(workspaceDir, cardId), record.file) }
}

/** @param workspaceDir - tavern workspace root. @param cardId - character id. @returns the active portrait, if any. */
export async function activePortrait(workspaceDir: string, cardId: string): Promise<PortraitRecord | undefined> {
  const index = await readPortraitIndex(workspaceDir, cardId)
  if (index.activeId === undefined) return undefined
  return index.items.find(item => item.id === index.activeId)
}

/** @param error - filesystem error. @returns whether it means "not found". */
function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
