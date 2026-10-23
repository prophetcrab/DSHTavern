/**
 * DSH-Tavern host plugin: runs SillyTavern-style role-play on the DeepSeek Harness.
 *
 * A tavern is a workspace carrying `.dshtavern/tavern.json`; the marker is the
 * single source of truth for "this directory is a tavern", so the plugin scans
 * registered workspace directories on demand instead of extending the DSH
 * workspace record, which cannot carry plugin metadata.
 *
 * The plugin owns three things beyond the marker: it assembles the workspace's
 * system prompt, it replaces the agent loop's model call with a directed beat
 * (one director call, then one isolated call per speaking character), and it
 * serves the toolbox's `/tavern/*` routes.
 * @module dshtavern
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { basename, isAbsolute, join, parse } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { createUserMessage, isAgentLoopRequest, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Workspace, WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { HttpRequestError, allowLoopback, methodNotAllowed, optionalString, readJsonObject, sendJson } from './http.js'
import {
  CharacterCardInvalidError,
  CHARACTER_CARD_MAX_BYTES,
  createCharacterCard,
  deleteCharacterCard,
  exportCharacterCardText,
  listCharacterCards,
  listCharacterCardsSync,
  parseCharacterCardImport,
  readCharacterCard,
  saveCharacterCard,
  writeCharacterCard,
} from './character-card.js'
import type { CharacterCard, CharacterCardInput, CharacterCardListing } from './character-card.js'
import {
  buildCharacterMessage,
  buildCharacterSystem,
  buildDirectorContinuation,
  buildDirectorSystem,
  cardBrief,
  parseDirectorReply,
  isDirectorJsonReply,
  buildDirectorRepairSystem,
  renderBeatMarkdown,
  resolveSpeaker,
  mentionedSpeaker,
  PLAYER_INPUT_MAX,
} from './orchestrator.js'
import { fromCardEntries } from './worldbook.js'
import { greetingStageLine, openingNarrationStageLine, selectOpening } from './greeting.js'
import {
  buildOpeningSystem,
  parseOpeningReply,
  readOpeningScript,
  writeOpeningScript,
} from './opening.js'
import type { OpeningScript } from './opening.js'
import { buildPreview } from './preview.js'
import type { PromptPreview } from './preview.js'
import type { BeatRecord, BeatSegment, BeatTurn, CastMember, DirectorDecision } from './orchestrator.js'
import { appendStage, readStage, readWorld, storyDirectory, writeStage, writeWorld } from './stage.js'
import {
  OPENING_PROMPT,
  OPENING_SOURCE_KIND,
  REGENERATE_PROMPT,
  REGENERATE_SOURCE_KIND,
  REGENERATE_UNAVAILABLE,
  REGENERATION_QUEUE_WINDOW_MS,
  appendRegeneration,
  listBeats,
  readRegenerations,
  truncationPoint,
} from './regenerate.js'
import type { RegenerationRecord, StoredBeat } from './regenerate.js'
import { BEAT_RECORD_TYPE, buildBeatLog } from './beat-log.js'
import type { BeatLogInput } from './beat-log.js'
import { beatLogFromRecord } from './beat-log-host.js'
import type { BeatLogModels } from './beat-log-host.js'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import {
  AgentConfigInvalidError,
  defaultAgentConfig,
  normalizeAgentConfig,
  readAgentConfig,
  replyBudgetChars,
  replyCapTokens,
  writeAgentConfig,
} from './agent-config.js'
import type { AgentModelChoice, TavernAgentConfig } from './agent-config.js'
import type { TavernOpening } from './greeting.js'
import {
  WORLDBOOK_CONTENT_MAX,
  WORLDBOOK_ENTRIES_MAX,
  WorldbookInvalidError,
  exportWorldbookText,
  parseWorldbookImport,
  readWorldbook,
  writeWorldbook,
} from './worldbook.js'
import type { WorldbookEntry, WorldbookFile } from './worldbook.js'
import type { StageEntry, WorldState } from './stage.js'
import {
  PROMPT_LAYOUT_MAX_BYTES,
  PROMPT_LAYOUT_SCHEMA,
  PromptLayoutInvalidError,
  PromptLayoutVersionError,
  defaultPromptLayout,
  hasCharacterCards,
  promptBlockViews,
  readPromptLayout,
  readPromptLayoutSync,
  renderPromptText,
  writePromptLayout,
} from './prompt-layout.js'
import type { PromptBlockState, PromptBlockView, PromptScope } from './prompt-layout.js'

/** Directory owning every tavern-side file, relative to the workspace root. */
export const TAVERN_DIRECTORY = '.dshtavern'

/** Per-agent complete prompt section registered by the host assembly. */
export const TAVERN_PROMPT_SECTION = 'tavern:workspace-prompt'

/** Reply text shown when a beat produced neither narration nor speech. */
export const EMPTY_BEAT_NOTICE = '这一幕模型没有返回内容。可以再说一句，或检查提示词编排里的导演块是否被停用。'

/** Appended when any call in a beat hit its reply budget. */
export const TRUNCATED_NOTICE = '（本幕达到设定的回复长度上限，内容被截断。可在 Agent 编排里调大回复长度。）'

/**
 * Reply text shown when a non-player trigger woke a tavern session.
 *
 * Refusing the turn keeps the story untouched. The trigger's own text is never
 * forwarded: a scheduled reminder asking for a tool call reads as narration to
 * the director, which turns a housekeeping message into plot.
 */
export const EXTERNAL_TRIGGER_NOTICE = '这是酒馆会话，只会回应你本人说的话。定时任务或其他自动触发的消息不会推进剧情。'

/** Marker file name inside {@link TAVERN_DIRECTORY}. */
export const MARKER_FILE = 'tavern.json'

/** Marker schema version this build reads and writes. */
export const MARKER_SCHEMA = 1

/**
 * Request-body ceilings for the routes that write a bounded document.
 *
 * The stored ceilings are byte counts of the decoded document; a JSON body
 * adds escaping and envelope overhead, so each route accepts a multiple of its
 * document ceiling instead of the plugin-wide default.
 */
const PROMPT_BODY_MAX_BYTES = 4 * PROMPT_LAYOUT_MAX_BYTES
const CARD_BODY_MAX_BYTES = 4 * CHARACTER_CARD_MAX_BYTES
// Worst-case UTF-8 for one maximal worldbook (4 bytes per code point) plus room
// for the JSON envelope: a document the store accepts must be importable.
const WORLDBOOK_BODY_MAX_BYTES = WORLDBOOK_ENTRIES_MAX * WORLDBOOK_CONTENT_MAX * 4 + 8 * 1024 * 1024

/** Durable identity of one tavern, stored inside its workspace directory. */
export interface TavernMarker {
  /** Marker schema version. */
  readonly schema: number
  /** Discriminator; always `dshtavern`. */
  readonly kind: 'dshtavern'
  /** Stable tavern identity, generated at creation. */
  readonly tavernId: string
  /** ISO-8601 creation instant. */
  readonly createdAt: string
  /** Optional display title captured at creation. */
  readonly title?: string
  /** Running mode chosen before creation; absent on older markers means role-play. */
  readonly mode?: TavernMode
}

/** The two tavern run modes. Their prompt block catalogues are independent. */
export type TavernMode = 'rp' | 'novel'

/**
 * Resolve the mode of a marker, defaulting legacy markers to role-play.
 * @param marker - parsed marker.
 * @returns the effective mode.
 */
export function tavernModeOf(marker: TavernMarker): TavernMode {
  return marker.mode === 'novel' ? 'novel' : 'rp'
}

/** One registered workspace whose directory carries a tavern marker. */
export interface TavernWorkspaceView {
  /** DSH workspace id. */
  readonly workspaceId: string
  /** Canonical workspace directory. */
  readonly path: string
  /** Display title of the workspace. */
  readonly title: string
  /** Parsed marker. */
  readonly marker: TavernMarker
}

/** Minimal workspace facts this plugin needs; keeps the marker layer testable. */
export interface TavernWorkspaceRecord {
  readonly id: string
  readonly path: string
  readonly title: string
}

/** A stored marker exists but is structurally invalid. */
export class TavernMarkerInvalidError extends Error {
  constructor(readonly path: string) {
    super(`invalid tavern marker at '${path}'`)
    this.name = 'TavernMarkerInvalidError'
  }
}

/** A stored marker was written by a newer schema than this build understands. */
export class TavernMarkerVersionError extends Error {
  constructor(readonly path: string, readonly schema: number) {
    super(`tavern marker at '${path}' uses schema ${schema}, newer than supported schema ${MARKER_SCHEMA}`)
    this.name = 'TavernMarkerVersionError'
  }
}

/** A workspace id named for adoption or removal is not registered. */
export class TavernWorkspaceNotFoundError extends Error {
  constructor(readonly workspaceId: string) {
    super(`unknown workspace '${workspaceId}'`)
    this.name = 'TavernWorkspaceNotFoundError'
  }
}

/** @param directory - workspace directory. @returns its tavern-owned directory. */
export function tavernDirectory(directory: string): string {
  return join(directory, TAVERN_DIRECTORY)
}

/** @param directory - workspace directory. @returns the absolute marker path. */
export function markerPath(directory: string): string {
  return join(tavernDirectory(directory), MARKER_FILE)
}

/**
 * Parse and validate marker JSON.
 * @param text - file content.
 * @returns the marker, or `undefined` when the content is not a valid marker.
 */
export function parseMarker(text: string): TavernMarker | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.kind !== 'dshtavern') return undefined
  const { schema, tavernId, createdAt, title, mode } = record
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) return undefined
  if (typeof tavernId !== 'string' || tavernId.length === 0) return undefined
  if (typeof createdAt !== 'string' || createdAt.length === 0) return undefined
  if (title !== undefined && typeof title !== 'string') return undefined
  if (mode !== undefined && mode !== 'rp' && mode !== 'novel') return undefined
  return {
    schema,
    kind: 'dshtavern',
    tavernId,
    createdAt,
    ...(title === undefined ? {} : { title }),
    ...(mode === undefined ? {} : { mode }),
  }
}

/**
 * Create a fresh marker value.
 * @param title - optional display title.
 * @returns a marker with a new tavern identity.
 */
export function createMarker(title?: string, mode: TavernMode = 'rp'): TavernMarker {
  return {
    schema: MARKER_SCHEMA,
    kind: 'dshtavern',
    tavernId: randomUUID(),
    createdAt: new Date().toISOString(),
    mode,
    ...(title === undefined ? {} : { title }),
  }
}

/**
 * Read the marker of one directory.
 * @param directory - workspace directory.
 * @returns the marker, or `undefined` when the file is absent or invalid.
 */
export async function readMarker(directory: string): Promise<TavernMarker | undefined> {
  const text = await readMarkerText(directory)
  return text === undefined ? undefined : parseMarker(text)
}

/**
 * Write a marker atomically (temporary file then rename).
 * @param directory - workspace directory.
 * @param marker - marker to persist.
 * @returns resolution after the rename.
 */
export async function writeMarker(directory: string, marker: TavernMarker): Promise<void> {
  const targetDirectory = tavernDirectory(directory)
  await mkdir(targetDirectory, { recursive: true })
  const target = join(targetDirectory, MARKER_FILE)
  const temporary = `${target}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

/** Options for {@link ensureMarker}. */
export interface EnsureMarkerOptions {
  /** Replace a structurally invalid marker instead of throwing. */
  readonly force?: boolean
  /** Mode for a newly written marker (defaults to role-play). */
  readonly mode?: TavernMode
}

/**
 * Ensure a directory carries a valid marker, creating one when absent.
 * @param directory - workspace directory.
 * @param title - optional display title for a newly created marker.
 * @param options - invalid-marker handling.
 * @returns the existing or created marker.
 * @throws TavernMarkerInvalidError when a stored marker is invalid and `force` is false.
 * @throws TavernMarkerVersionError when a stored marker is newer than this build.
 */
export async function ensureMarker(
  directory: string,
  title?: string,
  options: EnsureMarkerOptions = {},
): Promise<TavernMarker> {
  const text = await readMarkerText(directory)
  if (text !== undefined) {
    const existing = parseMarker(text)
    if (existing !== undefined) {
      if (existing.schema > MARKER_SCHEMA) throw new TavernMarkerVersionError(markerPath(directory), existing.schema)
      return existing
    }
    if (options.force !== true) throw new TavernMarkerInvalidError(markerPath(directory))
  }
  const marker = createMarker(title, options.mode)
  await writeMarker(directory, marker)
  return marker
}

/**
 * Remove the marker file, keeping every other file untouched.
 * @param directory - workspace directory.
 * @returns whether a marker file was removed.
 */
export async function removeMarker(directory: string): Promise<boolean> {
  try {
    await unlink(markerPath(directory))
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

/** A create/adopt request named a directory or workspace this build cannot use. */
export class TavernInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TavernInputError'
  }
}

/** One registered workspace with its tavern status resolved. */
export interface TavernWorkspaceSummary {
  /** DSH workspace id. */
  readonly id: string
  /** Canonical workspace directory. */
  readonly path: string
  /** Display title of the workspace. */
  readonly title: string
  /** Whether the workspace directory carries a valid tavern marker. */
  readonly tavern: boolean
}

/** Everything the tavern panel needs for one render. */
export interface TavernOverview {
  /** Root directory new taverns default to. */
  readonly defaultRoot: string
  /** Registered tavern workspaces in registry order. */
  readonly taverns: readonly TavernWorkspaceView[]
  /** Every registered workspace, in registry order. */
  readonly workspaces: readonly TavernWorkspaceSummary[]
}

/** One workspace's prompt assembly order as served to the panel. */
export interface PromptLayoutSnapshot {
  /** DSH workspace id. */
  readonly workspaceId: string
  /** Which of the two prompts this layout orders. */
  readonly scope: PromptScope
  /** Display title of the workspace. */
  readonly workspaceTitle: string
  /** Workspace directory. */
  readonly workspacePath: string
  /** System-prompt blocks in assembly order. */
  readonly blocks: readonly PromptBlockView[]
  /** Whether the workspace has an imported character card. */
  readonly hasCharacterCard: boolean
  /** ISO-8601 of the last write, when the layout was saved. */
  readonly savedAt?: string
}

/** Input of one tavern creation. */
export interface CreateTavernInput {
  /** Display title; also names the default directory. */
  readonly title?: string
  /** Explicit absolute directory; defaults below {@link defaultTavernRoot}. */
  readonly path?: string
  /** Mode chosen before creation; defaults to role-play. */
  readonly mode?: TavernMode
}

/** Creates or reuses the DSH registration of one prepared directory. */
export interface TavernWorkspaceRegistrar {
  /** @param directory - existing directory. @param title - new-workspace title. @returns the registered workspace. */
  create(directory: string, title?: string): Promise<TavernWorkspaceRecord>
}

/**
 * Root directory for taverns created without an explicit path.
 * @returns `<DSH_HOME>/taverns`.
 */
export function defaultTavernRoot(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'taverns')
}

/**
 * Directory-safe name for one tavern title.
 * @param title - display title.
 * @returns a non-empty single path segment.
 */
export function tavernSlug(title: string): string {
  const slug = title
    .normalize('NFKC')
    .replace(/\s+/g, '-')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug.length === 0 ? 'tavern' : slug
}

/**
 * Resolve the directory one create request writes into.
 * @param input - create request.
 * @param root - default root for title-only requests.
 * @returns an absolute directory path.
 * @throws TavernInputError when neither a usable title nor an absolute path is given.
 */
export function resolveTavernDirectory(input: CreateTavernInput, root: string): string {
  const explicit = input.path?.trim()
  if (explicit !== undefined && explicit.length > 0) {
    if (!isAbsolute(explicit)) {
    throw new TavernInputError(`酒馆目录必须是绝对路径：${explicit}`)
    }
    if (parse(explicit).root === explicit) {
    throw new TavernInputError(`不能使用磁盘根目录作为酒馆目录：${explicit}`)
    }
    return explicit
  }
  const title = input.title?.trim()
  if (title === undefined || title.length === 0) {
    throw new TavernInputError('需要一个酒馆名称，或者一个绝对目录路径')
  }
  return join(root, tavernSlug(title))
}

/**
 * Prepare a directory as a tavern and register it as a DSH workspace.
 *
 * Order follows D004: create the directory, write the marker atomically, then
 * register the workspace. A failed registration leaves the marker in place, so
 * retrying the same request recovers instead of losing the tavern identity.
 * @param registrar - DSH workspace registrar adapter.
 * @param input - wanted title and optional directory.
 * @param root - default root for title-only requests.
 * @returns the tavern view for the created (or reused) workspace.
 */
export async function createTavernWorkspace(
  registrar: TavernWorkspaceRegistrar,
  input: CreateTavernInput,
  root: string = defaultTavernRoot(),
): Promise<TavernWorkspaceView> {
  const directory = resolveTavernDirectory(input, root)
  const title = input.title?.trim()
  const displayTitle = title === undefined || title.length === 0 ? basename(directory) : title
  try {
    await mkdir(directory, { recursive: true })
  } catch (error) {
    throw new TavernInputError(`无法创建酒馆目录 '${directory}'：${errorText(error)}`)
  }
  const marker = await ensureMarker(directory, displayTitle, {
    mode: input.mode === 'novel' ? 'novel' : 'rp',
  })
  const workspace = await registrar.create(directory, displayTitle)
  return toView(workspace, marker)
}

/**
 * Scan every registered workspace for tavern markers.
 * @param source - registered workspaces.
 * @returns tavern views and every workspace's tavern flag, in source order.
 */
export async function overviewTaverns(source: TavernWorkspaceSource): Promise<{
  readonly taverns: readonly TavernWorkspaceView[]
  readonly workspaces: readonly TavernWorkspaceSummary[]
}> {
  const taverns: TavernWorkspaceView[] = []
  const workspaces: TavernWorkspaceSummary[] = []
  for (const workspace of source.list()) {
    let marker: TavernMarker | undefined
    try {
      marker = await readMarker(workspace.path)
    } catch {
      // An unreadable directory is "marker unknown", not a tavern.
      marker = undefined
    }
    workspaces.push({ ...workspace, tavern: marker !== undefined })
    if (marker !== undefined) taverns.push(toView(workspace, marker))
  }
  return { taverns, workspaces }
}

/** Workspace facts the marker registry reads; the Cordis service adapts DSH to this. */
export interface TavernWorkspaceSource {
  /** @returns every registered workspace. */
  list(): readonly TavernWorkspaceRecord[]
  /** @param id - workspace id. @returns the registered workspace, if any. */
  get(id: string): TavernWorkspaceRecord | undefined
}

/** Observability hooks for the marker registry. */
export interface TavernMarkerRegistryOptions {
  /** Report a workspace whose marker could not be read (I/O or permission failure). */
  readonly onScanError?: (error: unknown, workspace: TavernWorkspaceRecord) => void
}

/**
 * Marker operations over a workspace source. Framework-free so it is unit
 * testable without a Cordis context.
 */
export class TavernMarkerRegistry {
  constructor(
    private readonly source: TavernWorkspaceSource,
    private readonly options: TavernMarkerRegistryOptions = {},
  ) {}

  /**
   * Scan registered workspaces for tavern markers.
   * @returns tavern workspaces in registry order.
   */
  async list(): Promise<readonly TavernWorkspaceView[]> {
    const views: TavernWorkspaceView[] = []
    for (const workspace of this.source.list()) {
      try {
        const marker = await readMarker(workspace.path)
        if (marker !== undefined) views.push(toView(workspace, marker))
      } catch (error) {
        this.options.onScanError?.(error, workspace)
      }
    }
    return views
  }

  /**
   * @param directory - candidate directory.
   * @returns whether the directory carries a marker.
   */
  async isTavernDirectory(directory: string): Promise<boolean> {
    return (await readMarker(directory)) !== undefined
  }

  /**
   * @param cwd - session working directory.
   * @returns whether a session in that directory is a tavern session.
   */
  async isTavernSessionCwd(cwd: string | undefined): Promise<boolean> {
    if (cwd === undefined || cwd.length === 0 || !isAbsolute(cwd)) return false
    return (await readMarker(cwd)) !== undefined
  }

  /**
   * Turn one registered workspace into a tavern workspace.
   * @param workspaceId - workspace id.
   * @param mode - mode chosen before adoption; ignored when a marker already exists.
   * @returns the tavern workspace view.
   * @throws TavernWorkspaceNotFoundError when the id is not registered.
   */
  async adopt(workspaceId: string, mode: TavernMode = 'rp'): Promise<TavernWorkspaceView> {
    const workspace = this.source.get(workspaceId)
    if (workspace === undefined) throw new TavernWorkspaceNotFoundError(workspaceId)
    const marker = await ensureMarker(workspace.path, workspace.title, { mode })
    return toView(workspace, marker)
  }

  /**
   * Remove one workspace's tavern marker.
   * @param workspaceId - workspace id.
   * @returns whether a marker was removed.
   * @throws TavernWorkspaceNotFoundError when the id is not registered.
   */
  async untag(workspaceId: string): Promise<boolean> {
    const workspace = this.source.get(workspaceId)
    if (workspace === undefined) throw new TavernWorkspaceNotFoundError(workspaceId)
    return removeMarker(workspace.path)
  }
}

/**
 * Host service exposed as `ctx.tavernWorkspaces`.
 *
 * DSH emits no workspace create/delete events, so callers reconcile on demand:
 * startup, tavern creation/adoption, session creation, and client refresh.
 */
export class TavernWorkspaceService extends Service {
  static inject = ['workspaceRegistry', 'llm']
  private readonly source: TavernWorkspaceSource
  private readonly markers: TavernMarkerRegistry
  /** Agents already asked to switch presets, so a failure does not loop. */
  private readonly presetAttempts = new WeakSet<Agent>()
  /** Tavern sessions by id, so the request cleaner can resolve their workspace. */
  private readonly tavernSessionCwd = new Map<string, string>()
  /**
   * In-flight opening generations, keyed by story directory.
   *
   * The pre-chat card asks for the script and the first beat also needs it; a
   * player who types while the card is still spinning must not trigger a second
   * model call, and must still get the script staged rather than the fallback.
   */
  private readonly openingGenerations = new Map<string, Promise<OpeningScript>>()
  /**
   * Sessions with a regeneration queued but not yet run, and when it was
   * queued. A second request inside the window is a double click, not two
   * regenerations; the window also expires an entry whose turn never ran.
   */
  private readonly pendingRegenerations = new Map<string, number>()

  /**
   * @param ctx - Cordis context carrying `workspaceRegistry`.
   */
  constructor(ctx: Context) {
    super(ctx, 'tavernWorkspaces')
    this.source = {
      list: () => ctx.workspaceRegistry.list().map(toRecord),
      get: (id) => {
        const workspace = ctx.workspaceRegistry.get(id as WorkspaceId)
        return workspace === undefined ? undefined : toRecord(workspace)
      },
    }
    this.markers = new TavernMarkerRegistry(this.source, {
      onScanError: (error, workspace) => {
        ctx.logger.warn(`[dshtavern] cannot read tavern marker for workspace '${workspace.path}': ${String(error)}`)
      },
    })
    this.registerHttp()
    this.bindTavernPreset()
    this.hideTavernPresetFromRoster()
    this.installRequestCleaner()
    this.installRequiredContextFilter()
  }

  /** @returns every tavern workspace. */
  list(): Promise<readonly TavernWorkspaceView[]> {
    return this.markers.list()
  }

  /** @param directory - candidate directory. @returns whether it is a tavern directory. */
  isTavernDirectory(directory: string): Promise<boolean> {
    return this.markers.isTavernDirectory(directory)
  }

  /** @param cwd - session working directory. @returns whether the session is a tavern session. */
  isTavernSessionCwd(cwd: string | undefined): Promise<boolean> {
    return this.markers.isTavernSessionCwd(cwd)
  }

  /**
   * Snapshot every registered workspace with its tavern status.
   * @returns the tavern panel's read model.
   */
  async overview(): Promise<TavernOverview> {
    const { taverns, workspaces } = await overviewTaverns(this.source)
    return { defaultRoot: defaultTavernRoot(), taverns, workspaces }
  }

  /**
   * Create (or recover) one tavern workspace: directory, marker, registration.
   * @param input - wanted title and optional directory.
   * @returns the created or reused tavern workspace.
   */
  create(input: CreateTavernInput): Promise<TavernWorkspaceView> {
    const registrar: TavernWorkspaceRegistrar = {
      create: async (directory, title) => toRecord(await this.ctx.workspaceRegistry.create(directory, title)),
    }
    return createTavernWorkspace(registrar, input)
  }

  /** @param workspaceId - workspace id. @param mode - mode chosen before adoption. @returns the adopted tavern workspace. */
  adopt(workspaceId: string, mode: TavernMode = 'rp'): Promise<TavernWorkspaceView> {
    return this.markers.adopt(workspaceId, mode)
  }

  /** @param workspaceId - workspace id. @returns whether a marker was removed. */
  untag(workspaceId: string): Promise<boolean> {
    return this.markers.untag(workspaceId)
  }

  /**
   * Read one tavern workspace's system-prompt assembly order.
   * @param workspaceId - registered tavern workspace id.
   * @param scope - which prompt to read; the character prompt by default.
   * @returns the persisted layout, or the catalogue default.
   */
  async promptLayout(workspaceId: string, scope: PromptScope = 'character'): Promise<PromptLayoutSnapshot> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const layout = await readPromptLayout(workspace.path, scope)
    return promptSnapshot(workspace, layout.blocks, layout.updatedAt, scope)
  }

  /**
   * Persist one tavern workspace's system-prompt assembly order.
   * @param workspaceId - registered tavern workspace id.
   * @param input - a full block ordering, or `reset` for the catalogue default.
   * @param scope - which prompt to write; the character prompt by default.
   * @returns the stored layout.
   */
  async savePromptLayout(
    workspaceId: string,
    input: { blocks?: unknown; reset?: boolean },
    scope: PromptScope = 'character',
  ): Promise<PromptLayoutSnapshot> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const blocks = input.reset === true ? defaultPromptLayout(scope).blocks : input.blocks
    const layout = await writePromptLayout(workspace.path, blocks, scope)
    return promptSnapshot(workspace, layout.blocks, layout.updatedAt, scope)
  }

  /**
   * Assemble the prompt one scope would produce, without calling a model.
   * @param workspaceId - registered tavern workspace id.
   * @param options - scope, optional card, the sample line to scan, and the
   *   session whose stage/world the preview should reflect.
   * @returns the assembled system prompt and the lore it activated.
   */
  async previewPrompt(
    workspaceId: string,
    options: { scope?: PromptScope; cardId?: string; sample?: string; sessionId?: string } = {},
  ): Promise<PromptPreview> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const scope: PromptScope = options.scope === 'director' ? 'director' : 'character'
    const [layout, cards, book, world, config] = await Promise.all([
      readPromptLayout(workspace.path, scope),
      listCharacterCards(workspace.path),
      readWorldbook(workspace.path),
      scope === 'director' ? readWorld(workspace.path, options.sessionId) : Promise.resolve(undefined),
      readAgentConfig(workspace.path),
    ])
    return buildPreview({
      scope,
      layout,
      cards: cards.cards,
      ...(options.cardId === undefined ? {} : { cardId: options.cardId }),
      worldbook: book.entries,
      ...(options.sample === undefined ? {} : { sample: options.sample }),
      ...(world === undefined ? {} : { world }),
      limits: config,
    })
  }

  /** Resolve one registered workspace and require its tavern marker. */
  private async requireTavernWorkspace(workspaceId: string): Promise<TavernWorkspaceRecord> {
    const workspace = this.source.get(workspaceId)
    if (workspace === undefined) throw new TavernWorkspaceNotFoundError(workspaceId)
    if (!(await this.markers.isTavernDirectory(workspace.path))) {
      throw new TavernInputError('该工作区不是酒馆')
    }
    return workspace
  }

  /**
   * Read one tavern workspace's worldbook.
   * @param workspaceId - registered tavern workspace id.
   * @returns the stored book.
   */
  async worldbook(workspaceId: string): Promise<WorldbookFile> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return readWorldbook(workspace.path)
  }

  /**
   * Replace one tavern workspace's worldbook.
   * @param workspaceId - registered tavern workspace id.
   * @param entries - complete entry list.
   * @returns the stored book.
   */
  async saveWorldbook(workspaceId: string, entries: unknown): Promise<WorldbookFile> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return writeWorldbook(workspace.path, entries)
  }

  /** List every character card stored in one tavern workspace. */
  async characterCards(workspaceId: string): Promise<CharacterCardListing> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return listCharacterCards(workspace.path)
  }

  /** Create one character card in a tavern workspace. */
  async createCharacterCard(workspaceId: string, input: CharacterCardInput): Promise<CharacterCard> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return createCharacterCard(workspace.path, input)
  }

  /** Save one existing character card. */
  async saveCharacterCard(workspaceId: string, id: string, input: CharacterCardInput): Promise<CharacterCard> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return saveCharacterCard(workspace.path, id, input)
  }

  /** Delete one character card. */
  async deleteCharacterCard(workspaceId: string, id: string): Promise<boolean> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return deleteCharacterCard(workspace.path, id)
  }

  /**
   * Render one stored card as a downloadable `.charc` document.
   * @param workspaceId - registered tavern workspace id.
   * @param id - card id.
   * @returns the suggested file name and the document text.
   * @throws CharacterCardInvalidError when the card is absent.
   */
  async exportCharacterCard(workspaceId: string, id: string): Promise<{ file: string; text: string }> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const card = await readCharacterCard(workspace.path, id)
    if (card === undefined) throw new CharacterCardInvalidError('角色卡不存在')
    return { file: `${safeFileName(card.name)}.charc`, text: exportCharacterCardText(card) }
  }

  /**
   * Import one `.charc` document into a workspace as a new card.
   * @param workspaceId - registered tavern workspace id.
   * @param text - uploaded document.
   * @returns the stored card.
   */
  async importCharacterCard(workspaceId: string, text: string): Promise<CharacterCard> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const card = parseCharacterCardImport(text, '<import>')
    await writeCharacterCard(workspace.path, card)
    return card
  }

  /**
   * Render one workspace's worldbook as a downloadable `.world` document.
   * @param workspaceId - registered tavern workspace id.
   * @returns the suggested file name and the document text.
   */
  async exportWorldbook(workspaceId: string): Promise<{ file: string; text: string }> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const book = await readWorldbook(workspace.path)
    return {
      file: `${safeFileName(workspace.title)}.world`,
      text: exportWorldbookText(book, workspace.title),
    }
  }

  /**
   * Replace one workspace's worldbook from a `.world` document.
   * @param workspaceId - registered tavern workspace id.
   * @param text - uploaded document.
   * @returns the stored book.
   */
  async importWorldbook(workspaceId: string, text: string): Promise<WorldbookFile> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const entries = parseWorldbookImport(text, '<import>')
    return writeWorldbook(workspace.path, entries)
  }

  /**
   * Assemble a directory's workspace-level system prompt text (D005).
   *
   * The session-side preset row calls this with the session cwd: it resolves
   * the containing tavern workspace and renders that workspace's enabled
   * prompt blocks. Nothing global or cross-workspace participates.
   * @param directory - session working directory.
   * @returns the assembled text, or `undefined` when the directory is not inside a tavern workspace.
   */
  async assemblePromptText(directory: string | undefined): Promise<string | undefined> {
    return assembleWorkspacePromptSync(directory)
  }

  /**
   * Register the JSON routes backing the tavern panel.
   *
   * `webServer` is optional at the Host half so the marker service still runs
   * in profiles without the Web layer; the routes exist only where the panel
   * can run.
   */
  /**
   * Auto-bind sessions created inside a tavern workspace to the `tavern` preset.
   *
   * The UI preset picker is only a preference; a session keeps whatever preset
   * its header named when the agent was created. This listener closes that gap
   * (D005): every agent whose cwd belongs to a tavern workspace is reassigned
   * to `tavern` unless it already uses it.
   */
  /**
   * Keep the internal tavern presets out of the manual preset roster.
   *
   * They are bound automatically to sessions created inside a tavern workspace;
   * offering them in the new-session picker (or as a default) would let users
   * select them in non-tavern workspaces, where they must never run. The filter
   * only wraps the roster read, so `agentPresets.select()` for auto-binding is
   * unaffected.
   *
   * The registry exposes no roster-filter extension point, so this wraps the
   * prototype method and restores it when the plugin unloads. Without the
   * restore, a reloaded plugin would stack a second wrapper and the module-level
   * marker that used to guard this kept a disposed instance patched forever.
   */
  private hideTavernPresetFromRoster(): void {
    this.ctx.inject(['agentPresets'], (scoped) => {
      // The registry's own type is not part of this package's dependencies; the
      // only member used is the roster read.
      const presets = (scoped as unknown as {
        agentPresets?: { remoteExportList?: () => Promise<{ presets: Array<{ id?: string }> }> }
      }).agentPresets
      if (presets?.remoteExportList === undefined) return
      // Only the two live presets exist; the legacy `tavern` row was removed
      // because no session ever selected it and nothing binds it.
      const hidden = new Set(['tavern-rp', 'tavern-novel'])
      scoped.effect(() => {
        const base = presets.remoteExportList!.bind(presets)
        presets.remoteExportList = async () => {
          const roster = await base()
          return { ...roster, presets: roster.presets.filter(row => row.id === undefined || !hidden.has(row.id)) }
        }
        return () => { delete (presets as { remoteExportList?: unknown }).remoteExportList }
      }, 'dshtavern: preset roster filter')
    })
  }

  private bindTavernPreset(): void {
    this.ctx.on('agent/created', ({ agent }) => {
      const cwd = agent.session.header.cwd
      if (cwd !== undefined && isTavernCwdSync(cwd)) {
        this.tavernSessionCwd.set(String(agent.session.id), cwd)
      }
      // Register synchronously so the very first assembly already sees the
      // workspace prompt; preset remounting can settle on a later tick.
      this.setupTavernAgent(agent)
      setTimeout(() => {
        this.ensureTavernPreset(agent).catch((error: unknown) => {
          this.ctx.logger.warn(`[dshtavern] preset binding failed: ${String(error)}`)
        })
      }, 0)
    })
    // The caches below are keyed by session id. Without this listener a long
    // process keeps one entry per session it ever saw, and a session id reused
    // across a reload would inherit stale state.
    this.ctx.on('agent/disposed', ({ agent }) => {
      const id = String(agent.session.id)
      this.tavernSessionCwd.delete(id)
      this.pendingRegenerations.delete(id)
    })
  }

  /**
   * Record the final tavern request for inspection (observer only).
   *
   * GenerateOptions is deeply frozen by the agent loop, so request cleanup
   * happens at `system-prompt/assemble` (tools + contexts) and at
   * `agent/pre-step` (injected reminder messages) on the agent context. This
   * `llm/stream` listener only writes the request the provider is about to see.
   */
  private installRequestCleaner(): void {
    // Assembly cleanup is registered at the root so it also covers agents that
    // existed before this plugin revision (scope-filtered dispatch resolves the
    // agent from AssembleContext, and only tavern assemblies are touched).
    this.ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      const cwd = context.agent?.session.header.cwd
      if (cwd === undefined || !isTavernCwdSync(cwd)) return next()
      const assembly = await next()
      return {
        ...assembly,
        tools: [],
        contexts: assembly.contexts.filter(entry => entry.name === 'working-directory:current'),
      }
    })
    this.ctx.on('llm/stream', (options, next) => {
      if (options.purpose !== undefined) return next()
      // Orchestration replaces the loop's own model call. Auxiliary calls the
      // orchestrator makes for the director and each character are hand-built
      // and carry no loop marker, so they pass straight through instead of
      // re-entering this listener.
      if (!isAgentLoopRequest(options)) return next()
      const sessionId = options.sessionId === undefined ? undefined : String(options.sessionId)
      const cwd = sessionId === undefined ? undefined : this.tavernSessionCwdFor(sessionId)
      if (cwd === undefined) return next()
      this.recordFinalRequest(cwd, options)
      // A tavern turn is orchestrated here instead of reaching the adapter: the
      // director decides the beat, then each speaking character answers from its
      // own card in an isolated call.
      return this.orchestrateBeat(cwd, options)
    })
  }

  /**
   * Run one role-play beat: director decides, then each speaking character
   * answers from its own card in an isolated model call.
   *
   * The returned stream stands in for the session's own model call, so the
   * agent loop records one assistant reply while the stage receives the
   * structured narration and speech.
   * @param cwd - tavern workspace directory.
   * @param options - the intercepted loop request, used for provider and model.
   * @returns the reply stream consumed by the agent loop.
   */
  private async *orchestrateBeat(cwd: string, options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const marker = await readMarker(cwd)
    if (marker === undefined || tavernModeOf(marker) !== 'rp') {
      yield* emptyReply()
      return
    }
    // Anything that woke this session on its own is not the player speaking.
    // Refusing before the first model call keeps the stage and world untouched
    // and costs nothing; the alternative is a cron reminder's prompt text
    // becoming the beat's input.
    const external = externalTriggerKind(options)
    if (external !== undefined) {
      this.ctx.logger.info(`[dshtavern] ignoring '${external}' trigger in tavern session`)
      yield* textReply(options, EXTERNAL_TRIGGER_NOTICE)
      return
    }
    // Stage and world belong to this chat: another chat in the same tavern is a
    // different story and must start from an empty stage.
    const story = options.sessionId === undefined ? undefined : String(options.sessionId)
    const cards = listCharacterCardsSync(cwd)
    if (cards.length === 0) {
      const message = '这个酒馆还没有角色卡。先在工具箱的「角色卡」里创建一张，再开始对话。'
      yield* textReply(options, message)
      return
    }
    const cast = cards.map(card => ({ id: card.id, name: card.name, brief: cardBrief(card) }))
    const config = await readAgentConfig(cwd)
    // A turn can only start from a message, so both the opening and the
    // regenerate action announce themselves as a real inbox message with their
    // own source kind. Neither is player text.
    const openingRequest = isOpeningRequest(options)
    const replaying = !openingRequest && isRegenerationRequest(options)
    const replay = replaying ? await this.rewindForRegeneration(cwd, story) : undefined
    if (replaying && story !== undefined) {
      // The queued request has reached its turn; a later request may start now.
      this.pendingRegenerations.delete(story)
    }
    if (replaying && replay === undefined) {
      yield* textReply(options, REGENERATE_UNAVAILABLE)
      return
    }
    const world = replay?.world ?? await readWorld(cwd, story)
    const stage = replay?.stage ?? await readStage(cwd, story)
    // The stage length before this beat stages anything. Regeneration rewinds
    // exactly here, so a discarded draft never reaches the next prompt.
    const stageCountBefore = stage.length
    const playerInput = replay === undefined
      ? lastUserText(options, config.playerInputMax)
      : replay.beat.record.playerInput.slice(0, config.playerInputMax)
    const layout = await readPromptLayout(cwd)
    const directorLayout = await readPromptLayout(cwd, 'director')
    const workspaceBook = await readWorldbook(cwd)
    // A player naming a character outranks the director's pick; the director is
    // a fallback that keeps the scene moving, not the final word on who answers.
    const addressed = config.honorPlayerMention ? mentionedSpeaker(playerInput, cast) : undefined

    // An opening turn shows the generated script and stops; the director has
    // nothing to decide until the player acts. It is a turn of its own so the
    // scene is already in the transcript when the player's first message
    // arrives, instead of being prepended below that line.
    if (openingRequest) {
      // A story that already staged anything has had its opening; a late
      // trigger (a second card mount, or a queued request that raced the first
      // player prompt) must not append a second beginning.
      if (stage.length > 0) {
        yield* emptyReply()
        return
      }
      const opening = await this.openingBeatSegments(cwd, story, cards)
      if (opening.staged.length > 0) await appendStage(cwd, opening.staged, story)
      // The opening writer is a model call like any other; log it so the turn's
      // prompt is inspectable beside the beats that follow.
      const openingSystem = opening.script?.system
      if (openingSystem !== undefined) {
        const script = opening.script as OpeningScript
        this.appendBeatLog(story, {
          at: script.generatedAt ?? new Date().toISOString(),
          playerInput: '',
          calls: [{
            role: 'opening',
            model: script.generatedBy === undefined
              ? '未知'
              : `${script.generatedBy.provider}/${script.generatedBy.model}`,
            system: openingSystem,
            message: script.message ?? '写开场。',
            reply: script.segments
              .map(segment => segment.kind === 'narration'
                ? `[旁白] ${segment.text}`
                : `[${segment.speakerName ?? '角色'}] ${segment.text}`)
              .join('\n'),
          }],
        })
      }
      const text = opening.segments.length > 0
        ? renderBeatMarkdown(opening.segments)
        : EMPTY_BEAT_NOTICE
      yield* textReply(options, text)
      return
    }

    // Fallback for a story whose opening turn never ran (the player typed
    // before the script was ready, or the story predates the opening turn):
    // the reply still starts with the opening, because dropping it entirely
    // would lose the scene the cards describe.
    const script = stage.length === 0 && story !== undefined
      ? await this.ensureOpeningScriptForDirectory(cwd, story)
      : undefined
    const staticOpening = stage.length === 0 && (script === undefined || script.segments.length === 0)
      ? selectOpening(cards)
      : undefined

    const segments: BeatSegment[] = []
    const spoken: CastMember[] = []
    const turns: BeatTurn[] = []
    const staged: Omit<StageEntry, 'seq' | 'at'>[] = []
    const openingLines: Omit<StageEntry, 'seq' | 'at'>[] = []
    if (script !== undefined) {
      for (const segment of script.segments) {
        if (segment.kind === 'narration') {
          openingLines.push({ kind: 'narration', text: segment.text, scope: 'observable' })
          segments.push({ kind: 'narration', text: segment.text })
          continue
        }
        openingLines.push({
          kind: 'speech',
          speaker: segment.cardId ?? '',
          speakerName: segment.speakerName ?? '',
          text: segment.text,
          scope: 'observable',
        })
        segments.push({ kind: 'speech', name: segment.speakerName ?? '', text: segment.text })
      }
    } else if (staticOpening !== undefined) {
      if (staticOpening.narration !== undefined) {
        openingLines.push(openingNarrationStageLine(staticOpening.narration))
        segments.push({ kind: 'narration', text: staticOpening.narration.text })
      }
      if (staticOpening.greeting !== undefined) {
        openingLines.push(greetingStageLine(staticOpening.greeting))
        segments.push({ kind: 'speech', name: staticOpening.greeting.name, text: staticOpening.greeting.text })
      }
    }
    for (const line of openingLines) {
      stage.push({ seq: nextSeq(stage), at: new Date().toISOString(), ...line })
      staged.push(line)
    }
    // Sum of every model call this beat made. The orchestrator stands in for the
    // loop's own call, so it owns forwarding usage back to the loop.
    const beatUsage = emptyUsage()
    // Whether any call hit its reply budget, so the turn can say so instead of
    // presenting a stub as a finished reply.
    let truncatedBeat = false
    // The beat runs until the director stops naming a speaker, a character has
    // nothing to add, or the cap is reached. Each turn is a fresh director call
    // over the stage as extended by the previous one.
    let inner = ''
    for (let turn = 0; turn < config.maxSpeechesPerBeat; turn += 1) {
      const directorSystem = turn === 0
        ? buildDirectorSystem({
          world, cast, stage, layout: directorLayout,
          worldbook: workspaceBook.entries, playerInput, limits: config,
        })
        : buildDirectorContinuation({
          world, cast, stage, layout: directorLayout,
          worldbook: workspaceBook.entries, playerInput, limits: config,
        }, spoken)
      const directorResult = await this.complete(options, directorSystem, [
        { role: 'user', text: turn === 0
          ? playerInput.length === 0 ? '（玩家保持了沉默）' : playerInput
          : '（继续这一幕。）' },
      ], config.directorModel, replyBudgetChars(config, 'director'), config.reasoningReserveTokens)
      addUsage(beatUsage, directorResult.usage)
      let directorReply = directorResult.text
      const directorRawReply = directorReply
      let repairSystem: string | undefined
      let repairMessage: string | undefined
      // One repair attempt when the director ignored the output contract. The
      // model has already decided the beat, so this asks it to restate the same
      // decision as JSON rather than to decide again; the cost is one extra call
      // on the fraction of turns that miss, and it buys back the structural
      // narration/speaker split that the prose fallback throws away.
      if (!isDirectorJsonReply(directorReply) && !directorResult.truncated) {
        repairSystem = buildDirectorRepairSystem(directorSystem, directorReply)
        repairMessage = '把它转成 JSON。'
        const repaired = await this.complete(options, repairSystem, [
          { role: 'user', text: repairMessage },
        ], config.directorModel, replyBudgetChars(config, 'director'), config.reasoningReserveTokens)
        addUsage(beatUsage, repaired.usage)
        if (isDirectorJsonReply(repaired.text)) directorReply = repaired.text
        if (repaired.truncated) truncatedBeat = true
      }
      const decision = parseDirectorReply(directorReply)
      if (directorResult.truncated) truncatedBeat = true
      const resolved = resolveSpeaker(decision, cast)
      // Order: the character the player addressed (first turn only), the
      // director's pick, then the configured fallback for an unusable reference.
      const addressedThisTurn = turn === 0 ? addressed : undefined
      const speaker = addressedThisTurn
        ?? resolved
        ?? (config.unknownSpeaker === 'first' ? cast[0] : undefined)
      const speakerSource: SpeakerSource | undefined = speaker === undefined
        ? undefined
        : addressedThisTurn === undefined
          ? resolved === undefined ? 'fallback-first' : 'director'
          : 'player-mention'
      if (turn === 0) inner = decision.inner

      const turnRecord: BeatTurn = {
        directorSystem,
        directorReply,
        ...(directorRawReply === directorReply ? {} : { directorRawReply }),
        ...(repairSystem === undefined ? {} : { repairSystem }),
        ...(repairMessage === undefined ? {} : { repairMessage }),
        decision,
        directorModel: {
          provider: config.directorModel?.provider ?? options.provider,
          model: config.directorModel?.model ?? options.model,
        },
        ...(speakerSource === undefined ? {} : { speakerSource }),
        ...(speaker === undefined ? {} : { effectiveSpeaker: { id: speaker.id, name: speaker.name } }),
      }
      if (decision.narration.length > 0) {
        stage.push({
          seq: nextSeq(stage),
          at: new Date().toISOString(),
          kind: 'narration',
          text: decision.narration,
          scope: 'observable',
        })
        staged.push({ kind: 'narration', text: decision.narration, scope: 'observable' })
        segments.push({ kind: 'narration', text: decision.narration })
      }

      if (speaker === undefined) {
        turns.push(turnRecord)
        break
      }
      const card = cards.find(item => item.id === speaker.id)
      if (card === undefined) {
        turns.push(turnRecord)
        break
      }
      const characterSystem = buildCharacterSystem({
        layout,
        card,
        stage,
        worldbook: [...workspaceBook.entries, ...fromCardEntries(card.entries)],
        playerInput,
        narration: decision.narration,
        limits: config,
      })
      const characterMessage = buildCharacterMessage(decision.narration, playerInput)
      const characterResult = await this.complete(options, characterSystem, [
        { role: 'user', text: characterMessage },
      ], config.characterModel, replyBudgetChars(config, 'character', card.id), config.reasoningReserveTokens)
      addUsage(beatUsage, characterResult.usage)
      const speech = characterResult.text.trim()
      if (characterResult.truncated) truncatedBeat = true
      turnRecord.characterSystem = characterSystem
      turnRecord.characterPromptMessages = [{ role: 'user', text: characterMessage }]
      turnRecord.characterModel = {
        provider: config.characterModel?.provider ?? options.provider,
        model: config.characterModel?.model ?? options.model,
      }
      turnRecord.speech = speech
      turns.push(turnRecord)
      if (speech.length === 0) break
      stage.push({
        seq: nextSeq(stage),
        at: new Date().toISOString(),
        kind: 'speech',
        speaker: card.id,
        speakerName: card.name,
        text: speech,
        scope: 'observable',
      })
      staged.push({
        kind: 'speech',
        speaker: card.id,
        speakerName: card.name,
        text: speech,
        scope: 'observable',
      })
      segments.push({ kind: 'speech', name: card.name, text: speech })
      spoken.push(speaker)
    }

    // A replay commits the trimmed stage and the restored world together, so a
    // discarded draft never survives into the next prompt. A normal beat only
    // appends, which keeps its files untouched when a model call fails.
    const nextWorld = {
      scene: segments.find(segment => segment.kind === 'narration')?.text ?? world.scene,
      facts: world.facts,
      hidden: inner.length > 0 ? [...world.hidden, inner] : world.hidden,
    }
    if (replay !== undefined) {
      // The loop pushed every fresh line into `stage` to keep the next prompt
      // current, so `stage` is already the trimmed prefix followed by the new
      // lines in order. Writing `staged` again would duplicate them.
      await writeStage(cwd, stage, story)
      await writeWorld(cwd, nextWorld, story)
    } else {
      if (staged.length > 0) await appendStage(cwd, staged, story)
      if (inner.length > 0) await writeWorld(cwd, nextWorld, story)
    }
    // The turn number is read before the record is written: the loop has
    // already opened and closed this turn by the time the stream settles.
    const beatTurn = story === undefined ? undefined : this.lastTurnOf(story)
    const beatRecord: BeatRecord = {
      at: new Date().toISOString(),
      playerInput,
      directorSystem: turns[0]?.directorSystem ?? '',
      directorReply: turns[0]?.directorReply ?? '',
      decision: turns[0]?.decision ?? { narration: '', inner: '' },
      turns,
      ...(beatTurn === undefined ? {} : { turn: beatTurn }),
      stageCountBefore,
      worldBefore: world,
      ...(replay === undefined ? {} : { regeneratedFrom: replay.beat.record.at }),
    }
    await this.writeBeat(cwd, beatRecord, story)
    // Trajectory reads the session log, not the beat file. Logging the same
    // calls keeps the two views of "what was sent" from drifting apart.
    this.appendBeatLog(story, beatLogFromRecord(
      beatRecord,
      playerInput,
      this.beatModels(config, options, turns),
    ))
    if (replay !== undefined && story !== undefined && beatTurn !== undefined) {
      // Recorded after the beat is durable: a superseded turn must point at a
      // replacement that actually exists, or the transcript labels a gap.
      await appendRegeneration(storyDirectory(cwd, story), {
        turn: replay.beat.record.turn ?? Math.max(0, beatTurn - 1),
        replacement: beatTurn,
        at: new Date().toISOString(),
      }).catch((error: unknown) => {
        this.ctx.logger.warn(`[dshtavern] regeneration record not stored: ${String(error)}`)
      })
    }

    // An empty beat means every model call returned nothing (or the director
    // produced no narration and named no speaker). Reporting that beats a blank
    // message the player cannot tell apart from a rendering failure.
    //
    // When a call was cut off, the truncation is the cause, not a broken
    // director block: saying both would point the reader at the wrong knob.
    const rendered = renderBeatMarkdown(segments)
    const body = rendered.length > 0
      ? rendered
      : truncatedBeat ? '' : EMPTY_BEAT_NOTICE
    const notice = truncatedBeat ? TRUNCATED_NOTICE : ''
    const text = [body, notice].filter(part => part.length > 0).join('\n\n')
    yield* textReply(options, text.length > 0 ? text : EMPTY_BEAT_NOTICE, beatUsage)
  }

  /**
   * Run one auxiliary completion to a finished string plus its reported usage.
   *
   * The orchestrator replaces the agent loop's own model call, so adapter usage
   * chunks would otherwise be dropped before reaching the loop: the loop would
   * record an assistant message with no usage, and the token-meter projection
   * would report zero for every tavern session.
   * @param options - the intercepted request, providing provider and model.
   * @param system - system prompt for this call.
   * @param messages - user turns.
   * @param choice - per-role model override; omitted follows the session.
   * @param maxReplyChars - reply budget in characters; omitted sends no cap.
   * @param reasoningReserve - tokens added to the cap for the model's thinking.
   * @returns the concatenated text output and the call's usage, when reported.
   */
  private async complete(
    options: GenerateOptions,
    system: string,
    messages: readonly { role: 'user'; text: string }[],
    choice?: AgentModelChoice,
    maxReplyChars?: number,
    reasoningReserve?: number,
  ): Promise<{ text: string; usage?: TokenUsage; truncated: boolean }> {
    // The loop's cancellation signal must reach every call this beat makes:
    // one beat is several sequential requests, and without it a cancelled turn
    // keeps spending tokens after the player has moved on.
    if (options.signal?.aborted === true) throw new Error('tavern beat cancelled')
    const stream = this.ctx.llm.stream({
      provider: choice?.provider ?? options.provider,
      model: choice?.model ?? options.model,
      system,
      messages: messages.map(message => createUserMessage({
        content: [{ type: 'text', text: message.text }],
        source: { kind: 'user' },
      })),
      // A role-specific effort only applies to a role-specific model: the
      // session's effort names levels the session model accepts.
      ...(choice?.reasoningEffort !== undefined
        ? { reasoningEffort: ReasoningEffortId(choice.reasoningEffort) }
        : options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
      ...(maxReplyChars === undefined ? {} : { maxTokens: replyCapTokens(maxReplyChars, reasoningReserve) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    let text = ''
    let usage: TokenUsage | undefined
    // The provider stops at the token cap mid-sentence; the beat needs to know
    // so it can say the reply was cut instead of presenting a stub as complete.
    let truncated = false
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'usage') usage = chunk.usage
      else if (chunk.type === 'finish' && chunk.reason.kind === 'max-tokens') truncated = true
      else if (chunk.type === 'finish' && chunk.reason.kind === 'aborted') {
        // A cancelled turn must not stage the partial text it collected: the
        // player asked to abandon this beat, not to keep half of it.
        throw new Error('tavern beat cancelled')
      } else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        throw new Error(`tavern model call failed: ${chunk.reason.failure.message}`)
      }
    }
    return {
      text,
      truncated,
      ...(usage === undefined ? {} : { usage }),
    }
  }

  /** Persist one beat's prompts and outcome for inspection. */
  private async writeBeat(cwd: string, beat: BeatRecord, session: string | undefined): Promise<void> {
    const directory = join(storyDirectory(cwd, session), 'beats')
    const file = join(directory, `${beat.at.replace(/[:.]/g, '-')}.json`)
    await mkdir(directory, { recursive: true }).catch(() => undefined)
    await writeFile(file, `${JSON.stringify(beat, null, 2)}\n`, 'utf8').catch(() => undefined)
  }

  /** Resolve a session's tavern cwd, falling back to the session store. */
  private tavernSessionCwdFor(sessionId: string): string | undefined {    const cached = this.tavernSessionCwd.get(sessionId)
    if (cached !== undefined) return cached
    const sessions = (this.ctx as unknown as { get(name: string): unknown }).get('sessions') as
      | { get?: (id: unknown) => { header?: { cwd?: string } } | undefined }
      | undefined
    const cwd = sessions?.get?.(sessionId)?.header?.cwd
    if (cwd === undefined || !isTavernCwdSync(cwd)) return undefined
    this.tavernSessionCwd.set(sessionId, cwd)
    return cwd
  }

  /**
   * Drop non-working-directory required contexts from tavern requests.
   *
   * `step()` calls `systemPrompt.refreshContext()` after `agent/pre-step` and
   * restores every `required` context that the assembly lost (notably
   * `team:identity` from the globally installed agent-team plugin). That call
   * happens after both assembly and pre-step, so the only place to filter it is
   * the service method itself. The wrapper is inert outside tavern sessions.
   *
   * The service offers no per-assembly hook here, so this wraps the prototype
   * method inside an effect: unloading the plugin must remove the wrapper, or a
   * stale closure over a disposed context would throw on every later assembly.
   */
  private installRequiredContextFilter(): void {
    this.ctx.inject(['systemPrompt'], (scoped) => {
      const systemPrompt = scoped.systemPrompt as unknown as {
        refreshContext?: (assembly: unknown, context?: { agent?: Agent }) => { contexts: Array<{ name: string }> }
      }
      if (systemPrompt.refreshContext === undefined) return
      const prototype = Object.getPrototypeOf(systemPrompt) as {
        refreshContext: typeof systemPrompt.refreshContext
      }
      scoped.effect(() => {
        const base = prototype.refreshContext
        const wrapper = (assembly: unknown, context?: { agent?: Agent }): { contexts: Array<{ name: string }> } => {
          const refreshed = base.call(systemPrompt, assembly, context)
          const cwd = context?.agent?.session.header.cwd
          if (cwd === undefined || !isTavernCwdSync(cwd)) return refreshed
          return {
            ...refreshed,
            contexts: refreshed.contexts.filter(entry => entry.name === 'working-directory:current'),
          }
        }
        systemPrompt.refreshContext = wrapper
        return () => {
          // The wrapper is an own property shadowing the prototype method, so
          // deleting it restores the original behaviour. Only remove it while it
          // is still the installed wrapper: another instance may have replaced it.
          if (systemPrompt.refreshContext === wrapper) delete (systemPrompt as { refreshContext?: unknown }).refreshContext
        }
      }, 'dshtavern: required context filter')
    })
  }

  private recordFinalRequest(cwd: string, options: GenerateOptions): void {
    const directory = join(cwd, TAVERN_DIRECTORY, 'state')
    const first = options.messages[0] as unknown as {
      role?: string
      content?: Array<{ type: string; text?: string }>
    } | undefined
    const system = first?.role === 'system'
      ? (first.content ?? []).filter(part => part.type === 'text').map(part => part.text ?? '').join('\n')
      : ''
    const payload = {
      recordedAt: new Date().toISOString(),
      sessionId: options.sessionId === undefined ? '' : String(options.sessionId),
      provider: options.provider,
      model: options.model,
      system,
      tools: options.tools ?? [],
      messages: options.messages,
    }
    void mkdir(directory, { recursive: true })
      .then(() => writeFile(join(directory, 'last-request.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8'))
      .catch(() => undefined)
  }

  /**
   * Register the workspace-level system prompt on a tavern agent.
   *
   * The preset row is not mounted reliably early enough for the first turn, so
   * the host registers the complete section directly on the agent context.
   * DSH assembles the prompt before dispatching `agent/pre-step`, therefore the
   * section text provider reads the workspace layout synchronously; an async
   * refresh hook would leave the first turn with an empty prompt.
   * @param agent - the newly created agent.
   */
  private setupTavernAgent(agent: Agent): void {
    const cwd = agent.session.header.cwd
    if (!isTavernCwdSync(cwd)) return
    if (agent.ctx.systemPrompt === undefined) {
      this.debugLog(`agent ${String(agent.session.id)} has no systemPrompt service`)
      return
    }
    agent.ctx.effect(() => agent.ctx.systemPrompt.section({
      name: TAVERN_PROMPT_SECTION,
      order: -1000,
      complete: true,
      // Placeholders are already substituted by renderPromptText; DSH must not
      // try to interpolate SillyTavern-style `{{...}}` variables itself.
      interpolate: false,
      text: () => assembleWorkspacePromptSync(cwd) ?? '',
    }), 'dshtavern: workspace prompt section')
    agent.ctx.systemPrompt.suppressRuntimeContext()
    // Belt and braces: the root-level listener also trims this assembly, but a
    // per-agent listener keeps the guarantee even if the root dispatch is
    // broader than expected.
    agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const assembly = await next()
      return {
        ...assembly,
        tools: [],
        contexts: assembly.contexts.filter(entry => entry.name === 'working-directory:current'),
      }
    })
    // The runtime-context snapshot is appended after assembly and still carries
    // required contexts (`team:identity`); rewrite it to the cwd line only, and
    // drop `<system-reminder>` injections.
    agent.ctx.on('agent/pre-step', async (_payload, next) => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const messages = decision.messages
        .filter(message => !hasSystemReminder(message))
        .map(message => isRuntimeContextMessage(message)
          ? {
              ...message,
              content: [{ type: 'text' as const, text: `Current working directory: ${JSON.stringify(cwd)}.` }],
            }
          : message)
      return { ...decision, messages }
    })
    this.debugLog(`section registered ${String(agent.session.id)} cwd=${String(cwd)} v4-clean`)
  }

  private debugLog(line: string): void {
    void appendFile(join(tmpdir(), 'dshtavern-session-debug.log'), `${new Date().toISOString()} [host] ${line}\n`, 'utf8')
      .catch(() => undefined)
  }

  private async ensureTavernPreset(agent: Agent): Promise<void> {
    if (this.presetAttempts.has(agent)) return
    const expected = await this.tavernPresetForDirectory(agent.session.header.cwd)
    if (expected === undefined) return
    if (agent.session.header.agentPreset === expected) return
    const presets = (this.ctx as unknown as { get(name: string): unknown }).get('agentPresets') as
      | { select?: (agent: unknown, id: string) => Promise<unknown> }
      | undefined
    if (presets?.select === undefined) return
    this.presetAttempts.add(agent)
    try {
      const selected = await presets.select(agent, expected)
      this.ctx.logger.info(`[dshtavern] bound session ${String(agent.session.id)} to preset '${String(selected)}'`)
    } catch (error) {
      this.ctx.logger.warn(`[dshtavern] preset binding failed: ${String(error)}`)
    }
  }

  /** Resolve the internal preset id for a directory's tavern mode. */
  private async tavernPresetForDirectory(directory: string | undefined): Promise<string | undefined> {
    const root = tavernRootForCwd(directory)
    if (root === undefined) return undefined
    const marker = await readMarker(root)
    if (marker === undefined) return undefined
    return tavernModeOf(marker) === 'novel' ? 'tavern-novel' : 'tavern-rp'
  }

  private registerHttp(): void {
    this.ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/state',
        handler: (req, res) => this.handleState(req, res),
      }), 'dshtavern: /tavern/state')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/create',
        handler: (req, res) => this.handleCreate(req, res),
      }), 'dshtavern: /tavern/create')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/adopt',
        handler: (req, res) => this.handleAdopt(req, res),
      }), 'dshtavern: /tavern/adopt')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/untag',
        handler: (req, res) => this.handleUntag(req, res),
      }), 'dshtavern: /tavern/untag')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/prompt',
        handler: (req, res) => this.handlePromptLayout(req, res),
      }), 'dshtavern: /tavern/prompt')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/characters',
        handler: (req, res) => this.handleCharacters(req, res),
      }), 'dshtavern: /tavern/characters')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/worldbook',
        handler: (req, res) => this.handleWorldbook(req, res),
      }), 'dshtavern: /tavern/worldbook')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/characters/transfer',
        handler: (req, res) => this.handleCharacterTransfer(req, res),
      }), 'dshtavern: /tavern/characters/transfer')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/worldbook/transfer',
        handler: (req, res) => this.handleWorldbookTransfer(req, res),
      }), 'dshtavern: /tavern/worldbook/transfer')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/greeting',
        handler: (req, res) => this.handleGreeting(req, res),
      }), 'dshtavern: /tavern/greeting')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/opening',
        handler: (req, res) => this.handleOpening(req, res),
      }), 'dshtavern: /tavern/opening')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/regenerate',
        handler: (req, res) => this.handleRegenerate(req, res),
      }), 'dshtavern: /tavern/regenerate')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/agent',
        handler: (req, res) => this.handleAgentConfig(req, res),
      }), 'dshtavern: /tavern/agent')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/models',
        handler: (req, res) => this.handleModelCatalog(req, res),
      }), 'dshtavern: /tavern/models')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/preview',
        handler: (req, res) => this.handlePreview(req, res),
      }), 'dshtavern: /tavern/preview')
      // TEMPORARY diagnosis: inspect live preset compositions.
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/tavern/debug/presets',
        handler: (req, res) => this.handleDebugPresets(req, res),
      }), 'dshtavern: /tavern/debug/presets')
    })
  }

  private async handleState(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    try {
      sendJson(res, 200, { ok: true, ...await this.overview() })
    } catch (error) {
      this.fail(res, error)
    }
  }

  private async handleCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'POST') {
      methodNotAllowed(res, 'POST')
      return
    }
    try {
      const body = await readJsonObject(req)
      const tavern = await this.create({
        title: optionalString(body, 'title'),
        path: optionalString(body, 'path'),
        mode: tavernModeFromBody(body),
      })
      sendJson(res, 200, { ok: true, tavern })
    } catch (error) {
      this.fail(res, error)
    }
  }

  private async handleAdopt(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'POST') {
      methodNotAllowed(res, 'POST')
      return
    }
    try {
      const body = await readJsonObject(req)
      const workspaceId = optionalString(body, 'workspaceId')
      if (workspaceId === undefined) throw new TavernInputError('缺少 workspaceId')
      sendJson(res, 200, { ok: true, tavern: await this.adopt(workspaceId, tavernModeFromBody(body)) })
    } catch (error) {
      this.fail(res, error)
    }
  }

  private async handleUntag(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'POST') {
      methodNotAllowed(res, 'POST')
      return
    }
    try {
      const body = await readJsonObject(req)
      const workspaceId = optionalString(body, 'workspaceId')
      if (workspaceId === undefined) throw new TavernInputError('缺少 workspaceId')
      sendJson(res, 200, { ok: true, removed: await this.untag(workspaceId) })
    } catch (error) {
      this.fail(res, error)
    }
  }

  private async handlePromptLayout(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    try {
      const method = req.method ?? 'GET'
      const queryScope = promptScopeFromUrl(req)
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, ...await this.promptLayout(workspaceIdFromUrl(req), queryScope) })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' })
        return
      }
      const body = await readJsonObject(req, PROMPT_BODY_MAX_BYTES)
      const workspaceId = optionalString(body, 'workspaceId') ?? workspaceIdFromUrl(req)
      const scope = promptScopeFromBody(body) ?? queryScope
      sendJson(res, 200, {
        ok: true,
        ...await this.savePromptLayout(workspaceId, {
          blocks: body.blocks,
          reset: body.reset === true,
        }, scope),
      })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** Character-card CRUD for one tavern workspace. */
  private async handleCharacters(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    try {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, ...await this.characterCards(workspaceIdFromUrl(req)) })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' })
        return
      }
      const body = await readJsonObject(req, CARD_BODY_MAX_BYTES)
      const workspaceId = optionalString(body, 'workspaceId') ?? workspaceIdFromUrl(req)
      const action = optionalString(body, 'action') ?? 'create'
      const id = optionalString(body, 'id')
      if (action === 'delete') {
        if (id === undefined) throw new CharacterCardInvalidError('缺少角色卡 id')
        sendJson(res, 200, { ok: true, removed: await this.deleteCharacterCard(workspaceId, id) })
        return
      }
      if (action !== 'create' && action !== 'save') {
        throw new CharacterCardInvalidError(`未知操作：${action}`)
      }
      const card = body.card
      if (typeof card !== 'object' || card === null || Array.isArray(card)) {
        throw new CharacterCardInvalidError('缺少角色卡内容')
      }
      const input = card as CharacterCardInput
      if (action === 'create') {
        sendJson(res, 200, { ok: true, card: await this.createCharacterCard(workspaceId, input) })
        return
      }
      if (id === undefined) throw new CharacterCardInvalidError('缺少角色卡 id')
      sendJson(res, 200, { ok: true, card: await this.saveCharacterCard(workspaceId, id, input) })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** Import or export one character card as a `.charc` document. */
  private async handleCharacterTransfer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        const workspaceId = workspaceIdFromUrl(req)
        const id = url.searchParams.get('id') ?? ''
        if (id.length === 0) throw new CharacterCardInvalidError('缺少角色卡 id')
        sendJson(res, 200, { ok: true, ...await this.exportCharacterCard(workspaceId, id) })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' })
        return
      }
      const body = await readJsonObject(req, CARD_BODY_MAX_BYTES)
      const workspaceId = optionalString(body, 'workspaceId')
      if (workspaceId === undefined) throw new CharacterCardInvalidError('缺少 workspaceId')
      const text = optionalString(body, 'text')
      if (text === undefined) throw new CharacterCardInvalidError('缺少上传内容')
      sendJson(res, 200, { ok: true, card: await this.importCharacterCard(workspaceId, text) })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** Import or export one workspace's worldbook as a `.world` document. */
  private async handleWorldbookTransfer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    try {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, ...await this.exportWorldbook(workspaceIdFromUrl(req)) })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' })
        return
      }
      const body = await readJsonObject(req, WORLDBOOK_BODY_MAX_BYTES)
      const workspaceId = optionalString(body, 'workspaceId')
      if (workspaceId === undefined) throw new WorldbookInvalidError('缺少 workspaceId')
      const text = optionalString(body, 'text')
      if (text === undefined) throw new WorldbookInvalidError('缺少上传内容')
      sendJson(res, 200, { ok: true, ...await this.importWorldbook(workspaceId, text) })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /**
   * Resolve one workspace's opening: scene setting plus the first character line.
   * @param workspaceId - registered tavern workspace id.
   * @returns the resolved opening; both fields are absent when no card defines them.
   */
  async opening(workspaceId: string): Promise<TavernOpening> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return selectOpening(listCharacterCardsSync(workspace.path))
  }

  /**
   * Read a story's generated opening script, generating it on first use.
   *
   * The script is written once per chat and stored under that chat's story
   * directory, so reopening never spends another call and never changes what the
   * player already read. Reading it does not touch the transcript: the opening
   * becomes a real turn only when {@link requestOpening} queues one.
   * @param workspaceId - registered tavern workspace id.
   * @param sessionId - chat identity owning the script.
   * @returns the stored or freshly generated script; empty when it cannot be written.
   */
  async ensureOpeningScript(workspaceId: string, sessionId: string): Promise<OpeningScript> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return this.ensureOpeningScriptForDirectory(workspace.path, sessionId)
  }

  /**
   * Queue the opening as a turn of its own.
   *
   * The opening must precede the player's first message, and the transcript
   * order is turn order, so it cannot be prepended to the first reply. A turn
   * also cannot be written from outside the loop: the loop owns turn numbering,
   * and a turn it did not open makes the session unreadable on reload. Queuing
   * an inbox message with the opening source is therefore the only sound way to
   * produce it — the loop opens the turn, and the orchestrator fills it with
   * the script instead of calling the director.
   *
   * A story that already has turns keeps its existing opening; a second call is
   * a no-op so the greeting card can retry freely.
   * @param workspaceId - registered tavern workspace id.
   * @param sessionId - chat identity.
   * @returns whether the opening turn was queued.
   */
  async requestOpening(workspaceId: string, sessionId: string): Promise<{ queued: boolean }> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    // The stage, not the turn projection, decides whether the opening already
    // ran: the projection is absent on a cold session, while the stage is always
    // on disk from the moment the opening turn staged its lines.
    const stage = await readStage(workspace.path, sessionId)
    if (stage.length > 0 || this.lastTurnOf(sessionId) > 0) return { queued: false }
    const script = await this.ensureOpeningScriptForDirectory(workspace.path, sessionId)
    if (script.segments.length === 0) return { queued: false }
    return { queued: await this.queueTrigger(sessionId, OPENING_SOURCE_KIND, OPENING_PROMPT, '生成开场') }
  }

  /**
   * Describe one story's regeneration state.
   *
   * `replayableTurn` is the only turn the action can replace: the rewind target
   * is always the newest beat. The client uses it to hide the action on turns
   * that cannot be regenerated (an opening-only story, or any older reply)
   * instead of offering a button that would immediately refuse.
   * @param workspaceId - registered tavern workspace id.
   * @param sessionId - chat identity.
   * @returns superseded turns and the newest replayable turn, when known.
   */
  async regenerationState(
    workspaceId: string,
    sessionId: string,
  ): Promise<{ regenerations: RegenerationRecord[]; replayableTurn?: number }> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const [regenerations, beats] = await Promise.all([
      readRegenerations(storyDirectory(workspace.path, sessionId)),
      listBeats(storyDirectory(workspace.path, sessionId)),
    ])
    const newest = beats[0]
    if (newest === undefined) return { regenerations }
    // A cold session cannot answer through its projection; the beat's own turn
    // number is then the only source, and its absence means "unknown" rather
    // than "turn 0".
    const turn = newest.record.turn ?? this.lastTurnOf(sessionId)
    return { regenerations, ...(turn > 0 ? { replayableTurn: turn } : {}) }
  }

  /**
   * Start one regeneration turn for a story.
   *
   * Only the newest beat can be replayed: the mechanism rolls the story state
   * back to that beat's start, so an older turn would have to discard every
   * turn after it. The newest beat's turn number is the check that the caller
   * and the story agree on which reply is being replaced.
   * @param workspaceId - registered tavern workspace id.
   * @param sessionId - chat identity.
   * @param turn - turn the caller is regenerating.
   * @returns the turn that will receive the replacement reply.
   * @throws TavernInputError when the request is stale, the story has no beat,
   *   or the agent is busy.
   */
  async requestRegeneration(workspaceId: string, sessionId: string, turn: number): Promise<{ turn: number }> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const beats = await listBeats(storyDirectory(workspace.path, sessionId))
    const newest = beats[0]
    if (newest === undefined) {
      this.ctx.logger.warn(`[dshtavern] no replayable beat in ${storyDirectory(workspace.path, sessionId)}`)
      throw new TavernInputError(REGENERATE_UNAVAILABLE)
    }
    // Beats written before the record carried a turn number fall back to the
    // session's newest turn. That projection is only available while the Agent
    // is attached, so a cold session has no number to compare against; the
    // rewind itself still targets the newest beat, which is the real invariant.
    const newestTurn = newest.record.turn ?? this.lastTurnOf(sessionId)
    if (newestTurn > 0 && newestTurn !== turn) {
      throw new TavernInputError(`只能重新生成最新的回复（第 ${newestTurn} 轮）。`)
    }
    const controller = (this.ctx as unknown as { get(name: string): unknown }).get('sessionController') as
      | {
        resolveAgent?: (id: string) => Promise<
          { agent?: { status?: string; followup?: (message: unknown) => void } } | { error?: unknown }
        >
      }
      | undefined
    if (controller?.resolveAgent === undefined) {
      throw new TavernInputError('当前部署没有会话控制器，无法重新生成。')
    }
    const resolved = await controller.resolveAgent(sessionId)
    if (resolved === undefined || !('agent' in resolved) || resolved.agent === undefined) {
      throw new TavernInputError('这个会话无法恢复，无法重新生成。')
    }
    const agent = resolved.agent
    if (agent.followup === undefined) throw new TavernInputError('这个会话没有可用的 Agent，无法重新生成。')
    if (agent.status !== 'idle') throw new TavernInputError('上一轮还在进行中，等它结束后再重新生成。')
    const queuedAt = this.pendingRegenerations.get(sessionId)
    if (queuedAt !== undefined && Date.now() - queuedAt < REGENERATION_QUEUE_WINDOW_MS) {
      throw new TavernInputError('已经有一次重新生成在排队了。')
    }
    this.pendingRegenerations.set(sessionId, Date.now())
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: REGENERATE_PROMPT }],
        source: { kind: REGENERATE_SOURCE_KIND, form: 'notice', summary: '重新生成上一幕' },
      }))
    } catch (error) {
      this.pendingRegenerations.delete(sessionId)
      throw error
    }
    return { turn: turn + 1 }
  }

  /**
   * Queue one non-player trigger turn.
   *
   * A turn cannot be written from outside the loop: the loop owns turn
   * numbering, and a turn it did not open makes the session unreadable on
   * reload. The only sound way to run work as a turn is an inbox message the
   * loop claims, so every trigger uses this path.
   * @param sessionId - chat identity.
   * @param kind - source kind the orchestrator dispatches on.
   * @param text - model-facing trigger body; never player text.
   * @param summary - one-line account shown on the context row.
   * @returns whether the trigger was accepted.
   */
  private async queueTrigger(
    sessionId: string,
    kind: typeof OPENING_SOURCE_KIND | typeof REGENERATE_SOURCE_KIND,
    text: string,
    summary: string,
  ): Promise<boolean> {
    const controller = (this.ctx as unknown as { get(name: string): unknown }).get('sessionController') as
      | {
        resolveAgent?: (id: string) => Promise<
          { agent?: { status?: string; followup?: (message: unknown) => void } } | { error?: unknown }
        >
      }
      | undefined
    if (controller?.resolveAgent === undefined) {
      throw new TavernInputError('当前部署没有会话控制器，无法开始这一轮。')
    }
    const resolved = await controller.resolveAgent(sessionId)
    if (resolved === undefined || !('agent' in resolved) || resolved.agent === undefined) {
      throw new TavernInputError('这个会话无法恢复，无法开始这一轮。')
    }
    const agent = resolved.agent
    if (agent.followup === undefined) throw new TavernInputError('这个会话没有可用的 Agent。')
    if (agent.status !== 'idle') throw new TavernInputError('上一轮还在进行中，等它结束后再试。')
    agent.followup(createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind, form: 'notice', summary },
    }))
    return true
  }

  /**
   * Read the opening as beat segments and stage lines.
   *
   * Shared by the opening turn and the legacy inline fallback so both render
   * the script identically.
   * @param cwd - tavern workspace directory.
   * @param story - owning session id.
   * @param cards - cards whose static opening is the fallback.
   * @returns display segments, the stage lines that record them, and the
   *   generation call when a script was used.
   */
  private async openingBeatSegments(
    cwd: string,
    story: string | undefined,
    cards: readonly CharacterCard[],
  ): Promise<{
    segments: BeatSegment[]
    staged: Omit<StageEntry, 'seq' | 'at'>[]
    script?: OpeningScript
  }> {
    const script = story === undefined ? undefined : await this.ensureOpeningScriptForDirectory(cwd, story)
    const segments: BeatSegment[] = []
    const staged: Omit<StageEntry, 'seq' | 'at'>[] = []
    if (script !== undefined && script.segments.length > 0) {
      for (const segment of script.segments) {
        if (segment.kind === 'narration') {
          segments.push({ kind: 'narration', text: segment.text })
          staged.push({ kind: 'narration', text: segment.text, scope: 'observable' })
          continue
        }
        segments.push({ kind: 'speech', name: segment.speakerName ?? '', text: segment.text })
        staged.push({
          kind: 'speech',
          speaker: segment.cardId ?? '',
          speakerName: segment.speakerName ?? '',
          text: segment.text,
          scope: 'observable',
        })
      }
      return { segments, staged, script }
    }
    const staticOpening = selectOpening(cards)
    if (staticOpening?.narration !== undefined) {
      segments.push({ kind: 'narration', text: staticOpening.narration.text })
      staged.push(openingNarrationStageLine(staticOpening.narration))
    }
    if (staticOpening?.greeting !== undefined) {
      segments.push({ kind: 'speech', name: staticOpening.greeting.name, text: staticOpening.greeting.text })
      staged.push(greetingStageLine(staticOpening.greeting))
    }
    return { segments, staged }
  }

  /**
   * Roll a story back to the state the newest beat started from.
   *
   * The transcript is append-only, so regeneration cannot delete the old
   * reply. The story state is what matters: cutting the stage and restoring
   * the director's world means the replay never reads the discarded draft, and
   * the new reply is appended as the next turn while the old one is marked
   * superseded through {@link appendRegeneration}.
   *
   * Nothing is written here. The caller commits the trimmed stage only after
   * the replay settles, so a failed replay leaves the replaced beat intact
   * instead of deleting it without a replacement.
   * @param cwd - tavern workspace directory.
   * @param story - owning session id, when the request has one.
   * @returns the beat to replay and the state it started from, or `undefined`
   *   when the story has no replayable beat.
   */
  private async rewindForRegeneration(
    cwd: string,
    story: string | undefined,
  ): Promise<{ beat: StoredBeat; stage: StageEntry[]; world: WorldState } | undefined> {
    const beats = await listBeats(storyDirectory(cwd, story))
    const beat = beats[0]
    if (beat === undefined) return undefined
    const stage = await readStage(cwd, story)
    // Beats written before the world snapshot existed cannot restore it; the
    // replay then starts from the current world, which is the closest honest
    // approximation available.
    const world = beat.record.worldBefore ?? await readWorld(cwd, story)
    return {
      beat,
      stage: stage.slice(0, truncationPoint(beat.record, stage.length)),
      world,
    }
  }

  /**
   * Latest turn number recorded for one session.
   * @param sessionId - chat identity.
   * @returns the projection's `lastTurn`, or 0 when it cannot be read.
   */
  private lastTurnOf(sessionId: string): number {
    const sessions = (this.ctx as unknown as { get(name: string): unknown }).get('sessions') as
      | { get?: (id: string) => unknown | undefined }
      | undefined
    const session = sessions?.get?.(sessionId)
    if (session === undefined) return 0
    const projections = (this.ctx as unknown as { get(name: string): unknown }).get('sessionProjections') as
      | { stateOf?: (session: unknown, key: string) => { lastTurn?: number } | undefined }
      | undefined
    const state = projections?.stateOf?.(session, 'turnBoundary')
    return typeof state?.lastTurn === 'number' ? state.lastTurn : 0
  }

  /**
   * Generate a story's opening script from its workspace directory.
   *
   * Shared by the pre-chat route (which only knows the workspace id) and the
   * first beat (which only knows the directory), so both join one call.
   * @param workspacePath - tavern workspace root.
   * @param sessionId - chat identity.
   * @returns the stored or generated script; empty when it cannot be produced.
   */
  private async ensureOpeningScriptForDirectory(workspacePath: string, sessionId: string): Promise<OpeningScript> {
    const directory = storyDirectory(workspacePath, sessionId)
    const stored = await readOpeningScript(directory)
    if (stored !== undefined) return stored

    // One generation per story: the pre-chat card and the first beat both ask,
    // and the player may send while the card is still waiting.
    const pending = this.openingGenerations.get(directory)
    if (pending !== undefined) return pending
    const generation = this.generateOpeningScript(workspacePath, directory, sessionId)
      .finally(() => { this.openingGenerations.delete(directory) })
    this.openingGenerations.set(directory, generation)
    return generation
  }

  /**
   * Append one beat's prompts to the session log.
   *
   * The orchestrator builds its own requests, so the loop never records them as
   * `system/message`; without this record the prompts that actually decided the
   * reply exist only in the beat file, and Trajectory can show nothing but the
   * unchanging workspace prompt. The record is an ignorable plugin record, so it
   * never enters derived model history, and a failure here must not fail a beat
   * that has already committed its story state.
   * @param sessionId - chat identity.
   * @param log - assembled record.
   */
  private appendBeatLog(sessionId: string | undefined, log: BeatLogInput | undefined): void {
    if (sessionId === undefined || log === undefined) return
    const sessions = (this.ctx as unknown as { get(name: string): unknown }).get('sessions') as
      | { get?: (id: string) => unknown | undefined }
      | undefined
    const session = sessions?.get?.(sessionId) as { append: unknown } | undefined
    if (session === undefined) return
    try {
      appendPluginRecord(session as never, BEAT_RECORD_TYPE, buildBeatLog(log))
    } catch (error) {
      this.ctx.logger.warn(`[dshtavern] beat prompts not logged: ${String(error)}`)
    }
  }

  /**
   * Read the model labels one beat's calls used, for the log record.
   * @param config - workspace orchestration settings.
   * @param options - the intercepted loop request, the fallback route.
   * @param turns - the beat's recorded calls.
   * @returns director and per-character labels.
   */
  private beatModels(
    config: TavernAgentConfig,
    options: GenerateOptions,
    turns: readonly BeatTurn[],
  ): BeatLogModels {
    const label = (choice: AgentModelChoice | undefined): string => choice === undefined
      ? `${options.provider}/${options.model}`
      : `${choice.provider}/${choice.model}`
    const characters = new Map<string, string>()
    for (const turn of turns) {
      const speaker = turn.effectiveSpeaker
      if (speaker === undefined) continue
      characters.set(speaker.id, turn.characterModel === undefined
        ? label(config.characterModel)
        : `${turn.characterModel.provider}/${turn.characterModel.model}`)
    }
    return {
      director: turns[0]?.directorModel === undefined
        ? label(config.directorModel)
        : `${turns[0].directorModel.provider}/${turns[0].directorModel.model}`,
      characters,
    }
  }

  /**
   * Generate and store one story's opening script.
   * @param workspacePath - tavern workspace root.
   * @param directory - story directory owning the script file.
   * @param sessionId - chat identity, used to check the stage is still empty.
   * @returns the generated script, or an empty one when it cannot be produced.
   */
  private async generateOpeningScript(
    workspacePath: string,
    directory: string,
    sessionId: string,
  ): Promise<OpeningScript> {
    const cards = listCharacterCardsSync(workspacePath)
    if (cards.length === 0) return { segments: [] }
    // The story already started; an opening written now would arrive late and
    // read as a second beginning.
    const stage = await readStage(workspacePath, sessionId)
    if (stage.length > 0) return { segments: [] }

    const book = await readWorldbook(workspacePath)
    const system = buildOpeningSystem({ cards, worldbook: book.entries })
    const selection = this.defaultSelection()
    if (selection === undefined) return { segments: [] }
    const openingMessage = '写开场。'

    let reply = ''
    try {
      const stream = this.ctx.llm.stream({
        provider: selection.provider,
        model: selection.model,
        system,
        messages: [createUserMessage({
          content: [{ type: 'text', text: openingMessage }],
          source: { kind: 'user' },
        })],
      })
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') reply += chunk.text
        else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
          throw new Error(chunk.reason.failure.message)
        }
      }
    } catch (error) {
      this.ctx.logger.warn(`[dshtavern] opening generation failed: ${String(error)}`)
      return { segments: [] }
    }

    const parsed = parseOpeningReply(reply, cards)
    if (parsed.segments.length === 0) {
      this.ctx.logger.warn('[dshtavern] opening generation produced no usable segments')
      return { segments: [] }
    }
    // Remember which route wrote it: the transcript turn stamps that source, and
    // a later regeneration must not claim a different provider. The exact
    // prompt is kept too — the opening turn runs later and must log what this
    // call sent, not a prompt rebuilt from whatever the cards say by then.
    const script: OpeningScript = {
      ...parsed,
      generatedBy: selection,
      system,
      message: openingMessage,
    }
    try {
      await writeOpeningScript(directory, script)
    } catch (error) {
      // The script is still returnable; failing to cache it only costs a
      // regeneration on the next open.
      this.ctx.logger.warn(`[dshtavern] opening script not stored: ${String(error)}`)
    }
    return script
  }

  /**
   * Provider and model a brand-new session would use.
   *
   * A chat that has never sent a request has no request header, so the adapter
   * default is the only source. Read defensively: the service is optional on a
   * profile without a model picker.
   * @returns the selection, or `undefined` when no default is available.
   */
  private defaultSelection(): { provider: string; model: string } | undefined {
    const service = (this.ctx as unknown as { get(name: string): unknown }).get('agentDefaultModel') as
      | { currentSelection?: () => { provider?: string; model?: string } }
      | undefined
    const selection = service?.currentSelection?.()
    if (selection?.provider === undefined || selection.model === undefined) return undefined
    return { provider: selection.provider, model: selection.model }
  }

  /**
   * Read one workspace's agent orchestration settings.
   * @param workspaceId - registered tavern workspace id.
   * @returns the stored config, or the defaults when absent.
   */
  async agentConfig(workspaceId: string): Promise<TavernAgentConfig> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return readAgentConfig(workspace.path)
  }

  /**
   * Replace one workspace's agent orchestration settings.
   * @param workspaceId - registered tavern workspace id.
   * @param value - full config payload, validated before writing.
   * @returns the stored config.
   */
  async saveAgentConfig(workspaceId: string, value: unknown): Promise<TavernAgentConfig> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    return writeAgentConfig(workspace.path, value)
  }

  /**
   * Read one workspace's agent orchestration settings plus the defaults.
   * @param workspaceId - registered tavern workspace id.
   * @returns the stored config, the defaults, and every field's bounds.
   */
  async agentConfigView(workspaceId: string): Promise<{
    config: TavernAgentConfig
    defaults: TavernAgentConfig
    status: 'stored' | 'default'
  }> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const stored = await readAgentConfig(workspace.path)
    const isDefault = JSON.stringify(stored) === JSON.stringify(defaultAgentConfig())
    return { config: stored, defaults: defaultAgentConfig(), status: isDefault ? 'default' : 'stored' }
  }

  /** List every provider route and its models, for the model picker. */
  async modelCatalog(): Promise<readonly { provider: string; name: string; models: readonly { id: string; name: string }[] }[]> {
    const routes = this.ctx.llm.listProviders()
    const catalog: { provider: string; name: string; models: { id: string; name: string }[] }[] = []
    for (const route of routes) {
      let models: { id: string; name: string }[] = []
      try {
        models = (await this.ctx.llm.listModels(route.id)).map(model => ({ id: model.id, name: model.name }))
      } catch {
        // A provider whose catalog is unavailable still belongs in the list so
        // the user can see the route exists; it simply offers no models.
      }
      catalog.push({ provider: route.id, name: route.name, models })
    }
    return catalog
  }

  /** Resolve one story's opening for the pre-chat card. */
  private async handleGreeting(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const workspaceId = workspaceIdFromUrl(req)
      const sessionId = url.searchParams.get('sessionId')
      // With a session the call generates (once) and returns the scripted
      // opening; without one it only reports the static card fields.
      if (sessionId === null || sessionId.length === 0) {
        sendJson(res, 200, { ok: true, ...await this.opening(workspaceId) })
        return
      }
      const script = await this.ensureOpeningScript(workspaceId, sessionId)
      sendJson(res, 200, { ok: true, script })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /**
   * Queue the story's opening as its own turn.
   *
   * The pre-chat card calls this once the script exists. It is separate from
   * `GET /tavern/greeting` because reading the script is idempotent while
   * starting a turn is not.
   */
  private async handleOpening(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'POST') {
      methodNotAllowed(res, 'POST')
      return
    }
    try {
      const body = await readJsonObject(req)
      const workspaceId = optionalString(body, 'workspaceId')
      const sessionId = optionalString(body, 'sessionId')
      if (workspaceId === undefined) throw new TavernInputError('缺少 workspaceId')
      if (sessionId === undefined) throw new TavernInputError('缺少 sessionId')
      sendJson(res, 200, { ok: true, ...await this.requestOpening(workspaceId, sessionId) })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /**
   * Read one story's superseded turns, or start a regeneration.
   *
   * `GET` reports which turns were replaced so the transcript can label them.
   * `POST` validates that the named turn is the newest beat and then queues the
   * regeneration trigger, which wakes the agent and runs one replaying beat.
   */
  private async handleRegenerate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    try {
      const method = req.method ?? 'GET'
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (method === 'GET') {
        const workspaceId = workspaceIdFromUrl(req)
        const sessionId = url.searchParams.get('sessionId')
        if (sessionId === null || sessionId.length === 0) throw new TavernInputError('缺少 sessionId')
        sendJson(res, 200, { ok: true, ...await this.regenerationState(workspaceId, sessionId) })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' })
        return
      }
      const body = await readJsonObject(req)
      const workspaceId = optionalString(body, 'workspaceId')
      const sessionId = optionalString(body, 'sessionId')
      const turn = body.turn
      if (workspaceId === undefined) throw new TavernInputError('缺少 workspaceId')
      if (sessionId === undefined) throw new TavernInputError('缺少 sessionId')
      if (typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 0) {
        throw new TavernInputError('缺少要重新生成的轮次')
      }
      const started = await this.requestRegeneration(workspaceId, sessionId, turn)
      sendJson(res, 200, { ok: true, turn: started.turn })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** Read, replace, or reset one workspace's agent orchestration settings. */
  private async handleAgentConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    try {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, ...await this.agentConfigView(workspaceIdFromUrl(req)) })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' })
        return
      }
      const body = await readJsonObject(req)
      const workspaceId = optionalString(body, 'workspaceId')
      if (workspaceId === undefined) throw new AgentConfigInvalidError('缺少 workspaceId')
      const config = body.reset === true
        ? await this.saveAgentConfig(workspaceId, defaultAgentConfig())
        : await this.saveAgentConfig(workspaceId, body.config)
      sendJson(res, 200, {
        ok: true,
        config,
        defaults: defaultAgentConfig(),
        status: 'stored',
      })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** List provider routes and models for the model picker. */
  private async handleModelCatalog(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    try {
      sendJson(res, 200, { ok: true, providers: await this.modelCatalog() })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** Assemble one scope's prompt for inspection. */
  private async handlePreview(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      sendJson(res, 200, {
        ok: true,
        ...await this.previewPrompt(workspaceIdFromUrl(req), {
          scope: url.searchParams.get('scope') === 'director' ? 'director' : 'character',
          ...(url.searchParams.get('cardId') === null ? {} : { cardId: url.searchParams.get('cardId')! }),
          ...(url.searchParams.get('sessionId') === null ? {} : { sessionId: url.searchParams.get('sessionId')! }),
          sample: url.searchParams.get('sample') ?? '',
        }),
      })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** Read or replace one tavern workspace's worldbook. */
  private async handleWorldbook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    try {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, ...await this.worldbook(workspaceIdFromUrl(req)) })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' })
        return
      }
      const body = await readJsonObject(req, WORLDBOOK_BODY_MAX_BYTES)
      const workspaceId = optionalString(body, 'workspaceId') ?? workspaceIdFromUrl(req)
      sendJson(res, 200, { ok: true, ...await this.saveWorldbook(workspaceId, body.entries) })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** TEMPORARY: report live agent-preset compositions for diagnosis. */
  private async handleDebugPresets(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    try {
      const presets = (this.ctx as unknown as { get(name: string): unknown }).get('agentPresets') as
        | {
          inspectCompositions?: (ctx?: unknown) => unknown
          list?: () => Promise<unknown>
          remoteExportList?: () => Promise<unknown>
        }
        | undefined
      if (presets === undefined) {
        sendJson(res, 404, { ok: false, error: 'agentPresets is unavailable' })
        return
      }
      const safe = async <T>(operation: () => T | Promise<T>): Promise<unknown> => {
        try { return await operation() } catch (error) { return { error: errorText(error) } }
      }
      sendJson(res, 200, {
        ok: true,
        hostBuild: 'auto-bind-1',
        list: presets.list === undefined ? null : await safe(() => presets.list!()),
        roster: presets.remoteExportList === undefined ? null : await safe(() => presets.remoteExportList!()),
        inspectDefault: presets.inspectCompositions === undefined
          ? null
          : await safe(() => presets.inspectCompositions!()),
        inspectRoot: presets.inspectCompositions === undefined
          ? null
          : await safe(() => presets.inspectCompositions!(this.ctx)),
      })
    } catch (error) {
      this.fail(res, error)
    }
  }

  /** Answer one failed tavern request with the closest status category. */
  private fail(res: ServerResponse, error: unknown): void {
    if (error instanceof HttpRequestError) {
      sendJson(res, error.status, { ok: false, error: error.message })
      return
    }
    const status = error instanceof TavernInputError
      || error instanceof PromptLayoutInvalidError
      || error instanceof PromptLayoutVersionError
      || error instanceof CharacterCardInvalidError
      || error instanceof WorldbookInvalidError
      || error instanceof AgentConfigInvalidError
      ? 400
      : error instanceof TavernWorkspaceNotFoundError ? 404 : 500
    if (status === 500) this.ctx.logger.warn(`[dshtavern] tavern request failed: ${String(error)}`)
    sendJson(res, status, { ok: false, error: errorText(error) })
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Tavern workspace marker registry. */
    tavernWorkspaces: TavernWorkspaceService
  }
}

function toRecord(workspace: Workspace): TavernWorkspaceRecord {
  return { id: String(workspace.id), path: workspace.path, title: workspace.title }
}

function toView(workspace: TavernWorkspaceRecord, marker: TavernMarker): TavernWorkspaceView {
  return { workspaceId: workspace.id, path: workspace.path, title: workspace.title, marker }
}

/** Build the panel-facing prompt layout snapshot from a stored layout. */
async function promptSnapshot(
  workspace: TavernWorkspaceRecord,
  blocks: readonly PromptBlockState[],
  updatedAt: string | undefined,
  scope: PromptScope = 'character',
): Promise<PromptLayoutSnapshot> {
  return {
    workspaceId: workspace.id,
    workspaceTitle: workspace.title,
    workspacePath: workspace.path,
    scope,
    blocks: promptBlockViews({ schema: PROMPT_LAYOUT_SCHEMA, blocks }, scope),
    hasCharacterCard: await hasCharacterCards(workspace.path),
    ...(updatedAt === undefined ? {} : { savedAt: updatedAt }),
  }
}

/** Read the `scope` query parameter; defaults to the character prompt. */
function promptScopeFromUrl(req: IncomingMessage): PromptScope {
  const scope = new URL(req.url ?? '/', 'http://localhost').searchParams.get('scope')
  return scope === 'director' ? 'director' : 'character'
}

/** Read an optional `scope` body field, rejecting unknown values. */
function promptScopeFromBody(body: Record<string, unknown>): PromptScope | undefined {
  const scope = optionalString(body, 'scope')
  if (scope === undefined) return undefined
  if (scope !== 'director' && scope !== 'character') throw new PromptLayoutInvalidError(`未知的编排范围：${scope}`)
  return scope
}

/** Read the `workspaceId` query parameter, rejecting a missing one. */
function workspaceIdFromUrl(req: IncomingMessage): string {
  const workspaceId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('workspaceId')
  if (workspaceId === null || workspaceId.length === 0) throw new TavernInputError('缺少 workspaceId')
  return workspaceId
}

async function readMarkerText(directory: string): Promise<string | undefined> {
  try {
    return await readFile(markerPath(directory), 'utf8')
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * One director/character exchange inside a beat.
 *
 * A beat is a player turn; it may hold several of these when the director keeps
 * the scene going after a character speaks.
 */
/** Where a turn's speaking character came from. */
type SpeakerSource = BeatTurn['speakerSource'] & string

/**
 * Next stage sequence number.
 * @param stage - staged lines so far.
 * @returns one past the highest sequence.
 */
function nextSeq(stage: readonly StageEntry[]): number {
  return stage.reduce((max, entry) => Math.max(max, entry.seq), 0) + 1
}

/**
 * Extract the player's latest utterance from a loop-built request.
 *
 * The loop appends harness-authored user messages after the player's own — the
 * runtime-context snapshot and skill-change reminders — so those are skipped by
 * content, never by position.
 * @param options - the intercepted request.
 * @returns the last player-authored message text, bounded to the accepted size.
 */
/**
 * Extract the player's latest utterance from a loop-built request.
 *
 * The loop appends harness-authored user messages after the player's own — the
 * runtime-context snapshot and skill-change reminders — so those are skipped by
 * kind rather than position.
 * @param options - the intercepted loop request.
 * @param max - longest prefix forwarded; defaults to the shipped limit.
 * @returns the player's text, or an empty string when the turn has none.
 */
export function lastUserText(options: GenerateOptions, max: number = PLAYER_INPUT_MAX): string {
  for (let index = options.messages.length - 1; index >= 0; index -= 1) {
    const message = options.messages[index]
    if (message === undefined || message.role !== 'user') continue
    if (isRuntimeContextMessage(message) || hasSystemReminder(message)) continue
    const kind = messageSourceKind(message)
    // Only the player's own words are an utterance. Tavern triggers start a
    // turn but read their input elsewhere, and any other turn-starter (a
    // scheduled reminder, for instance) must never be replayed as if the player
    // had typed it.
    if (kind !== undefined && kind !== 'user') continue
    const text = message.content
      .filter(part => part.type === 'text')
      .map(part => (part as { text: string }).text)
      .join('\n')
      .trim()
    if (text.length > 0) return text.slice(0, max)
  }
  return ''
}

/**
 * Read one message's producer kind.
 * @param message - request message of either form.
 * @returns the source kind, or `undefined` for an unidentified one-shot input.
 */
function messageSourceKind(message: object): string | undefined {
  const source = (message as { source?: unknown }).source
  if (typeof source !== 'object' || source === null) return undefined
  const kind = (source as { kind?: unknown }).kind
  return typeof kind === 'string' ? kind : undefined
}

/**
 * Whether this turn was started by the opening action.
 * @param options - the intercepted loop request.
 * @returns true when the beat must stage the opening script.
 */
export function isOpeningRequest(options: GenerateOptions): boolean {
  return newestTriggerKind(options) === OPENING_SOURCE_KIND
}

/**
 * Whether this turn was started by the regenerate action rather than a prompt.
 *
 * The trigger carries its own source kind, so the check reads the newest
 * non-harness user message instead of matching text: the player could type the
 * same words.
 * @param options - the intercepted loop request.
 * @returns true when the beat must replay the previous one.
 */
export function isRegenerationRequest(options: GenerateOptions): boolean {
  return newestTriggerKind(options) === REGENERATE_SOURCE_KIND
}

/**
 * Source kind of a turn-starter this plugin does not own.
 *
 * A tavern session is still a DSH session, so features that wake it on their own
 * schedule deliver their messages here too. Those are not the player speaking:
 * treating one as an utterance lets a cron reminder's prompt text become the
 * beat's input and drives the story in a direction nobody asked for.
 * @param options - the intercepted loop request.
 * @returns the kind (for example `schedule`), or `undefined` for a player turn
 *   and for the two triggers this plugin queues itself.
 */
export function externalTriggerKind(options: GenerateOptions): string | undefined {
  const kind = newestTriggerKind(options)
  if (kind === undefined || kind === OPENING_SOURCE_KIND || kind === REGENERATE_SOURCE_KIND) return undefined
  return kind
}

/**
 * Source kind of the newest user message the player did not author.
 * @param options - the intercepted loop request.
 * @returns the kind, or `undefined` for an ordinary prompt.
 */
function newestTriggerKind(options: GenerateOptions): string | undefined {
  for (let index = options.messages.length - 1; index >= 0; index -= 1) {
    const message = options.messages[index]
    if (message === undefined || message.role !== 'user') continue
    if (isRuntimeContextMessage(message) || hasSystemReminder(message)) continue
    const kind = messageSourceKind(message)
    return kind === 'user' ? undefined : kind
  }
  return undefined
}

/** @returns a stream that reports a finished, empty reply. */
async function* emptyReply(): AsyncGenerator<StreamChunk> {
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/** @returns a usage accumulator seeded with four empty buckets. */
function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

/**
 * Fold one call's reported usage into the beat total.
 *
 * Buckets are disjoint, so a plain field-wise sum is the billed total. Calls
 * whose provider reported nothing leave the accumulator untouched.
 * @param target - accumulator mutated in place.
 * @param usage - usage from one call, when reported.
 */
function addUsage(target: TokenUsage, usage: TokenUsage | undefined): void {
  if (usage === undefined) return
  target.inputTokens += usage.inputTokens
  target.outputTokens += usage.outputTokens
  target.cacheReadTokens = (target.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0)
  target.cacheWriteTokens = (target.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
  if (usage.reasoningTokens !== undefined) {
    target.reasoningTokens = (target.reasoningTokens ?? 0) + usage.reasoningTokens
  }
}

/**
 * Build a single-text-block reply stream.
 *
 * Usage is forwarded as its own chunk before `finish`: the agent loop records
 * whatever usage chunk the stream carries, and the token-meter projection folds
 * it into the session totals.
 *
 * The text is emitted as one closed block, never as a token delta. DSH derives
 * output speed from the first token delta and the message settle time; this
 * reply is assembled after several sequential model calls, so a synthetic delta
 * emitted here would report hundreds of thousands of tok/s for a beat that
 * actually took seconds. Without a delta the loop records no decode window and
 * the speed pill stays absent, while token counts, cache rate, and the rendered
 * message are unaffected.
 * @param options - the intercepted request, used for provider attribution.
 * @param text - assistant text to emit.
 * @param usage - summed usage of every model call this beat made.
 * @returns the chunk stream.
 */
export async function* textReply(
  options: GenerateOptions,
  text: string,
  usage?: TokenUsage,
): AsyncGenerator<StreamChunk> {  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  if (usage !== undefined && (usage.inputTokens > 0 || usage.outputTokens > 0
    || (usage.cacheReadTokens ?? 0) > 0 || (usage.cacheWriteTokens ?? 0) > 0)) {
    yield { type: 'usage', usage: { ...usage, totalTokens: usage.inputTokens + usage.outputTokens
      + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) } }
  }
  yield { type: 'finish', reason: { kind: 'stop' } }
  void options
}

/** Read the optional tavern mode from a JSON body. */function tavernModeFromBody(body: Record<string, unknown>): TavernMode {
  const mode = optionalString(body, 'mode')
  if (mode === undefined) return 'rp'
  if (mode !== 'rp' && mode !== 'novel') throw new TavernInputError(`未知的酒馆模式：${mode}`)
  return mode
}

/**
 * Turn a display name into a file name safe on Windows and POSIX.
 *
 * Export is a download, not a write, so only characters that break a save
 * dialog need replacing; an empty result falls back so the name is never `.charc`.
 * @param name - card or workspace name.
 * @returns a usable base name without extension.
 */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .replace(/[.\s]+$/, '')
    .trim()
    .slice(0, 80)
  return cleaned.length > 0 ? cleaned : 'tavern'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether one message carries a DSH `<system-reminder>` injection. */
function hasSystemReminder(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return false
  return content.some((part) => {
    if (typeof part !== 'object' || part === null) return false
    const record = part as { type?: unknown; text?: unknown }
    return record.type === 'text'
      && typeof record.text === 'string'
      && record.text.includes('<system-reminder>')
  })
}

/** Whether one message is the harness runtime-context snapshot message. */
function isRuntimeContextMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return false
  return content.some((part) => {
    if (typeof part !== 'object' || part === null) return false
    const record = part as { type?: unknown; text?: unknown }
    return record.type === 'text'
      && typeof record.text === 'string'
      && record.text.startsWith('Current runtime context.')
  })
}

/**
 * Resolve the tavern root a session working directory names.
 *
 * Only the directory itself may carry the marker (D004): a session started in a
 * subdirectory is an ordinary DSH session, not a tavern session. Ancestors are
 * never consulted, so a tavern holding a nested project does not turn that
 * project's sessions into tavern sessions.
 *
 * Deliberately independent of the Cordis service graph: section text providers
 * and service wrappers outlive a plugin revision (agents keep their closures),
 * so they must not touch a possibly-disposed context.
 * @param directory - session working directory.
 * @returns the tavern root, or undefined when the directory is not a tavern.
 */
function tavernRootForCwd(directory: string | undefined): string | undefined {
  if (directory === undefined || directory.length === 0) return undefined
  try {
    return existsSync(join(directory, TAVERN_DIRECTORY, MARKER_FILE)) ? directory : undefined
  } catch {
    return undefined
  }
}

/** @param directory - session working directory. @returns whether it belongs to a tavern. */
function isTavernCwdSync(directory: string | undefined): boolean {
  return tavernRootForCwd(directory) !== undefined
}

/**
 * Render a tavern workspace's system prompt without any service access.
 * @param directory - session working directory.
 * @returns the rendered prompt, `''` for novel mode, or undefined outside taverns.
 */
function assembleWorkspacePromptSync(directory: string | undefined): string | undefined {
  const root = tavernRootForCwd(directory)
  if (root === undefined) return undefined
  let markerText: string
  try {
    markerText = readFileSync(markerPath(root), 'utf8')
  } catch {
    return undefined
  }
  const marker = parseMarker(markerText)
  if (marker === undefined) return undefined
  if (tavernModeOf(marker) !== 'rp') return ''
  try {
    return renderPromptText(promptBlockViews(readPromptLayoutSync(root)))
  } catch {
    return ''
  }
}

export default TavernWorkspaceService
