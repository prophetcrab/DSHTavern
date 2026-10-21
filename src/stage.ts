/**
 * Tavern stage and world state.
 *
 * The stage is the reader-visible record of a role-play: every narration line
 * and every character line, in order. Every participant — the director and each
 * character — reads the same stage, so "shared context" means a shared stage,
 * never a shared brain.
 *
 * The world state is the director's private ledger: facts, unresolved plot, and
 * anything the characters do not yet know. It is never sent to a character.
 *
 * Files live beside the marker under `<workspace>/.dshtavern/`:
 * `stage.jsonl` (append-only) and `world.json` (rewritten atomically).
 */
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Directory holding tavern runtime state, relative to the workspace root. */
export const STATE_DIRECTORY = '.dshtavern'

/** Append-only stage log. */
export const STAGE_FILE = 'stage.jsonl'

/** Director-owned world snapshot. */
export const WORLD_FILE = 'world.json'

/** Whether a line was narrated by the director or spoken by a character. */
export type StageKind = 'narration' | 'speech'

/**
 * Who may observe a line.
 *
 * `observable` lines reach every character; `omniscient` lines are director
 * knowledge and never enter a character request. Only `observable` narration is
 * appended to the stage — the director writes its private reasoning to the world
 * state instead.
 */
export type StageScope = 'observable' | 'omniscient'

/** One staged line. */
export interface StageEntry {
  /** Monotonic position in the stage. */
  readonly seq: number
  /** ISO-8601 instant the line was staged. */
  readonly at: string
  /** Producer of the line. */
  readonly kind: StageKind
  /** Character id for a speech line; absent for narration. */
  readonly speaker?: string
  /** Character display name for a speech line; absent for narration. */
  readonly speakerName?: string
  /** Line text, already readable by the player. */
  readonly text: string
  /** Observability; v1 stages only `observable` lines. */
  readonly scope: StageScope
}

/** Director-owned world snapshot. */
export interface WorldState {
  /** Short description of where the scene stands. */
  readonly scene: string
  /** Established facts every participant may eventually notice. */
  readonly facts: readonly string[]
  /** Unrevealed knowledge: director-only plot advancement. */
  readonly hidden: readonly string[]
  /** ISO-8601 of the last update; absent before the first write. */
  readonly updatedAt?: string
}

/** @param workspaceDir - tavern workspace root. @returns its state directory. */
export function stateDirectory(workspaceDir: string): string {
  return join(workspaceDir, STATE_DIRECTORY)
}

/**
 * Directory owning one session's stage and world.
 *
 * A stage belongs to a chat, not to a workspace: two chats in the same tavern
 * are different stories and must not share a transcript. `session` narrows the
 * files to that one chat; omitting it addresses the workspace-level directory,
 * which holds only tavern-wide state such as the last recorded request.
 * @param workspaceDir - tavern workspace root.
 * @param session - owning session id, when addressing a chat.
 * @returns the directory for that scope.
 */
export function storyDirectory(workspaceDir: string, session: string | undefined): string {
  const base = stateDirectory(workspaceDir)
  return session === undefined ? base : join(base, 'stories', safeSegment(session))
}

/** @param workspaceDir - tavern workspace root. @param session - chat identity. @returns the stage file path. */
export function stagePath(workspaceDir: string, session?: string): string {
  return join(storyDirectory(workspaceDir, session), STAGE_FILE)
}

/** @param workspaceDir - tavern workspace root. @param session - chat identity. @returns the world file path. */
export function worldPath(workspaceDir: string, session?: string): string {
  return join(storyDirectory(workspaceDir, session), WORLD_FILE)
}

/** Keep a session id usable as one directory segment. */
function safeSegment(session: string): string {
  return session.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** @returns an empty world for a scene that has not started. */
export function emptyWorld(): WorldState {
  return { scene: '', facts: [], hidden: [] }
}

/**
 * Parse one stage line.
 * @param line - raw JSONL line.
 * @returns the entry, or `undefined` when the line is not a usable entry.
 */
export function parseStageEntry(line: string): StageEntry | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.seq !== 'number' || !Number.isInteger(record.seq)) return undefined
  if (typeof record.text !== 'string' || record.text.length === 0) return undefined
  if (record.kind !== 'narration' && record.kind !== 'speech') return undefined
  const scope: StageScope = record.scope === 'omniscient' ? 'omniscient' : 'observable'
  const speaker = typeof record.speaker === 'string' ? record.speaker : undefined
  const speakerName = typeof record.speakerName === 'string' ? record.speakerName : undefined
  return {
    seq: record.seq,
    at: typeof record.at === 'string' ? record.at : new Date(0).toISOString(),
    kind: record.kind,
    ...(speaker === undefined ? {} : { speaker }),
    ...(speakerName === undefined ? {} : { speakerName }),
    text: record.text,
    scope,
  }
}

/**
 * Read the whole stage.
 * @param workspaceDir - tavern workspace root.
 * @returns staged lines in order; a missing file reads as an empty stage.
 */
export async function readStage(workspaceDir: string, session?: string): Promise<StageEntry[]> {
  let text: string
  try {
    text = await readFile(stagePath(workspaceDir, session), 'utf8')
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
  const entries: StageEntry[] = []
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    const entry = parseStageEntry(line)
    if (entry !== undefined) entries.push(entry)
  }
  return entries
}

/**
 * Append lines to the stage, assigning sequence numbers after the current tail.
 * @param workspaceDir - tavern workspace root.
 * @param lines - lines to append, without `seq`.
 * @returns the appended entries with their assigned sequence numbers.
 */
export async function appendStage(
  workspaceDir: string,
  lines: readonly Omit<StageEntry, 'seq' | 'at'>[],
  session?: string,
): Promise<StageEntry[]> {
  if (lines.length === 0) return []
  const existing = await readStage(workspaceDir, session)
  let next = existing.reduce((max, entry) => Math.max(max, entry.seq), 0) + 1
  const at = new Date().toISOString()
  const appended: StageEntry[] = []
  for (const line of lines) {
    appended.push({ seq: next, at, ...line } as StageEntry)
    next += 1
  }
  await mkdir(storyDirectory(workspaceDir, session), { recursive: true })
  const text = appended.map(entry => `${JSON.stringify(entry)}\n`).join('')
  await appendFile(stagePath(workspaceDir, session), text, 'utf8')
  return appended
}

/**
 * Read the director's world snapshot.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored world, or an empty one before the first write.
 */
export async function readWorld(workspaceDir: string, session?: string): Promise<WorldState> {
  let text: string
  try {
    text = await readFile(worldPath(workspaceDir, session), 'utf8')
  } catch (error) {
    if (isMissing(error)) return emptyWorld()
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return emptyWorld()
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyWorld()
  const record = value as Record<string, unknown>
  return {
    scene: typeof record.scene === 'string' ? record.scene : '',
    facts: stringList(record.facts),
    hidden: stringList(record.hidden),
    ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
  }
}

/**
 * Write the world snapshot atomically (temporary file then rename).
 * @param workspaceDir - tavern workspace root.
 * @param world - snapshot to persist; `updatedAt` is stamped here.
 * @returns the stored snapshot.
 */
export async function writeWorld(workspaceDir: string, world: Omit<WorldState, 'updatedAt'>, session?: string): Promise<WorldState> {
  const stored: WorldState = { ...world, updatedAt: new Date().toISOString() }
  const directory = storyDirectory(workspaceDir, session)
  await mkdir(directory, { recursive: true })
  const target = worldPath(workspaceDir, session)
  const temporary = `${target}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  return stored
}

/**
 * Render the stage as the transcript both the director and characters read.
 * @param entries - staged lines.
 * @param options - optional speaker filter applied to speech lines.
 * @returns one line per entry, prefixed by who produced it.
 */
export function renderStage(
  entries: readonly StageEntry[],
  options: { readonly onlySpeakers?: readonly string[] } = {},
): string {
  const allowed = options.onlySpeakers === undefined ? undefined : new Set(options.onlySpeakers)
  const lines: string[] = []
  for (const entry of entries) {
    if (entry.scope !== 'observable') continue
    if (entry.kind === 'narration') {
      lines.push(`[旁白] ${entry.text}`)
      continue
    }
    if (allowed !== undefined && entry.speaker !== undefined && !allowed.has(entry.speaker)) continue
    lines.push(`[${entry.speakerName ?? entry.speaker ?? '角色'}] ${entry.text}`)
  }
  return lines.join('\n')
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
