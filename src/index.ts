/**
 * DSHTavern host plugin: identifies tavern workspaces by a marker file.
 *
 * The marker is the single source of truth for "this directory is a tavern".
 * DSH workspace records cannot carry plugin metadata, so the plugin scans the
 * registered workspace directories on demand instead of extending them.
 * @module dshtavern
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, parse } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { createUserMessage, isAgentLoopRequest, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Workspace, WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { allowLoopback, methodNotAllowed, optionalString, readJsonObject, sendJson } from './http.js'
import {
  CharacterCardInvalidError,
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
  parseDirectorReply,
  renderBeatMarkdown,
  resolveSpeaker,
  mentionedSpeaker,
  PLAYER_INPUT_MAX,
} from './orchestrator.js'
import { fromCardEntries } from './worldbook.js'
import { buildPreview } from './preview.js'
import type { PromptPreview } from './preview.js'
import type { BeatRecord, BeatSegment, CastMember, DirectorDecision } from './orchestrator.js'
import { appendStage, readStage, readWorld, storyDirectory, writeWorld } from './stage.js'
import {
  AgentConfigInvalidError,
  defaultAgentConfig,
  normalizeAgentConfig,
  readAgentConfig,
  writeAgentConfig,
} from './agent-config.js'
import type { AgentModelChoice, TavernAgentConfig } from './agent-config.js'
import {
  WorldbookInvalidError,
  exportWorldbookText,
  parseWorldbookImport,
  readWorldbook,
  writeWorldbook,
} from './worldbook.js'
import type { WorldbookEntry, WorldbookFile } from './worldbook.js'
import type { StageEntry } from './stage.js'
import {
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

/** Marker file name inside {@link TAVERN_DIRECTORY}. */
export const MARKER_FILE = 'tavern.json'

/** Marker schema version this build reads and writes. */
export const MARKER_SCHEMA = 1

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
   * @param options - scope, optional card, and the sample line to scan.
   * @returns the assembled system prompt and the lore it activated.
   */
  async previewPrompt(
    workspaceId: string,
    options: { scope?: PromptScope; cardId?: string; sample?: string } = {},
  ): Promise<PromptPreview> {
    const workspace = await this.requireTavernWorkspace(workspaceId)
    const scope: PromptScope = options.scope === 'director' ? 'director' : 'character'
    const [layout, cards, book] = await Promise.all([
      readPromptLayout(workspace.path, scope),
      listCharacterCards(workspace.path),
      readWorldbook(workspace.path),
    ])
    return buildPreview({
      scope,
      layout,
      cards: cards.cards,
      ...(options.cardId === undefined ? {} : { cardId: options.cardId }),
      worldbook: book.entries,
      ...(options.sample === undefined ? {} : { sample: options.sample }),
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
   */
  private hideTavernPresetFromRoster(): void {
    const presets = (this.ctx as unknown as { get(name: string): unknown }).get('agentPresets') as
      | { remoteExportList?: () => Promise<{ presets: Array<{ id?: string }> }> }
      | undefined
    if (presets?.remoteExportList === undefined) return
    const marker = Symbol.for('dshtavern.roster-filter')
    if ((presets as Record<symbol, unknown>)[marker] === true) return
    const hidden = new Set(['tavern', 'tavern-rp', 'tavern-novel'])
    const original = presets.remoteExportList.bind(presets)
    presets.remoteExportList = async () => {
      const roster = await original()
      return { ...roster, presets: roster.presets.filter(row => row.id === undefined || !hidden.has(row.id)) }
    }
    ;(presets as Record<symbol, unknown>)[marker] = true
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
    // Stage and world belong to this chat: another chat in the same tavern is a
    // different story and must start from an empty stage.
    const story = options.sessionId === undefined ? undefined : String(options.sessionId)
    const cards = listCharacterCardsSync(cwd)
    if (cards.length === 0) {
      const message = '这个酒馆还没有角色卡。先在工具箱的「角色卡」里创建一张，再开始对话。'
      yield* textReply(options, message)
      return
    }
    const world = await readWorld(cwd, story)
    const stage = await readStage(cwd, story)
    const cast = cards.map(card => ({ id: card.id, name: card.name, brief: cardBrief(card) }))
    const config = await readAgentConfig(cwd)
    const playerInput = lastUserText(options, config.playerInputMax)
    const layout = await readPromptLayout(cwd)
    const directorLayout = await readPromptLayout(cwd, 'director')
    const workspaceBook = await readWorldbook(cwd)
    // A player naming a character outranks the director's pick; the director is
    // a fallback that keeps the scene moving, not the final word on who answers.
    const addressed = config.honorPlayerMention ? mentionedSpeaker(playerInput, cast) : undefined

    const segments: BeatSegment[] = []
    const spoken: CastMember[] = []
    const turns: BeatTurn[] = []
    const staged: Omit<StageEntry, 'seq' | 'at'>[] = []
    // Sum of every model call this beat made. The orchestrator stands in for the
    // loop's own call, so it owns forwarding usage back to the loop.
    const beatUsage = emptyUsage()
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
      ], config.directorModel)
      addUsage(beatUsage, directorResult.usage)
      const directorReply = directorResult.text
      const decision = parseDirectorReply(directorReply)
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
      ], config.characterModel)
      addUsage(beatUsage, characterResult.usage)
      const speech = characterResult.text.trim()
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

    if (staged.length > 0) await appendStage(cwd, staged, story)
    if (inner.length > 0) {
      await writeWorld(cwd, {
        scene: segments.find(segment => segment.kind === 'narration')?.text ?? world.scene,
        facts: world.facts,
        hidden: [...world.hidden, inner],
      }, story)
    }
    await this.writeBeat(cwd, {
      at: new Date().toISOString(),
      playerInput,
      directorSystem: turns[0]?.directorSystem ?? '',
      directorReply: turns[0]?.directorReply ?? '',
      decision: turns[0]?.decision ?? { narration: '', inner: '' },
      turns,
    }, story)

    // An empty beat means every model call returned nothing (or the director
    // produced no narration and named no speaker). Reporting that beats a blank
    // message the player cannot tell apart from a rendering failure.
    const rendered = renderBeatMarkdown(segments)
    yield* textReply(options, rendered.length > 0 ? rendered : EMPTY_BEAT_NOTICE, beatUsage)
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
   * @returns the concatenated text output and the call's usage, when reported.
   */
  private async complete(
    options: GenerateOptions,
    system: string,
    messages: readonly { role: 'user'; text: string }[],
    choice?: AgentModelChoice,
  ): Promise<{ text: string; usage?: TokenUsage }> {
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
    })
    let text = ''
    let usage: TokenUsage | undefined
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'usage') usage = chunk.usage
      else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
        throw new Error(`tavern model call failed: ${chunk.reason.failure.message}`)
      }
    }
    return usage === undefined ? { text } : { text, usage }
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
   */
  private installRequiredContextFilter(): void {
    this.ctx.inject(['systemPrompt'], (scoped) => {
      const systemPrompt = scoped.systemPrompt as unknown as {
        refreshContext?: (assembly: unknown, context?: { agent?: Agent }) => { contexts: Array<{ name: string }> }
      }
      if (systemPrompt.refreshContext === undefined) return
      // Always wrap the prototype method, never the previous wrapper: a stale
      // wrapper from an earlier plugin revision captured a disposed context and
      // would throw `inactive context` on every assembly.
      const prototype = Object.getPrototypeOf(systemPrompt) as {
        refreshContext: typeof systemPrompt.refreshContext
      }
      const base = prototype.refreshContext
      systemPrompt.refreshContext = (assembly, context) => {
        const refreshed = base.call(systemPrompt, assembly, context)
        const cwd = context?.agent?.session.header.cwd
        if (cwd === undefined || !isTavernCwdSync(cwd)) return refreshed
        return {
          ...refreshed,
          contexts: refreshed.contexts.filter(entry => entry.name === 'working-directory:current'),
        }
      }
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
      const body = await readJsonObject(req)
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
      const body = await readJsonObject(req)
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
      const body = await readJsonObject(req)
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
      const body = await readJsonObject(req)
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
      const body = await readJsonObject(req)
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
interface BeatTurn {
  directorSystem: string
  directorReply: string
  decision: DirectorDecision
  /** Route and model the director call used. */
  directorModel?: { readonly provider: string; readonly model: string }
  /** Route and model the character call used. */
  characterModel?: { readonly provider: string; readonly model: string }
  /** How the speaking character was chosen, when one spoke. */
  speakerSource?: SpeakerSource
  /** Character the orchestrator actually used; differs from the director's pick when overridden. */
  effectiveSpeaker?: { readonly id: string; readonly name: string }
  characterSystem?: string
  characterPromptMessages?: readonly { role: string; text: string }[]
  speech?: string
}

/** Where a turn's speaking character came from. */
type SpeakerSource = 'director' | 'player-mention' | 'fallback-first'

/**
 * Next stage sequence number.
 * @param stage - staged lines so far.
 * @returns one past the highest sequence.
 */
function nextSeq(stage: readonly StageEntry[]): number {
  return stage.reduce((max, entry) => Math.max(max, entry.seq), 0) + 1
}

/**
 * One-line cast brief: the card's first line of description, else its tags.
 * @param card - cast member's card.
 * @returns a short identifying phrase.
 */
function cardBrief(card: CharacterCard): string {
  const firstLine = card.description.split('\n').map(line => line.trim()).find(line => line.length > 0)
  if (firstLine !== undefined) return firstLine.slice(0, 60)
  return card.tags.slice(0, 3).join(' · ') || '（无简介）'
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
    const text = message.content
      .filter(part => part.type === 'text')
      .map(part => (part as { text: string }).text)
      .join('\n')
      .trim()
    if (text.length > 0) return text.slice(0, max)
  }
  return ''
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

/** Normalise a directory for prefix comparison (separators, trailing slash, case). */
function normalizeDirectory(directory: string): string {
  return directory.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

/**
 * Find the tavern workspace root containing a session cwd.
 *
 * Deliberately independent of the Cordis service graph: section text providers
 * and service wrappers outlive a plugin revision (agents keep their closures),
 * so they must not touch a possibly-disposed context.
 * @param directory - session working directory.
 * @returns the tavern root, or undefined when the cwd is not inside one.
 */
function tavernRootForCwd(directory: string | undefined): string | undefined {
  if (directory === undefined || directory.length === 0) return undefined
  let current = directory
  for (let depth = 0; depth < 4; depth += 1) {
    try {
      if (existsSync(join(current, TAVERN_DIRECTORY, MARKER_FILE))) return current
    } catch {
      return undefined
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
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
