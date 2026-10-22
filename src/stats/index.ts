/**
 * DSH-Tavern usage statistics sub-plugin (host half).
 *
 * A separate plugin row (`dshtavern-stats` in the bundle patch) that serves one
 * read-only route for the tavern toolbox: token spend per workspace and per
 * session, context occupancy, and cache-hit rate.
 *
 * Every figure comes from the durable session projections `token-meter` already
 * registers (`tokenUsage`, `contextPressure`) plus the session header's title
 * projection. Nothing is counted here that the session log does not already
 * record, so a reload or a replay reports the same numbers.
 *
 * Removing the `dshtavern-stats` row unregisters the routes; the toolbox entry
 * then reports the feature as unavailable, and the tavern plugin is unaffected.
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { allowLoopback, methodNotAllowed, sendJson } from '../http.js'
import type { Session } from '@deepseek-ai/dsh-session'

/** Service name this plugin publishes. */
export const USAGE_SERVICE = 'tavernUsage'

/** Route serving the usage snapshot. */
export const USAGE_ROUTE = '/tavern-stats/state'

/** Route the client probes to decide whether this sub-plugin is active. */
export const USAGE_PING_ROUTE = '/tavern-stats/ping'

/** Version stamped on every response, so the client can refuse a mismatch. */
export const USAGE_SCHEMA = 1

/** Disjoint provider usage buckets, mirroring `TokenUsage`. */
export interface UsageBuckets {
  readonly uncachedInputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly outputTokens: number
}

/** Context occupancy of one session. */
export interface ContextUsageView {
  /** Tokens the next request would carry, when the provider reported a sample. */
  readonly usedTokens?: number
  /** Model context window, when the route declares one. */
  readonly contextWindow?: number
  /** `usedTokens / contextWindow`, clamped to 0..1. */
  readonly ratio?: number
}

/** One session's usage. */
export interface SessionUsageView {
  readonly sessionId: string
  readonly title?: string
  readonly createdAt?: number
  /** Sum of all four buckets. */
  readonly totalTokens: number
  readonly buckets: UsageBuckets
  /** `cacheRead / (cacheRead + uncachedInput)`; absent when no prompt tokens were reported. */
  readonly cacheHitRate?: number
  readonly context: ContextUsageView
}

/** One workspace's usage snapshot. */
export interface UsageSnapshot {
  readonly schema: number
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  /** Session the toolbox was opened from, when known. */
  readonly currentSessionId?: string
  /** Sum over every live session in this workspace. */
  readonly totals: UsageBuckets & { totalTokens: number; sessionCount: number; cacheHitRate?: number }
  /** The current session's own usage, when it is live. */
  readonly current?: SessionUsageView
  /** Every live tavern session, newest first. */
  readonly sessions: readonly SessionUsageView[]
  /** Whether the projection units this plugin reads were registered. */
  readonly projectionsAvailable: boolean
  readonly generatedAt: string
}

const ZERO: UsageBuckets = {
  uncachedInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
}

/** Sum four disjoint buckets. */
function totalOf(buckets: UsageBuckets): number {
  return buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens + buckets.outputTokens
}

/** Cache-hit share of the prompt tokens that could have been cached. */
function hitRateOf(buckets: UsageBuckets): number | undefined {
  const prompt = buckets.uncachedInputTokens + buckets.cacheReadTokens
  if (prompt === 0) return undefined
  return buckets.cacheReadTokens / prompt
}

function addBuckets(left: UsageBuckets, right: UsageBuckets): UsageBuckets {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  }
}

/** Normalize a path for containment checks. */
function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

/**
 * Whether one session's working directory sits inside a workspace.
 * @param cwd - session working directory.
 * @param root - workspace directory.
 * @returns true for the workspace root itself or any descendant.
 */
export function isInsideWorkspace(cwd: string | undefined, root: string): boolean {
  if (cwd === undefined || cwd.length === 0) return false
  const normalizedCwd = normalizePath(cwd)
  const normalizedRoot = normalizePath(root)
  return normalizedCwd === normalizedRoot || normalizedCwd.startsWith(`${normalizedRoot}/`)
}

/** Projection keys this plugin reads. */
const PROJECTION_KEYS = ['tokenUsage', 'contextPressure', 'title'] as const

/** The subset of the projection registry this plugin needs. */
interface ProjectionReader {
  snapshot(session: Session, keys?: readonly string[]): { readonly values: Record<string, unknown> }
}

/** Shape of token-meter's `tokenUsage` view. */
interface TokenUsageView {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** Shape of token-meter's `contextPressure` view. */
interface ContextPressureView {
  readonly pressureTokens?: number
  readonly projectedTokens?: number
  readonly contextWindow?: number
}

/**
 * Read one session's usage from the durable projections.
 * @param session - live session.
 * @param projections - projection registry, when registered.
 * @returns that session's usage view.
 */
export function readSessionUsage(session: Session, projections: ProjectionReader | undefined): SessionUsageView {
  const header = session.header
  const values = projections?.snapshot(session, PROJECTION_KEYS).values ?? {}
  const usage = values.tokenUsage as TokenUsageView | undefined
  const pressure = values.contextPressure as ContextPressureView | undefined
  const title = typeof values.title === 'string' ? values.title : undefined
  const buckets: UsageBuckets = usage === undefined
    ? ZERO
    : {
      uncachedInputTokens: usage.uncachedInputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
    }
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  const contextWindow = pressure?.contextWindow
  const ratio = usedTokens !== undefined && contextWindow !== undefined && contextWindow > 0
    ? Math.min(1, Math.max(0, usedTokens / contextWindow))
    : undefined
  return {
    sessionId: String(session.id),
    ...(title === undefined ? {} : { title }),
    ...(header.createdAt === undefined ? {} : { createdAt: header.createdAt }),
    totalTokens: totalOf(buckets),
    buckets,
    ...(hitRateOf(buckets) === undefined ? {} : { cacheHitRate: hitRateOf(buckets) }),
    context: {
      ...(usedTokens === undefined ? {} : { usedTokens }),
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(ratio === undefined ? {} : { ratio }),
    },
  }
}

/**
 * Aggregate usage for the live sessions of one workspace.
 * @param input - workspace identity, every live session, and the projection reader.
 * @returns the snapshot the toolbox renders.
 */
export function buildUsageSnapshot(input: {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  readonly sessions: readonly Session[]
  readonly currentSessionId?: string
  readonly projections?: ProjectionReader
}): UsageSnapshot {
  const views: SessionUsageView[] = []
  for (const session of input.sessions) {
    if (!isInsideWorkspace(session.header.cwd, input.workspacePath)) continue
    views.push(readSessionUsage(session, input.projections))
  }
  views.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
  const buckets = views.reduce<UsageBuckets>(
    (sum, view) => addBuckets(sum, view.buckets),
    ZERO,
  )
  const current = input.currentSessionId === undefined
    ? undefined
    : views.find(view => view.sessionId === input.currentSessionId)
  return {
    schema: USAGE_SCHEMA,
    workspaceId: input.workspaceId,
    workspaceTitle: input.workspaceTitle,
    workspacePath: input.workspacePath,
    ...(input.currentSessionId === undefined ? {} : { currentSessionId: input.currentSessionId }),
    totals: {
      ...buckets,
      totalTokens: totalOf(buckets),
      sessionCount: views.length,
      ...(hitRateOf(buckets) === undefined ? {} : { cacheHitRate: hitRateOf(buckets) }),
    },
    ...(current === undefined ? {} : { current }),
    sessions: views,
    projectionsAvailable: input.projections !== undefined,
    generatedAt: new Date().toISOString(),
  }
}

/** Workspace facts the snapshot needs. */
interface WorkspaceSource {
  list(): readonly { id: string; path: string; title: string }[]
}

/** Session store surface this plugin reads. */
interface SessionSource {
  list(): Session[]
}

/**
 * Host plugin: resolves the tavern workspace and serves its usage snapshot.
 *
 * Loads with `sessions` and `workspaceRegistry`; the projection registry is read
 * optionally so the plugin still answers (with `projectionsAvailable: false`)
 * on a profile that omits token-meter.
 */
export class TavernUsageService extends Service {
  static inject = ['workspaceRegistry', 'sessions', 'webServer']

  private readonly workspaces: WorkspaceSource
  private readonly sessions: SessionSource

  /**
   * @param ctx - Cordis context carrying the workspace, session, and web services.
   */
  constructor(ctx: Context) {
    super(ctx, USAGE_SERVICE)
    this.workspaces = ctx.workspaceRegistry as unknown as WorkspaceSource
    this.sessions = ctx.sessions as unknown as SessionSource
    this.registerRoutes()
  }

  /** @returns the projection registry when token-meter registered it. */
  private projections(): ProjectionReader | undefined {
    return (this.ctx as unknown as { get(name: string): unknown }).get('sessionProjections') as
      | ProjectionReader
      | undefined
  }

  /**
   * Build the snapshot for one workspace.
   * @param workspaceId - registered workspace id.
   * @param currentSessionId - session the toolbox was opened from.
   * @returns the usage snapshot.
   * @throws Error when the workspace is not registered.
   */
  snapshot(workspaceId: string, currentSessionId?: string): UsageSnapshot {
    const workspace = this.workspaces.list().find(entry => entry.id === workspaceId)
    if (workspace === undefined) throw new Error(`工作区不存在：${workspaceId}`)
    return buildUsageSnapshot({
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      workspacePath: workspace.path,
      sessions: this.sessions.list(),
      ...(currentSessionId === undefined ? {} : { currentSessionId }),
      ...(this.projections() === undefined ? {} : { projections: this.projections() }),
    })
  }

  private registerRoutes(): void {
    this.ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: USAGE_PING_ROUTE,
        handler: (req: IncomingMessage, res: ServerResponse) => {
          if (!allowLoopback(req, res)) return
          if (req.method !== 'GET') {
            methodNotAllowed(res, 'GET')
            return
          }
          sendJson(res, 200, { ok: true, schema: USAGE_SCHEMA })
        },
      }), 'dshtavern-stats: ping')
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: USAGE_ROUTE,
        handler: (req: IncomingMessage, res: ServerResponse) => {
          if (!allowLoopback(req, res)) return
          if (req.method !== 'GET') {
            methodNotAllowed(res, 'GET')
            return
          }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const workspaceId = url.searchParams.get('workspaceId')
          if (workspaceId === null || workspaceId.length === 0) {
            sendJson(res, 400, { ok: false, error: '缺少 workspaceId' })
            return
          }
          const sessionId = url.searchParams.get('sessionId')
          try {
            sendJson(res, 200, {
              ok: true,
              ...this.snapshot(workspaceId, sessionId === null || sessionId.length === 0 ? undefined : sessionId),
            })
          } catch (error) {
            sendJson(res, 404, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        },
      }), 'dshtavern-stats: state')
    })
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Tavern usage statistics. */
    tavernUsage: TavernUsageService
  }
}

export default TavernUsageService
