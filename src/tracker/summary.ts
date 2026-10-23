/**
 * Story tracker storage: trigger settings, per-run summaries, and run state.
 *
 * The tracker runs beside the conversation, not inside it. It reads the story a
 * chat has already produced and periodically asks a model to restate it as a
 * progress ledger — one entry for the world and one per character — so a long
 * session can be reviewed without scrolling back through every beat.
 *
 * Everything lives under `<tavern>/.dshtavern/tracker/`:
 * `config.json` (trigger settings), `state.json` (what has been tracked), and
 * `summaries/<turn>.json` (one ledger per run). The turn in the file name is
 * the newest beat the ledger covers, which is also the number the client marks
 * in the turn rail.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { STATE_DIRECTORY } from '../stage.js'

/** Directory holding tracker data inside the tavern state directory. */
export const TRACKER_DIRECTORY = 'tracker'

/** Settings file name inside {@link TRACKER_DIRECTORY}. */
export const TRACKER_CONFIG_FILE = 'config.json'

/** Run-state file name inside {@link TRACKER_DIRECTORY}. */
export const TRACKER_STATE_FILE = 'state.json'

/** Directory holding one ledger per run. */
export const TRACKER_SUMMARIES_DIRECTORY = 'summaries'

/** Schema version this build reads and writes. */
export const TRACKER_SCHEMA = 1

/** Bounds a config field is validated against. */
export const TRACKER_LIMITS = {
  /** Beats between two automatic runs; 0 disables the turn trigger. */
  everyTurns: { min: 1, max: 200 },
  /** Minutes between two automatic runs; 0 disables the time trigger. */
  everyMinutes: { min: 1, max: 10_080 },
  /** Longest transcript one run forwards, in characters. */
  maxTranscriptChars: { min: 2_000, max: 800_000 },
} as const

/** Largest reply one run accepts, in characters. */
export const TRACKER_REPLY_MAX_CHARS = 8_000

/** How often the host reconsiders whether a chat is due, in milliseconds. */
export const TRACKER_POLL_MS = 60_000

/** One role's model selection; both halves are required together. */
export interface TrackerModelChoice {
  readonly provider: string
  readonly model: string
}

/** Trigger settings for one tavern workspace. */
export interface TrackerConfig {
  readonly schema: number
  /** Whether automatic runs are enabled at all. */
  readonly enabled: boolean
  /** Run after this many new beats; `0` disables the turn trigger. */
  readonly everyTurns: number
  /** Run after this many minutes; `0` disables the time trigger. */
  readonly everyMinutes: number
  /** Longest transcript forwarded; older lines are dropped from the front. */
  readonly maxTranscriptChars: number
  /** Model the run uses; absent follows the session default. */
  readonly model?: TrackerModelChoice
}

/** What has been tracked for one chat. */
export interface TrackerState {
  readonly schema: number
  /** Newest beat the last run covered; `0` before the first run. */
  readonly lastTurn: number
  /** ISO-8601 of the last run. */
  readonly lastAt?: string
}

/** One character's entry in a ledger. */
export interface CharacterProgress {
  /** Card id when the run could resolve it. */
  readonly id?: string
  /** Display name used when it could not. */
  readonly name: string
  /** What this character has established or changed so far. */
  readonly progress: string
}

/** One tracking run's result. */
export interface TrackerSummary {
  readonly schema: number
  /** Newest beat this ledger covers. */
  readonly turn: number
  /** ISO-8601 instant of the run. */
  readonly at: string
  /** Provider/model the run used, for the record. */
  readonly model?: string
  /** Where the story stands: setting, stakes, and the current moment. */
  readonly world: string
  /** One entry per character that appeared or mattered. */
  readonly characters: readonly CharacterProgress[]
  /** Characters of transcript this run was given. */
  readonly transcriptChars: number
  /** Beats covered since the previous ledger; absent on the first run. */
  readonly sinceTurn?: number
}

/** A stored config is structurally invalid. */
export class TrackerConfigInvalidError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message)
    this.name = 'TrackerConfigInvalidError'
  }
}

/**
 * @param workspaceDir - tavern workspace root.
 * @returns the tracker's own directory.
 */
export function trackerDirectory(workspaceDir: string): string {
  return join(workspaceDir, STATE_DIRECTORY, TRACKER_DIRECTORY)
}

/**
 * @param workspaceDir - tavern workspace root.
 * @returns the settings file path.
 */
export function trackerConfigPath(workspaceDir: string): string {
  return join(trackerDirectory(workspaceDir), TRACKER_CONFIG_FILE)
}

/**
 * @param workspaceDir - tavern workspace root.
 * @returns the run-state file path.
 */
export function trackerStatePath(workspaceDir: string): string {
  return join(trackerDirectory(workspaceDir), TRACKER_STATE_FILE)
}

/**
 * @param workspaceDir - tavern workspace root.
 * @returns the directory holding one ledger per run.
 */
export function trackerSummariesDirectory(workspaceDir: string): string {
  return join(trackerDirectory(workspaceDir), TRACKER_SUMMARIES_DIRECTORY)
}

/** @returns the settings a workspace starts from. */
export function defaultTrackerConfig(): TrackerConfig {
  return {
    schema: TRACKER_SCHEMA,
    enabled: false,
    everyTurns: 10,
    everyMinutes: 0,
    maxTranscriptChars: 60_000,
  }
}

function integerIn(value: unknown, field: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TrackerConfigInvalidError(`${field} 必须是 ${min}–${max} 的整数`)
  }
  return value
}

function modelChoice(value: unknown): TrackerModelChoice | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TrackerConfigInvalidError('追踪模型必须是对象')
  }
  const record = value as Record<string, unknown>
  const provider = typeof record.provider === 'string' ? record.provider.trim() : ''
  const model = typeof record.model === 'string' ? record.model.trim() : ''
  // A half-filled pair would silently fall back mid-run; reject it instead.
  if (provider.length === 0 && model.length === 0) return undefined
  if (provider.length === 0 || model.length === 0) {
    throw new TrackerConfigInvalidError('追踪模型需要同时填写 provider 与 model')
  }
  return { provider, model }
}

/**
 * Validate one settings payload, filling absent fields from the defaults.
 * @param value - candidate config, however malformed.
 * @returns the normalised config.
 * @throws TrackerConfigInvalidError when a present field is invalid.
 */
export function normalizeTrackerConfig(value: unknown): TrackerConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TrackerConfigInvalidError('追踪设置必须是对象')
  }
  const record = value as Record<string, unknown>
  if (typeof record.schema === 'number' && record.schema > TRACKER_SCHEMA) {
    throw new TrackerConfigInvalidError(`追踪设置 schema ${String(record.schema)} 高于支持版本`)
  }
  const defaults = defaultTrackerConfig()
  const enabled = record.enabled
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new TrackerConfigInvalidError('enabled 必须是布尔值')
  }
  const model = modelChoice(record.model)
  return {
    schema: TRACKER_SCHEMA,
    enabled: enabled === true,
    everyTurns: integerIn(record.everyTurns, '每多少轮追踪一次',
      0, TRACKER_LIMITS.everyTurns.max, defaults.everyTurns),
    everyMinutes: integerIn(record.everyMinutes, '每多少分钟追踪一次',
      0, TRACKER_LIMITS.everyMinutes.max, defaults.everyMinutes),
    maxTranscriptChars: integerIn(record.maxTranscriptChars, '对话上限字数',
      TRACKER_LIMITS.maxTranscriptChars.min, TRACKER_LIMITS.maxTranscriptChars.max,
      defaults.maxTranscriptChars),
    ...(model === undefined ? {} : { model }),
  }
}

/**
 * Read one workspace's tracker settings.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored config, or the defaults when absent.
 * @throws TrackerConfigInvalidError when the file is unusable.
 */
export async function readTrackerConfig(workspaceDir: string): Promise<TrackerConfig> {
  let text: string
  try {
    text = await readFile(trackerConfigPath(workspaceDir), 'utf8')
  } catch (error) {
    if (isMissing(error)) return defaultTrackerConfig()
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new TrackerConfigInvalidError('追踪设置不是合法 JSON', trackerConfigPath(workspaceDir))
  }
  try {
    return normalizeTrackerConfig(value)
  } catch (error) {
    if (error instanceof TrackerConfigInvalidError && error.path === undefined) {
      throw new TrackerConfigInvalidError(error.message, trackerConfigPath(workspaceDir))
    }
    throw error
  }
}

/**
 * Persist one workspace's tracker settings atomically.
 * @param workspaceDir - tavern workspace root.
 * @param value - full config payload, validated before writing.
 * @returns the stored config.
 */
export async function writeTrackerConfig(workspaceDir: string, value: unknown): Promise<TrackerConfig> {
  const config = normalizeTrackerConfig(value)
  await writeJsonAtomically(trackerConfigPath(workspaceDir), config)
  return config
}

/**
 * Read one chat's run state.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @returns the stored state, or `lastTurn: 0` when absent.
 */
export async function readTrackerState(workspaceDir: string, session: string | undefined): Promise<TrackerState> {
  const empty: TrackerState = { schema: TRACKER_SCHEMA, lastTurn: 0 }
  let text: string
  try {
    text = await readFile(statePathFor(workspaceDir, session), 'utf8')
  } catch (error) {
    if (isMissing(error)) return empty
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return empty
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return empty
  const record = value as Record<string, unknown>
  const lastTurn = typeof record.lastTurn === 'number' && Number.isSafeInteger(record.lastTurn) && record.lastTurn >= 0
    ? record.lastTurn
    : 0
  return {
    schema: TRACKER_SCHEMA,
    lastTurn,
    ...(typeof record.lastAt === 'string' ? { lastAt: record.lastAt } : {}),
  }
}

/**
 * Persist one chat's run state atomically.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @param state - state to store.
 */
export async function writeTrackerState(
  workspaceDir: string,
  session: string | undefined,
  state: TrackerState,
): Promise<void> {
  await writeJsonAtomically(statePathFor(workspaceDir, session), { ...state, schema: TRACKER_SCHEMA })
}

/**
 * Summaries are per chat, but the state file and config live per workspace.
 * The chat id is folded into the file name so one tavern can hold several
 * stories without mixing their ledgers.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @returns the state file path for that chat.
 */
function statePathFor(workspaceDir: string, session: string | undefined): string {
  if (session === undefined || session.length === 0) return trackerStatePath(workspaceDir)
  return join(trackerDirectory(workspaceDir), `state.${safeSegment(session)}.json`)
}

/** Keep a session id usable as one path segment. */
function safeSegment(session: string): string {
  return session.replace(/[^A-Za-z0-9_-]/g, '_')
}

/**
 * Persist one ledger atomically.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @param summary - ledger to store.
 * @returns the stored ledger.
 */
export async function writeTrackerSummary(
  workspaceDir: string,
  session: string | undefined,
  summary: TrackerSummary,
): Promise<TrackerSummary> {
  const stored: TrackerSummary & { schema: number } = {
    ...summary,
    schema: TRACKER_SCHEMA,
  }
  const directory = join(trackerSummariesDirectory(workspaceDir), safeSegment(session ?? 'workspace'))
  await writeJsonAtomically(join(directory, `${String(summary.turn).padStart(6, '0')}.json`), stored)
  return stored
}

/**
 * List one chat's ledgers, newest first.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @returns parsed ledgers; unreadable files are skipped.
 */
export async function listTrackerSummaries(
  workspaceDir: string,
  session: string | undefined,
): Promise<TrackerSummary[]> {
  const directory = join(trackerSummariesDirectory(workspaceDir), safeSegment(session ?? 'workspace'))
  let names: string[]
  try {
    names = (await readdir(directory)).filter(name => name.endsWith('.json'))
  } catch {
    return []
  }
  names.sort((left, right) => right.localeCompare(left))
  const summaries: TrackerSummary[] = []
  for (const name of names) {
    try {
      const parsed = parseTrackerSummary(JSON.parse(await readFile(join(directory, name), 'utf8')))
      if (parsed !== undefined) summaries.push(parsed)
    } catch {
      // A half-written ledger cannot be rendered; the older ones still can.
    }
  }
  return summaries
}

/**
 * Validate one stored ledger.
 * @param value - decoded JSON value.
 * @returns the ledger, or `undefined` when it cannot be rendered.
 */
export function parseTrackerSummary(value: unknown): TrackerSummary | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.turn !== 'number' || !Number.isSafeInteger(record.turn) || record.turn < 0) return undefined
  if (typeof record.at !== 'string') return undefined
  if (typeof record.world !== 'string') return undefined
  const characters: CharacterProgress[] = []
  for (const item of Array.isArray(record.characters) ? record.characters : []) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const entry = item as Record<string, unknown>
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    const progress = typeof entry.progress === 'string' ? entry.progress.trim() : ''
    if (name.length === 0) continue
    characters.push({
      name,
      progress,
      ...(typeof entry.id === 'string' ? { id: entry.id } : {}),
    })
  }
  return {
    schema: TRACKER_SCHEMA,
    turn: record.turn,
    at: record.at,
    world: record.world,
    characters,
    transcriptChars: typeof record.transcriptChars === 'number' ? record.transcriptChars : 0,
    ...(typeof record.model === 'string' ? { model: record.model } : {}),
    ...(typeof record.sinceTurn === 'number' ? { sinceTurn: record.sinceTurn } : {}),
  }
}

/**
 * Turns that already have a ledger, for the turn rail's marker.
 * @param summaries - ledgers newest first.
 * @returns tracked turns in ascending order.
 */
export function trackedTurns(summaries: readonly TrackerSummary[]): number[] {
  return summaries.map(summary => summary.turn).sort((left, right) => left - right)
}

/**
 * Whether one chat is due for an automatic run.
 *
 * The two triggers are independent and either may fire; `enabled` gates both.
 * A time trigger that has never run fires immediately, because "every N
 * minutes" on a chat that has never been tracked means "start tracking now".
 * @param config - workspace settings.
 * @param state - what has been tracked.
 * @param newestTurn - newest beat in the chat.
 * @param now - current epoch milliseconds.
 * @returns whether a run should start.
 */
export function trackerDue(
  config: TrackerConfig,
  state: TrackerState,
  newestTurn: number,
  now: number,
): boolean {
  if (!config.enabled) return false
  if (newestTurn <= state.lastTurn) return false
  if (config.everyTurns > 0 && newestTurn - state.lastTurn >= config.everyTurns) return true
  if (config.everyMinutes > 0) {
    if (state.lastAt === undefined) return true
    const last = Date.parse(state.lastAt)
    if (Number.isNaN(last)) return true
    return now - last >= config.everyMinutes * 60_000
  }
  return false
}

/** Write one JSON document atomically (temporary file then rename). */
async function writeJsonAtomically(target: string, value: unknown): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
