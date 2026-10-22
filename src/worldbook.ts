/**
 * Workspace worldbook: structured lore shared by every character.
 *
 * A worldbook entry is keyed rather than always-on: it enters a prompt only when
 * its triggers appear in what the reader can perceive. Entries stored here belong
 * to the workspace, so a fact about the world is written once instead of being
 * copied into every card.
 *
 * The matching model follows SillyTavern's World Info: primary keys are OR'd,
 * secondary keys refine them through one of four logics, `constant` entries skip
 * matching, `depth` bounds how far back the scan reaches, and a budget caps how
 * much lore one request may carry.
 *
 * Character cards keep their own entries ({@link CharacterEntry}); both sources
 * are matched through the same engine so a card entry and a workspace entry
 * behave identically.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { STATE_DIRECTORY, type StageEntry } from './stage.js'

/** Worldbook file name inside the tavern state directory. */
export const WORLDBOOK_FILE = 'worldbook.json'

/** Schema version this build reads and writes. */
export const WORLDBOOK_SCHEMA = 1

/** How secondary keys combine with a primary hit. */
export type WorldbookLogic = 'and_any' | 'and_all' | 'not_any' | 'not_all'

/**
 * Where an activated entry is placed.
 *
 * `before` and `after` fill the two catalogue blocks around the character
 * definition. `tail` appends after everything else, which is where
 * scene-specific reminders belong: the model weights the end of a prompt more
 * heavily than the middle.
 */
export type WorldbookPosition = 'before' | 'after' | 'tail'

/** Who may read an entry. `director` entries never reach a character prompt. */
export type WorldbookAudience = 'all' | 'director'

/** One keyed lore entry. */
export interface WorldbookEntry {
  /** Stable identity used by the editor and the stage records. */
  readonly id: string
  /** Display name; also the heading this entry contributes. */
  readonly name: string
  /** Text injected when the entry activates. */
  readonly content: string
  /** Primary triggers; any one hit activates the entry. */
  readonly keys: readonly string[]
  /** Refining triggers consulted through {@link logic}. */
  readonly secondaryKeys: readonly string[]
  /** How secondary keys combine. */
  readonly logic: WorldbookLogic
  /** Always inject, ignoring keys. */
  readonly constant: boolean
  /** Where the activated text lands. */
  readonly position: WorldbookPosition
  /** Lower values appear earlier in the prompt and survive the budget first. */
  readonly order: number
  /** How many recent stage lines the scan covers; `0` means the whole window. */
  readonly depth: number
  /** Whether this entry participates at all. */
  readonly enabled: boolean
  /** Match case-sensitively. */
  readonly caseSensitive: boolean
  /** Require the key to sit on word boundaries. */
  readonly wholeWords: boolean
  /** Who may read the entry. */
  readonly audience: WorldbookAudience
}

/** Persisted worldbook file. */
export interface WorldbookFile {
  readonly schema: number
  readonly entries: readonly WorldbookEntry[]
  /** ISO-8601 of the last write. */
  readonly updatedAt?: string
}

/** Largest entry content accepted. */
export const WORLDBOOK_CONTENT_MAX = 16_000

/** Largest number of entries a workspace may store. */
export const WORLDBOOK_ENTRIES_MAX = 512

/** Most entries one request may carry. */
export const WORLDBOOK_ACTIVE_MAX = 8

/** Most characters of lore one request may carry. */
export const WORLDBOOK_ACTIVE_CHARS_MAX = 6000

/** Default scan window when an entry names no depth. */
export const WORLDBOOK_DEFAULT_DEPTH = 6

/** Recent stage lines the lore scan covers by default. */
export const WORLDBOOK_SCAN_LINES = 20

/** A worldbook file or entry is structurally invalid. */
export class WorldbookInvalidError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message)
    this.name = 'WorldbookInvalidError'
  }
}

/** @param workspaceDir - tavern workspace root. @returns the worldbook file path. */
export function worldbookPath(workspaceDir: string): string {
  return join(workspaceDir, STATE_DIRECTORY, WORLDBOOK_FILE)
}

/** @returns an empty worldbook. */
export function emptyWorldbook(): WorldbookFile {
  return { schema: WORLDBOOK_SCHEMA, entries: [] }
}

/**
 * Build one entry from caller input, applying defaults.
 * @param input - partial entry; `id` is generated when absent.
 * @param path - file path for diagnostics.
 * @returns the normalised entry.
 * @throws WorldbookInvalidError when a required field is missing or malformed.
 */
export function buildEntry(input: unknown, path?: string): WorldbookEntry {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new WorldbookInvalidError('世界书条目必须是对象', path)
  }
  const record = input as Record<string, unknown>
  const name = text(record.name, '名称', path).trim()
  if (name.length === 0) throw new WorldbookInvalidError('世界书条目需要名称', path)
  const content = text(record.content, '内容', path)
  if (content.length > WORLDBOOK_CONTENT_MAX) throw new WorldbookInvalidError('世界书条目内容过长', path)
  const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID()
  return {
    id,
    name,
    content,
    keys: keyList(record.keys, path),
    secondaryKeys: keyList(record.secondaryKeys, path),
    logic: logicOf(record.logic),
    constant: record.constant === true,
    position: positionOf(record.position),
    order: numberOr(record.order, 100),
    depth: numberOr(record.depth, WORLDBOOK_DEFAULT_DEPTH),
    enabled: record.enabled !== false,
    caseSensitive: record.caseSensitive === true,
    wholeWords: record.wholeWords === true,
    audience: record.audience === 'director' ? 'director' : 'all',
  }
}

/**
 * Parse a stored worldbook file.
 * @param text - file content.
 * @param path - file path for diagnostics.
 * @returns the parsed file.
 * @throws WorldbookInvalidError when the document is unusable.
 */
export function parseWorldbook(text: string, path: string): WorldbookFile {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new WorldbookInvalidError('世界书不是合法 JSON', path)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorldbookInvalidError('世界书必须是 JSON 对象', path)
  }
  const record = value as Record<string, unknown>
  const schema = typeof record.schema === 'number' ? record.schema : WORLDBOOK_SCHEMA
  if (schema > WORLDBOOK_SCHEMA) {
    throw new WorldbookInvalidError(`世界书 schema ${schema} 高于支持版本`, path)
  }
  const raw = Array.isArray(record.entries) ? record.entries : []
  const entries = raw.slice(0, WORLDBOOK_ENTRIES_MAX).map(item => buildEntry(item, path))
  return {
    schema: WORLDBOOK_SCHEMA,
    entries,
    ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
  }
}

/**
 * Read one workspace's worldbook.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored book, or an empty one when absent.
 */
export async function readWorldbook(workspaceDir: string): Promise<WorldbookFile> {
  let text: string
  try {
    text = await readFile(worldbookPath(workspaceDir), 'utf8')
  } catch (error) {
    if (isMissing(error)) return emptyWorldbook()
    throw error
  }
  return parseWorldbook(text, worldbookPath(workspaceDir))
}

/** Discriminator stamped into an exported `.world` file. */
export const WORLDBOOK_EXPORT_KIND = 'dshtavern.worldbook'

/** Envelope written to a `.world` file. */
export interface WorldbookExport {
  readonly kind: typeof WORLDBOOK_EXPORT_KIND
  readonly schema: number
  /** ISO-8601 of the export, informational only. */
  readonly exportedAt: string
  /** Workspace title the book came from, informational only. */
  readonly source?: string
  readonly entries: readonly WorldbookEntry[]
}

/**
 * Render one workspace's worldbook as a portable `.world` document.
 *
 * The export carries every entry verbatim so a round-trip through import
 * reproduces the same book; the envelope's own fields are advisory and never
 * feed back into matching.
 * @param book - stored worldbook.
 * @param source - workspace title for provenance, when known.
 * @returns the JSON text to download.
 */
export function exportWorldbookText(book: WorldbookFile, source?: string): string {
  const payload: WorldbookExport = {
    kind: WORLDBOOK_EXPORT_KIND,
    schema: WORLDBOOK_SCHEMA,
    exportedAt: new Date().toISOString(),
    ...(source === undefined ? {} : { source }),
    entries: book.entries,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

/**
 * Parse a `.world` document into entries ready for {@link writeWorldbook}.
 *
 * Accepts the exported envelope and, for hand-written files, a bare entry
 * array. Each entry is validated by {@link buildEntry}; a document whose
 * entries are all invalid is rejected rather than silently importing nothing.
 * @param text - file content.
 * @param path - file path for diagnostics.
 * @returns the validated entries.
 * @throws WorldbookInvalidError when the document is unusable.
 */
export function parseWorldbookImport(text: string, path: string): WorldbookEntry[] {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new WorldbookInvalidError('世界书文件不是合法 JSON', path)
  }
  let raw: unknown
  if (Array.isArray(value)) {
    raw = value
  } else if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    if (record.kind !== undefined && record.kind !== WORLDBOOK_EXPORT_KIND) {
      throw new WorldbookInvalidError(`不是酒馆世界书文件（kind=${String(record.kind)}）`, path)
    }
    raw = record.entries
  } else {
    throw new WorldbookInvalidError('世界书文件必须是对象或数组', path)
  }
  if (!Array.isArray(raw)) throw new WorldbookInvalidError('世界书文件缺少 entries 数组', path)
  if (raw.length > WORLDBOOK_ENTRIES_MAX) {
    throw new WorldbookInvalidError(`世界书最多 ${WORLDBOOK_ENTRIES_MAX} 条`, path)
  }
  return raw.map(item => buildEntry(item, path))
}

/**
 * Persist one workspace's worldbook atomically.
 * @param workspaceDir - tavern workspace root.
 * @param entries - complete entry list, however malformed.
 * @returns the stored book.
 */
export async function writeWorldbook(workspaceDir: string, entries: unknown): Promise<WorldbookFile> {
  if (!Array.isArray(entries)) throw new WorldbookInvalidError('世界书条目必须是数组')
  if (entries.length > WORLDBOOK_ENTRIES_MAX) {
    throw new WorldbookInvalidError(`世界书最多 ${WORLDBOOK_ENTRIES_MAX} 条`)
  }
  const built = entries.map(item => buildEntry(item))
  const book: WorldbookFile = {
    schema: WORLDBOOK_SCHEMA,
    entries: built,
    updatedAt: new Date().toISOString(),
  }
  const directory = join(workspaceDir, STATE_DIRECTORY)
  await mkdir(directory, { recursive: true })
  const target = worldbookPath(workspaceDir)
  const temporary = `${target}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(book, null, 2)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  return book
}

/** Activated entry grouped by where it lands. */
export interface ActivatedLore {
  readonly before: readonly WorldbookEntry[]
  readonly after: readonly WorldbookEntry[]
  readonly tail: readonly WorldbookEntry[]
}

/** Options for {@link activateEntries}. */
export interface ActivationOptions {
  /** Entries from the workspace and the active character card. */
  readonly entries: readonly WorldbookEntry[]
  /** Recent observable text the scan runs over, newest last. */
  readonly scanText: string
  /** Most recent stage lines; each entry's `depth` indexes into this. */
  readonly recentLines: readonly string[]
  /** Reader asking for lore; `director` entries are dropped for characters. */
  readonly audience: 'character' | 'director'
  /** Maximum entries returned. */
  readonly maxEntries?: number
  /** Maximum characters of content returned. */
  readonly maxChars?: number
}

/**
 * Select the entries one reader should receive.
 *
 * Constant entries bypass matching. Keyed entries scan the last `depth` lines
 * (their own depth, else the whole provided window). Secondary keys then narrow
 * the hit through {@link WorldbookLogic}. The result is ordered by `order` and
 * cut to the budget, so a long worldbook degrades predictably instead of
 * silently consuming the request.
 * @param options - entries, scan text, reader, and budget.
 * @returns activated entries grouped by position.
 */
export function activateEntries(options: ActivationOptions): ActivatedLore {
  const maxEntries = options.maxEntries ?? WORLDBOOK_ACTIVE_MAX
  const maxChars = options.maxChars ?? WORLDBOOK_ACTIVE_CHARS_MAX
  const eligible = options.entries
    .filter(entry => entry.enabled && entry.content.trim().length > 0)
    .filter(entry => options.audience === 'director' || entry.audience === 'all')
    .filter(entry => entry.constant || matches(entry, options))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))

  const before: WorldbookEntry[] = []
  const after: WorldbookEntry[] = []
  const tail: WorldbookEntry[] = []
  let usedChars = 0
  let usedEntries = 0
  for (const entry of eligible) {
    if (usedEntries >= maxEntries) break
    const cost = entry.content.length
    if (usedChars + cost > maxChars) continue
    usedChars += cost
    usedEntries += 1
    if (entry.position === 'before') before.push(entry)
    else if (entry.position === 'after') after.push(entry)
    else tail.push(entry)
  }
  return { before, after, tail }
}

/**
 * Render activated entries as prompt text.
 * @param entries - activated entries for one position.
 * @returns their contents joined in order; empty when none activated.
 */
export function renderLore(entries: readonly WorldbookEntry[]): string {
  return entries.map(entry => entry.content.trim()).filter(text => text.length > 0).join('\n\n')
}

/**
 * Convert a character card's own entries into worldbook entries.
 *
 * Card entries are private to that character, so they carry `audience: 'all'`
 * only for that card — they are never merged into another character's list.
 * @param entries - card-owned entries.
 * @returns equivalent worldbook entries.
 */
export function fromCardEntries(entries: readonly {
  readonly id: string
  readonly name: string
  readonly content: string
  readonly keys: readonly string[]
  readonly position: 'before' | 'after'
  readonly constant: boolean
  readonly enabled: boolean
}[]): WorldbookEntry[] {
  return entries.map(entry => ({
    id: entry.id,
    name: entry.name,
    content: entry.content,
    keys: entry.keys,
    secondaryKeys: [],
    logic: 'and_any' as const,
    constant: entry.constant,
    position: entry.position,
    order: 100,
    depth: WORLDBOOK_DEFAULT_DEPTH,
    enabled: entry.enabled,
    caseSensitive: false,
    wholeWords: false,
    audience: 'all' as const,
  }))
}

/** Whether one entry's triggers hit the scanned text. */
function matches(entry: WorldbookEntry, options: ActivationOptions): boolean {
  if (entry.keys.length === 0) return false
  const window = entry.depth > 0 ? options.recentLines.slice(-entry.depth) : options.recentLines
  const haystack = [window.join('\n'), options.scanText].join('\n')
  if (!hitsAny(entry.keys, haystack, entry)) return false
  if (entry.secondaryKeys.length === 0) return true
  return applyLogic(entry, haystack)
}

/** Apply the secondary-key logic to a primary hit. */
function applyLogic(entry: WorldbookEntry, haystack: string): boolean {
  const results = entry.secondaryKeys.map(key => keyHits(key, haystack, entry))
  switch (entry.logic) {
    case 'and_all': return results.every(Boolean)
    case 'not_any': return !results.some(Boolean)
    case 'not_all': return !results.every(Boolean)
    case 'and_any':
    default: return results.some(Boolean)
  }
}

function hitsAny(keys: readonly string[], haystack: string, entry: WorldbookEntry): boolean {
  return keys.some(key => keyHits(key, haystack, entry))
}

/** Whether one key occurs in the haystack under the entry's matching rules. */
function keyHits(key: string, haystack: string, entry: WorldbookEntry): boolean {
  const needle = entry.caseSensitive ? key : key.toLowerCase()
  const subject = entry.caseSensitive ? haystack : haystack.toLowerCase()
  if (!entry.wholeWords) return subject.includes(needle)
  // Word boundaries are approximated for CJK by requiring the neighbouring
  // character not to be alphanumeric, which keeps "伞" from matching "雨伞架"
  // only when the author asks for whole words.
  let from = 0
  while (true) {
    const index = subject.indexOf(needle, from)
    if (index === -1) return false
    const before = subject[index - 1]
    const after = subject[index + needle.length]
    if (!isWordChar(before) && !isWordChar(after)) return true
    from = index + 1
  }
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9]/.test(char)
}

function text(value: unknown, field: string, path?: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new WorldbookInvalidError(`${field} 必须是字符串`, path)
  return value
}

function keyList(value: unknown, path?: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new WorldbookInvalidError('关键词必须是字符串数组', path)
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .slice(0, 32)
}

function logicOf(value: unknown): WorldbookLogic {
  return value === 'and_all' || value === 'not_any' || value === 'not_all' ? value : 'and_any'
}

function positionOf(value: unknown): WorldbookPosition {
  return value === 'after' || value === 'tail' ? value : 'before'
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** Stage lines as scan text, newest last. */
export function stageScanLines(stage: readonly StageEntry[], limit = WORLDBOOK_SCAN_LINES): string[] {
  return stage.slice(-limit).map(entry => entry.kind === 'narration'
    ? entry.text
    : `${entry.speakerName ?? entry.speaker ?? ''}：${entry.text}`)
}
