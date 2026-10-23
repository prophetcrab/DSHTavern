/**
 * DSH-Tavern story tracker sub-plugin.
 *
 * A separate plugin row (`dshtavern-tracker` in the bundle patch) that runs a
 * progress-tracking task beside the conversation. It never touches the agent
 * loop: a run reads the story a chat has already staged, asks a model to
 * restate it as a ledger, and writes the result to disk. Because it is its own
 * row, removing that row takes the whole feature offline — the routes vanish,
 * the toolbox entry reports the feature as unavailable, and the tavern itself
 * is unaffected.
 *
 * Two triggers, both configurable per workspace:
 * - after every N beats, and
 * - after every N minutes,
 * whichever comes first. A run is skipped while another one for the same chat
 * is still in flight, so a slow model cannot stack up requests.
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { HttpRequestError, allowLoopback, methodNotAllowed, optionalString, readJsonObject, sendJson } from '../http.js'
import { listCharacterCards } from '../character-card.js'
import { readStage, readWorld, storyDirectory } from '../stage.js'
import { listBeats, readRegenerations } from '../regenerate.js'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import {
  TRACKER_POLL_MS,
  TRACKER_SCHEMA,
  TrackerConfigInvalidError,
  defaultTrackerConfig,
  listTrackerSummaries,
  readTrackerConfig,
  readTrackerState,
  staleTurnsAfterWrite,
  trackerDue,
  trackedTurns,
  writeTrackerConfig,
  writeTrackerState,
  writeTrackerSummary,
} from './summary.js'
import type { TrackerConfig, TrackerState, TrackerSummary } from './summary.js'
import { buildTrackerMessage, buildTrackerSystem, parseTrackerReply, renderTranscript } from './prompt.js'

/** The slice of the LLM service a run needs. */
interface LlmStreamer {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** Service name this plugin publishes. */
export const TRACKER_SERVICE = 'tavernTracker'

/** Route serving the tracker snapshot and accepting actions. */
export const TRACKER_ROUTE = '/tavern-tracker/state'

/** Route the client probes to decide whether this sub-plugin is active. */
export const TRACKER_PING_ROUTE = '/tavern-tracker/ping'

/** Version stamped on every response, so the client can refuse a mismatch. */
export const TRACKER_API_SCHEMA = 1

/** One chat's tracking view. */
export interface TrackerChatView {
  readonly sessionId: string
  /** Newest beat the chat has produced. */
  readonly newestTurn: number
  /** Ledgers newest first. */
  readonly summaries: readonly TrackerSummary[]
  /**
   * Every turn the newest ledger has read, ascending; the turn rail marks these.
   *
   * A run reads the whole story up to its own turn, so this runs from 1 to the
   * newest ledger's turn rather than listing only the turns that own a file.
   */
  readonly trackedTurns: readonly number[]
  /** How many runs have written a ledger. */
  readonly runCount: number
  /** Whether a run for this chat is in flight. */
  readonly running: boolean
  /**
   * Turns whose reply was regenerated after the newest ledger was written.
   *
   * A ledger describes the story as it stood; regenerating a covered beat
   * replaced part of that story, so the ledger no longer matches what is on
   * stage. The turn rail stops marking the affected range and the panel says
   * the ledger is out of date until the next run.
   */
  readonly staleTurns: readonly number[]
  /** Why the last automatic run could not write a ledger, when it failed. */
  readonly lastError?: string
}

/** Everything the tracker panel needs for one render. */
export interface TrackerSnapshot {
  readonly schema: number
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  readonly config: TrackerConfig
  readonly defaults: TrackerConfig
  /** Every chat in this workspace that has a story on disk. */
  readonly chats: readonly TrackerChatView[]
  readonly generatedAt: string
}

/** Workspace facts the tracker reads. */
interface WorkspaceSource {
  list(): readonly { id: string; path: string; title: string }[]
  get(id: string): { id: string; path: string; title: string } | undefined
}

/**
 * Host plugin: schedules and runs progress tracking for one tavern workspace.
 *
 * Loads with `workspaceRegistry`; `webServer` and `llm` are injected optionally
 * so a profile without the Web layer or a model route still loads the plugin
 * and simply reports the feature as unavailable.
 */
export class TavernTrackerService extends Service {
  static inject = ['workspaceRegistry']
  private readonly workspaces: WorkspaceSource
  /** Chats with a run in flight, so a slow model cannot stack requests. */
  private readonly running = new Set<string>()
  /** Last failure per chat, cleared by the next successful run. */
  private readonly failures = new Map<string, string>()

  /**
   * @param ctx - Cordis context carrying the workspace registry.
   */
  constructor(ctx: Context) {
    super(ctx, TRACKER_SERVICE)
    this.workspaces = ctx.workspaceRegistry as unknown as WorkspaceSource
    this.registerRoutes()
    this.startScheduler()
  }

  /**
   * Read one workspace's tracker snapshot.
   * @param workspaceId - registered tavern workspace id.
   * @returns the panel's read model.
   * @throws Error when the workspace is not registered.
   */
  async snapshot(workspaceId: string): Promise<TrackerSnapshot> {
    const workspace = this.workspaces.get(workspaceId)
    if (workspace === undefined) throw new Error(`工作区不存在：${workspaceId}`)
    const config = await readTrackerConfig(workspace.path)
    const chats = await this.listChats(workspace.path)
    const views: TrackerChatView[] = []
    for (const sessionId of chats) {
      const [summaries, newestTurn, staleTurns] = await Promise.all([
        listTrackerSummaries(workspace.path, sessionId),
        this.newestTurnOf(workspace.path, sessionId),
        this.staleTurnsOf(workspace.path, sessionId),
      ])
      const failure = this.failures.get(cacheKey(workspace.path, sessionId))
      views.push({
        sessionId,
        newestTurn,
        summaries,
        trackedTurns: trackedTurns(summaries),
        runCount: summaries.length,
        running: this.running.has(cacheKey(workspace.path, sessionId)),
        staleTurns,
        ...(failure === undefined ? {} : { lastError: failure }),
      })
    }
    views.sort((left, right) => right.newestTurn - left.newestTurn)
    return {
      schema: TRACKER_API_SCHEMA,
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      workspacePath: workspace.path,
      config,
      defaults: defaultTrackerConfig(),
      chats: views,
      generatedAt: new Date().toISOString(),
    }
  }

  /**
   * Persist one workspace's tracker settings.
   * @param workspaceId - registered tavern workspace id.
   * @param value - full config payload, validated before writing.
   * @returns the stored config.
   */
  async saveConfig(workspaceId: string, value: unknown): Promise<TrackerConfig> {
    const workspace = this.workspaces.get(workspaceId)
    if (workspace === undefined) throw new Error(`工作区不存在：${workspaceId}`)
    return writeTrackerConfig(workspace.path, value)
  }

  /**
   * Run one tracking pass for a chat now, ignoring the triggers.
   *
   * The run is async: the caller gets the chat identity back immediately and
   * polls the snapshot for the ledger. A second request for a chat already
   * running returns `started: false` instead of queueing another model call.
   * @param workspaceId - registered tavern workspace id.
   * @param sessionId - chat identity.
   * @returns whether a run started.
   */
  async track(workspaceId: string, sessionId: string): Promise<{ started: boolean; reason?: string }> {
    const workspace = this.workspaces.get(workspaceId)
    if (workspace === undefined) throw new Error(`工作区不存在：${workspaceId}`)
    const key = cacheKey(workspace.path, sessionId)
    if (this.running.has(key)) return { started: false, reason: '这个会话已经在追踪中' }
    const newestTurn = await this.newestTurnOf(workspace.path, sessionId)
    if (newestTurn === 0) return { started: false, reason: '这个会话还没有可追踪的剧情' }
    const config = await readTrackerConfig(workspace.path)
    this.running.add(key)
    void this.runTracking(workspace.path, sessionId, config, newestTurn)
    return { started: true }
  }

  /**
   * Start the automatic scheduler.
   *
   * A single interval scans every registered tavern workspace: it reads each
   * chat's on-disk state, so a restart resumes the same schedule instead of
   * starting over, and a disabled config costs one file read per chat.
   *
   * The interval is registered as an effect so unloading the plugin row stops
   * it, which is what makes the sub-plugin removable at runtime.
   */
  private startScheduler(): void {
    this.ctx.effect(() => {
      const timer = setInterval(() => { void this.schedule() }, TRACKER_POLL_MS)
      // A tracking run must never keep the process alive on its own.
      timer.unref?.()
      return () => { clearInterval(timer) }
    }, 'dshtavern-tracker: schedule')
  }

  /** One scheduler tick: start a run for every chat that is due. */
  private async schedule(): Promise<void> {
    for (const workspace of this.workspaces.list()) {
      let config: TrackerConfig
      try {
        config = await readTrackerConfig(workspace.path)
      } catch (error) {
        this.ctx.logger.warn(`[dshtavern-tracker] cannot read config for '${workspace.path}': ${String(error)}`)
        continue
      }
      if (!config.enabled) continue
      let chats: string[]
      try {
        chats = await this.listChats(workspace.path)
      } catch (error) {
        this.ctx.logger.warn(`[dshtavern-tracker] cannot list stories in '${workspace.path}': ${String(error)}`)
        continue
      }
      for (const sessionId of chats) {
        const key = cacheKey(workspace.path, sessionId)
        if (this.running.has(key)) continue
        try {
          const [state, newestTurn] = await Promise.all([
            readTrackerState(workspace.path, sessionId),
            this.newestTurnOf(workspace.path, sessionId),
          ])
          if (!trackerDue(config, state, newestTurn, Date.now())) continue
          this.running.add(key)
          void this.runTracking(workspace.path, sessionId, config, newestTurn)
        } catch (error) {
          this.ctx.logger.warn(`[dshtavern-tracker] scheduling failed for '${sessionId}': ${String(error)}`)
        }
      }
    }
  }

  /**
   * Run one tracking pass and store its ledger.
   *
   * Nothing here touches the agent loop or the story: a failed run leaves the
   * previous state untouched so the next tick retries the same range.
   * @param workspacePath - tavern workspace root.
   * @param sessionId - chat identity.
   * @param config - workspace settings.
   * @param newestTurn - newest beat the run should cover.
   */
  private async runTracking(
    workspacePath: string,
    sessionId: string,
    config: TrackerConfig,
    newestTurn: number,
  ): Promise<void> {
    const key = cacheKey(workspacePath, sessionId)
    try {
      const state = await readTrackerState(workspacePath, sessionId)
      const [stage, world, cards] = await Promise.all([
        readStage(workspacePath, sessionId),
        readWorld(workspacePath, sessionId),
        listCharacterCards(workspacePath),
      ])
      const transcript = renderTranscript(stage, config.maxTranscriptChars)
      if (transcript.chars === 0) {
        this.failures.set(key, '这个会话还没有写入舞台的剧情')
        return
      }
      const selection = config.model ?? this.defaultSelection()
      if (selection === undefined) {
        this.failures.set(key, '当前部署没有可用的模型路由')
        return
      }
      const llm = this.llm()
      if (llm === undefined) {
        this.failures.set(key, '当前部署没有 LLM 服务')
        return
      }
      const system = buildTrackerSystem({ cards: cards.cards, world })
      const message = buildTrackerMessage(transcript.text, newestTurn)
      let reply = ''
      let usage: TokenUsage | undefined
      const stream = llm.stream({
        provider: selection.provider,
        model: selection.model,
        system,
        messages: [createUserMessage({ content: [{ type: 'text', text: message }], source: { kind: 'user' } })],
      })
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') reply += chunk.text
        else if (chunk.type === 'usage') usage = chunk.usage
        else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
          throw new Error(chunk.reason.failure.message)
        }
      }
      const parsed = parseTrackerReply(reply, cards.cards)
      if (parsed === undefined) {
        this.failures.set(key, '模型没有返回可用的摘要 JSON')
        return
      }
      const summary: TrackerSummary = {
        schema: TRACKER_SCHEMA,
        turn: newestTurn,
        at: new Date().toISOString(),
        model: `${selection.provider}/${selection.model}`,
        world: parsed.world,
        characters: parsed.characters,
        transcriptChars: transcript.chars,
        ...(state.lastTurn > 0 ? { sinceTurn: state.lastTurn } : {}),
      }
      await writeTrackerSummary(workspacePath, sessionId, summary)
      await writeTrackerState(workspacePath, sessionId, {
        schema: TRACKER_SCHEMA,
        lastTurn: newestTurn,
        lastAt: summary.at,
      })
      this.failures.delete(key)
      this.ctx.logger.info(`[dshtavern-tracker] tracked '${sessionId}' through turn ${newestTurn} (${usage?.outputTokens ?? 0} output tokens)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.failures.set(key, message)
      this.ctx.logger.warn(`[dshtavern-tracker] run failed for '${sessionId}': ${message}`)
    } finally {
      this.running.delete(key)
    }
  }

  /** @returns the LLM service when the profile has one. */
  private llm(): LlmStreamer | undefined {
    return (this.ctx as unknown as { get(name: string): unknown }).get('llm') as LlmStreamer | undefined
  }

  /**
   * Provider and model a run uses when the workspace names none.
   * @returns the deployment default, or `undefined` when unavailable.
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
   * Chats in one workspace that have a story on disk.
   * @param workspacePath - tavern workspace root.
   * @returns session ids.
   */
  private async listChats(workspacePath: string): Promise<string[]> {
    // `storyDirectory(…, undefined)` is the state directory; its `stories/`
    // child holds one directory per chat.
    const storiesRoot = join(storyDirectory(workspacePath, undefined), 'stories')
    try {
      const entries = await readdir(storiesRoot, { withFileTypes: true })
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
    } catch {
      return []
    }
  }

  /**
   * Turns covered by the newest ledger that a later regeneration replaced.
   * @param workspacePath - tavern workspace root.
   * @param sessionId - chat identity.
   * @returns superseded turns inside the ledger's range, ascending.
   */
  private async staleTurnsOf(workspacePath: string, sessionId: string): Promise<number[]> {
    const directory = storyDirectory(workspacePath, sessionId)
    const [records, summaries] = await Promise.all([
      readRegenerations(directory),
      listTrackerSummaries(workspacePath, sessionId),
    ])
    const newest = summaries[0]
    if (newest === undefined) return []
    return staleTurnsAfterWrite(records, newest.turn, Date.parse(newest.at))
  }

  /**
   * Newest beat recorded for one chat.
   * @param workspacePath - tavern workspace root.
   * @param sessionId - chat identity.
   * @returns the newest turn, or 0 when the chat has no beat yet.
   */
  private async newestTurnOf(workspacePath: string, sessionId: string): Promise<number> {
    const beats = await listBeats(storyDirectory(workspacePath, sessionId))
    const newest = beats[0]
    if (newest === undefined) return 0
    return newest.record.turn ?? 0
  }

  private registerRoutes(): void {
    this.ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: TRACKER_PING_ROUTE,
        handler: (req: IncomingMessage, res: ServerResponse) => {
          if (!allowLoopback(req, res)) return
          if (req.method !== 'GET') {
            methodNotAllowed(res, 'GET')
            return
          }
          sendJson(res, 200, { ok: true, schema: TRACKER_API_SCHEMA })
        },
      }), 'dshtavern-tracker: ping')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: TRACKER_ROUTE,
        handler: (req: IncomingMessage, res: ServerResponse) => { void this.handleState(req, res) },
      }), 'dshtavern-tracker: state')
    })
  }

  /** Read the snapshot, save settings, or start a run. */
  private async handleState(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, res)) return
    try {
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        const workspaceId = workspaceIdFromUrl(req)
        sendJson(res, 200, { ok: true, ...await this.snapshot(workspaceId) })
        return
      }
      if (method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' })
        return
      }
      const body = await readJsonObject(req)
      const workspaceId = optionalString(body, 'workspaceId')
      if (workspaceId === undefined) throw new TrackerConfigInvalidError('缺少 workspaceId')
      const action = optionalString(body, 'action') ?? 'save'
      if (action === 'track') {
        const sessionId = optionalString(body, 'sessionId')
        if (sessionId === undefined) throw new TrackerConfigInvalidError('缺少 sessionId')
        sendJson(res, 200, { ok: true, ...await this.track(workspaceId, sessionId) })
        return
      }
      if (action !== 'save') throw new TrackerConfigInvalidError(`未知操作：${action}`)
      const config = body.reset === true
        ? await this.saveConfig(workspaceId, defaultTrackerConfig())
        : await this.saveConfig(workspaceId, body.config)
      sendJson(res, 200, { ok: true, config })
    } catch (error) {
      const status = error instanceof HttpRequestError
        ? error.status
        : error instanceof TrackerConfigInvalidError ? 400 : 500
      if (status === 500) this.ctx.logger.warn(`[dshtavern-tracker] request failed: ${String(error)}`)
      sendJson(res, status, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Cache key for one chat inside one workspace. */
function cacheKey(workspacePath: string, sessionId: string): string {
  return `${workspacePath}\u0000${sessionId}`
}

/** Read the `workspaceId` query parameter, rejecting a missing one. */
function workspaceIdFromUrl(req: IncomingMessage): string {
  const workspaceId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('workspaceId')
  if (workspaceId === null || workspaceId.length === 0) throw new TrackerConfigInvalidError('缺少 workspaceId')
  return workspaceId
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Tavern story tracker. */
    tavernTracker: TavernTrackerService
  }
}

export type { TrackerConfig, TrackerState, TrackerSummary }

export default TavernTrackerService
