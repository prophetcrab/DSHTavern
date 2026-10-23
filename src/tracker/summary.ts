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
  /** World entry: how long the model should aim for. */
  worldChars: { min: 60, max: 4_000 },
  /** One character entry: how long the model should aim for. */
  characterChars: { min: 40, max: 2_000 },
  /** Player entry: how long the model should aim for. */
  userChars: { min: 40, max: 2_000 },
} as const

/** How far past a suggested length a section may run before it is cut. */
export const TRACKER_LENGTH_SLACK = 2

/**
 * Longest one section may reach before the host truncates it.
 *
 * The suggested length is what the prompt asks for; this ceiling is what the
 * host enforces after the fact, so a model that ignores the suggestion cannot
 * write an unbounded ledger. The slack lets a section that runs a sentence over
 * survive intact instead of being cut mid-clause.
 * @param suggested - the configured suggestion, in characters.
 * @returns the enforced ceiling, in characters.
 */
export function trackerSectionCeiling(suggested: number): number {
  return Math.round(suggested * TRACKER_LENGTH_SLACK)
}

/** Largest reply one run accepts, in characters. */
export const TRACKER_REPLY_MAX_CHARS = 12_000

/** How often the host reconsiders whether a chat is due, in milliseconds. */
export const TRACKER_POLL_MS = 60_000

/** One role's model selection; both halves are required together. */
export interface TrackerModelChoice {
  readonly provider: string
  readonly model: string
}

/** Which of the two schedules a workspace uses. */
export type TrackerTrigger = 'turns' | 'minutes'

/** How much text one category of the ledger may carry. */
export interface TrackerLengthBudget {
  /** Length the prompt asks for, in characters. */
  readonly suggested: number
}

/** Per-category length budgets for one ledger. */
export interface TrackerLengths {
  /** The world entry. */
  readonly world: TrackerLengthBudget
  /** One character entry; every character gets the same budget. */
  readonly character: TrackerLengthBudget
  /** The player entry. */
  readonly user: TrackerLengthBudget
}

/** Trigger settings for one tavern workspace. */
export interface TrackerConfig {
  readonly schema: number
  /** Whether automatic runs are enabled at all. */
  readonly enabled: boolean
  /**
   * Which schedule is active.
   *
   * The two are alternatives, not a race: a workspace picks the one that fits
   * how it is played. "Every N turns" suits a chat driven by play; "every N
   * minutes" suits one left running.
   */
  readonly trigger: TrackerTrigger
  /** Run after this many new beats, when `trigger` is `turns`. */
  readonly everyTurns: number
  /** Run after this many minutes, when `trigger` is `minutes`. */
  readonly everyMinutes: number
  /** Longest transcript forwarded; older lines are dropped from the front. */
  readonly maxTranscriptChars: number
  /** How much each category of the ledger may carry. */
  readonly lengths: TrackerLengths
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

/**
 * What the player has established, tracked like a cast member.
 *
 * The player has no card, so this entry is built purely from what they said and
 * did on stage: their stated identity, what they have committed to, and how the
 * cast now sees them.
 */
export interface UserProgress {
  /** What the player has established or changed so far. */
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
  /** The player's own established situation; absent on ledgers written before it existed. */
  readonly user?: UserProgress
  /** One entry per character that appeared or mattered. */
  readonly characters: readonly CharacterProgress[]
  /** Characters of transcript this run was given. */
  readonly transcriptChars: number
  /**
   * Newest turn covered by the previous ledger; absent on the first run.
   *
   * A run always reads the whole story, so this is not the range it summarised
   * — it records where the previous ledger stopped, which is what lets the
   * panel show how far the story has moved since.
   */
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
    trigger: 'turns',
    everyTurns: 10,
    everyMinutes: 30,
    maxTranscriptChars: 200_000,
    lengths: {
      // Long enough to carry a scene and its open questions without turning
      // into a retelling; a character entry is shorter because it only covers
      // that character's own situation.
      world: { suggested: 300 },
      character: { suggested: 180 },
      user: { suggested: 150 },
    },
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
  // Older files carried both schedules with `0` meaning "off". A stored
  // setting stays meaningful either way: a file with the minute trigger set
  // migrates to that trigger rather than silently switching to turn counting.
  const storedTrigger = record.trigger
  if (storedTrigger !== undefined && storedTrigger !== 'turns' && storedTrigger !== 'minutes') {
    throw new TrackerConfigInvalidError('触发方式只能是 turns 或 minutes')
  }
  // Older files used `0` to mean "this schedule is off". Now that the two
  // schedules are alternatives, `0` is not a value the UI can produce; a stored
  // one becomes the default interval instead of failing the whole file.
  const legacyEveryTurns = record.everyTurns === 0 ? defaults.everyTurns : record.everyTurns
  const legacyEveryMinutes = record.everyMinutes === 0 ? defaults.everyMinutes : record.everyMinutes
  const everyTurns = integerIn(legacyEveryTurns, '每多少轮追踪一次',
    TRACKER_LIMITS.everyTurns.min, TRACKER_LIMITS.everyTurns.max, defaults.everyTurns)
  const everyMinutes = integerIn(legacyEveryMinutes, '每多少分钟追踪一次',
    TRACKER_LIMITS.everyMinutes.min, TRACKER_LIMITS.everyMinutes.max, defaults.everyMinutes)
  const trigger: TrackerTrigger = storedTrigger === 'minutes' || storedTrigger === 'turns'
    ? storedTrigger
    // No `trigger` field: an older file. A positive minute interval means the
    // time schedule was in use; otherwise the turn schedule was.
    : typeof record.everyMinutes === 'number' && record.everyMinutes > 0
      ? 'minutes'
      : 'turns'
  const model = modelChoice(record.model)
  return {
    schema: TRACKER_SCHEMA,
    enabled: enabled === true,
    trigger,
    everyTurns,
    everyMinutes,
    maxTranscriptChars: integerIn(record.maxTranscriptChars, '对话上限字数',
      TRACKER_LIMITS.maxTranscriptChars.min, TRACKER_LIMITS.maxTranscriptChars.max,
      defaults.maxTranscriptChars),
    lengths: lengthsOf(record.lengths, defaults.lengths),
    ...(model === undefined ? {} : { model }),
  }
}

/**
 * Validate the per-category length budgets.
 *
 * A file written before budgets existed has no `lengths` field at all; it reads
 * as the defaults rather than failing, because a missing section is not a
 * malformed one.
 * @param value - candidate budgets.
 * @param defaults - budgets to fill absent categories from.
 * @returns complete budgets.
 * @throws TrackerConfigInvalidError when a present value is out of range.
 */
function lengthsOf(value: unknown, defaults: TrackerLengths): TrackerLengths {
  if (value === undefined || value === null) return defaults
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TrackerConfigInvalidError('摘要长度设置必须是对象')
  }
  const record = value as Record<string, unknown>
  const one = (raw: unknown, field: string, bounds: { readonly min: number; readonly max: number }, fallback: number): TrackerLengthBudget => {
    if (raw === undefined || raw === null) return { suggested: fallback }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TrackerConfigInvalidError(`${field} 必须是对象`)
    }
    const suggested = (raw as Record<string, unknown>).suggested
    return {
      suggested: integerIn(suggested, `${field}的建议字数`, bounds.min, bounds.max, fallback),
    }
  }
  return {
    world: one(record.world, '世界摘要', TRACKER_LIMITS.worldChars, defaults.world.suggested),
    character: one(record.character, '角色摘要', TRACKER_LIMITS.characterChars, defaults.character.suggested),
    user: one(record.user, '玩家摘要', TRACKER_LIMITS.userChars, defaults.user.suggested),
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
  const userEntry = typeof record.user === 'object' && record.user !== null && !Array.isArray(record.user)
    ? (record.user as Record<string, unknown>).progress
    : undefined
  const user = typeof userEntry === 'string' && userEntry.trim().length > 0
    ? { progress: userEntry.trim() }
    : undefined
  return {
    schema: TRACKER_SCHEMA,
    turn: record.turn,
    at: record.at,
    world: record.world,
    characters,
    ...(user === undefined ? {} : { user }),
    transcriptChars: typeof record.transcriptChars === 'number' ? record.transcriptChars : 0,
    ...(typeof record.model === 'string' ? { model: record.model } : {}),
    ...(typeof record.sinceTurn === 'number' ? { sinceTurn: record.sinceTurn } : {}),
  }
}

/**
 * Turns a ledger has read, for the turn rail's marker.
 *
 * A ledger is written from the whole story up to its own turn, so reaching turn
 * N means every turn before it was read too. Marking only the turns that happen
 * to own a ledger file would light up 3 and 7 while leaving 1, 2, 4, 5 and 6
 * dark, which reads as "these turns were skipped" — the opposite of what
 * happened.
 * @param summaries - ledgers newest first.
 * @returns every turn up to the newest ledger's turn, ascending; empty before
 *   the first run.
 */
export function trackedTurns(summaries: readonly TrackerSummary[]): number[] {
  let newest = 0
  for (const summary of summaries) newest = Math.max(newest, summary.turn)
  return Array.from({ length: newest }, (_, index) => index + 1)
}

/**
 * Whether one chat is due for an automatic run.
 *
 * The two schedules are alternatives, not a race: only the configured trigger
 * is consulted. A time trigger that has never run fires immediately, because
 * "every N minutes" on a chat that has never been tracked means "start now".
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
  if (config.trigger === 'turns') return newestTurn - state.lastTurn >= config.everyTurns
  if (state.lastAt === undefined) return true
  const last = Date.parse(state.lastAt)
  if (Number.isNaN(last)) return true
  return now - last >= config.everyMinutes * 60_000
}

/**
 * Turns covered by a ledger that a later regeneration replaced.
 *
 * A ledger describes the story as it stood when it was written. Regenerating a
 * beat it covers rewrote part of that story, so the ledger no longer matches
 * what is on stage. The comparison is by time, not just by turn number: a
 * replay of an already-covered beat produces a *new* turn, and a ledger written
 * after that regeneration describes the replacement and is perfectly current.
 * @param records - regeneration history for the chat.
 * @param ledgerTurn - newest turn the ledger covers.
 * @param ledgerAt - epoch milliseconds the ledger was written.
 * @returns superseded turns inside the ledger's range, ascending.
 */
export function staleTurnsAfterWrite(
  records: readonly { readonly turn: number; readonly at: string }[],
  ledgerTurn: number,
  ledgerAt: number,
): number[] {
  return records
    .filter((record) => {
      if (record.turn > ledgerTurn) return false
      const at = Date.parse(record.at)
      // An unparsable timestamp cannot prove the ledger came first, so the
      // ledger is reported as out of date rather than silently trusted.
      return Number.isNaN(at) || Number.isNaN(ledgerAt) || at > ledgerAt
    })
    .map(record => record.turn)
    .sort((left, right) => left - right)
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
