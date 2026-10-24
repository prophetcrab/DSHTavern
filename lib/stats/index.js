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
import { Service } from '@deepseek-ai/cordis';
import { allowLoopback, methodNotAllowed, sendJson } from '../http.js';
/** Service name this plugin publishes. */
export const USAGE_SERVICE = 'tavernUsage';
/** Route serving the usage snapshot. */
export const USAGE_ROUTE = '/tavern-stats/state';
/** Route the client probes to decide whether this sub-plugin is active. */
export const USAGE_PING_ROUTE = '/tavern-stats/ping';
/** Version stamped on every response, so the client can refuse a mismatch. */
export const USAGE_SCHEMA = 1;
const ZERO = {
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
};
/** Sum four disjoint buckets. */
function totalOf(buckets) {
    return buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens + buckets.outputTokens;
}
/** Cache-hit share of the prompt tokens that could have been cached. */
function hitRateOf(buckets) {
    const prompt = buckets.uncachedInputTokens + buckets.cacheReadTokens;
    if (prompt === 0)
        return undefined;
    return buckets.cacheReadTokens / prompt;
}
function addBuckets(left, right) {
    return {
        uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
        cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
        cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
        outputTokens: left.outputTokens + right.outputTokens,
    };
}
/** Normalize a path for containment checks. */
function normalizePath(value) {
    return value.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}
/**
 * Whether one session's working directory sits inside a workspace.
 * @param cwd - session working directory.
 * @param root - workspace directory.
 * @returns true for the workspace root itself or any descendant.
 */
export function isInsideWorkspace(cwd, root) {
    if (cwd === undefined || cwd.length === 0)
        return false;
    const normalizedCwd = normalizePath(cwd);
    const normalizedRoot = normalizePath(root);
    return normalizedCwd === normalizedRoot || normalizedCwd.startsWith(`${normalizedRoot}/`);
}
/** Projection keys this plugin reads. */
const PROJECTION_KEYS = ['tokenUsage', 'contextPressure', 'title'];
/**
 * Read one session's usage from the durable projections.
 * @param session - live session.
 * @param projections - projection registry, when registered.
 * @returns that session's usage view.
 */
export function readSessionUsage(session, projections) {
    const header = session.header;
    const values = projections?.snapshot(session, PROJECTION_KEYS).values ?? {};
    const usage = values.tokenUsage;
    const pressure = values.contextPressure;
    const title = typeof values.title === 'string' ? values.title : undefined;
    const buckets = usage === undefined
        ? ZERO
        : {
            uncachedInputTokens: usage.uncachedInputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            outputTokens: usage.outputTokens,
        };
    const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens;
    const contextWindow = pressure?.contextWindow;
    const ratio = usedTokens !== undefined && contextWindow !== undefined && contextWindow > 0
        ? Math.min(1, Math.max(0, usedTokens / contextWindow))
        : undefined;
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
    };
}
/**
 * Aggregate usage for the live sessions of one workspace.
 * @param input - workspace identity, every live session, and the projection reader.
 * @returns the snapshot the toolbox renders.
 */
export function buildUsageSnapshot(input) {
    const views = [];
    for (const session of input.sessions) {
        if (!isInsideWorkspace(session.header.cwd, input.workspacePath))
            continue;
        views.push(readSessionUsage(session, input.projections));
    }
    views.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
    const buckets = views.reduce((sum, view) => addBuckets(sum, view.buckets), ZERO);
    const current = input.currentSessionId === undefined
        ? undefined
        : views.find(view => view.sessionId === input.currentSessionId);
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
    };
}
/**
 * Host plugin: resolves the tavern workspace and serves its usage snapshot.
 *
 * Loads with `sessions` and `workspaceRegistry`; the projection registry is read
 * optionally so the plugin still answers (with `projectionsAvailable: false`)
 * on a profile that omits token-meter.
 */
export class TavernUsageService extends Service {
    static inject = ['workspaceRegistry', 'sessions', 'webServer'];
    workspaces;
    sessions;
    /**
     * @param ctx - Cordis context carrying the workspace, session, and web services.
     */
    constructor(ctx) {
        super(ctx, USAGE_SERVICE);
        this.workspaces = ctx.workspaceRegistry;
        this.sessions = ctx.sessions;
        this.registerRoutes();
    }
    /** @returns the projection registry when token-meter registered it. */
    projections() {
        return this.ctx.get('sessionProjections');
    }
    /**
     * Build the snapshot for one workspace.
     * @param workspaceId - registered workspace id.
     * @param currentSessionId - session the toolbox was opened from.
     * @returns the usage snapshot.
     * @throws Error when the workspace is not registered.
     */
    snapshot(workspaceId, currentSessionId) {
        const workspace = this.workspaces.list().find(entry => entry.id === workspaceId);
        if (workspace === undefined)
            throw new Error(`工作区不存在：${workspaceId}`);
        return buildUsageSnapshot({
            workspaceId: workspace.id,
            workspaceTitle: workspace.title,
            workspacePath: workspace.path,
            sessions: this.sessions.list(),
            ...(currentSessionId === undefined ? {} : { currentSessionId }),
            ...(this.projections() === undefined ? {} : { projections: this.projections() }),
        });
    }
    registerRoutes() {
        this.ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => webCtx.webServer.register({
                kind: 'exact',
                path: USAGE_PING_ROUTE,
                handler: (req, res) => {
                    if (!allowLoopback(req, res))
                        return;
                    if (req.method !== 'GET') {
                        methodNotAllowed(res, 'GET');
                        return;
                    }
                    sendJson(res, 200, { ok: true, schema: USAGE_SCHEMA });
                },
            }), 'dshtavern-stats: ping');
            webCtx.effect(() => webCtx.webServer.register({
                kind: 'exact',
                path: USAGE_ROUTE,
                handler: (req, res) => {
                    if (!allowLoopback(req, res))
                        return;
                    if (req.method !== 'GET') {
                        methodNotAllowed(res, 'GET');
                        return;
                    }
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const workspaceId = url.searchParams.get('workspaceId');
                    if (workspaceId === null || workspaceId.length === 0) {
                        sendJson(res, 400, { ok: false, error: '缺少 workspaceId' });
                        return;
                    }
                    const sessionId = url.searchParams.get('sessionId');
                    try {
                        sendJson(res, 200, {
                            ok: true,
                            ...this.snapshot(workspaceId, sessionId === null || sessionId.length === 0 ? undefined : sessionId),
                        });
                    }
                    catch (error) {
                        sendJson(res, 404, {
                            ok: false,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                },
            }), 'dshtavern-stats: state');
        });
    }
}
export default TavernUsageService;
