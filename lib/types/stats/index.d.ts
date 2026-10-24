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
import { Service, type Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
/** Service name this plugin publishes. */
export declare const USAGE_SERVICE = "tavernUsage";
/** Route serving the usage snapshot. */
export declare const USAGE_ROUTE = "/tavern-stats/state";
/** Route the client probes to decide whether this sub-plugin is active. */
export declare const USAGE_PING_ROUTE = "/tavern-stats/ping";
/** Version stamped on every response, so the client can refuse a mismatch. */
export declare const USAGE_SCHEMA = 1;
/** Disjoint provider usage buckets, mirroring `TokenUsage`. */
export interface UsageBuckets {
    readonly uncachedInputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    readonly outputTokens: number;
}
/** Context occupancy of one session. */
export interface ContextUsageView {
    /** Tokens the next request would carry, when the provider reported a sample. */
    readonly usedTokens?: number;
    /** Model context window, when the route declares one. */
    readonly contextWindow?: number;
    /** `usedTokens / contextWindow`, clamped to 0..1. */
    readonly ratio?: number;
}
/** One session's usage. */
export interface SessionUsageView {
    readonly sessionId: string;
    readonly title?: string;
    readonly createdAt?: number;
    /** Sum of all four buckets. */
    readonly totalTokens: number;
    readonly buckets: UsageBuckets;
    /** `cacheRead / (cacheRead + uncachedInput)`; absent when no prompt tokens were reported. */
    readonly cacheHitRate?: number;
    readonly context: ContextUsageView;
}
/** One workspace's usage snapshot. */
export interface UsageSnapshot {
    readonly schema: number;
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    /** Session the toolbox was opened from, when known. */
    readonly currentSessionId?: string;
    /** Sum over every live session in this workspace. */
    readonly totals: UsageBuckets & {
        totalTokens: number;
        sessionCount: number;
        cacheHitRate?: number;
    };
    /** The current session's own usage, when it is live. */
    readonly current?: SessionUsageView;
    /** Every live tavern session, newest first. */
    readonly sessions: readonly SessionUsageView[];
    /** Whether the projection units this plugin reads were registered. */
    readonly projectionsAvailable: boolean;
    readonly generatedAt: string;
}
/**
 * Whether one session's working directory sits inside a workspace.
 * @param cwd - session working directory.
 * @param root - workspace directory.
 * @returns true for the workspace root itself or any descendant.
 */
export declare function isInsideWorkspace(cwd: string | undefined, root: string): boolean;
/** The subset of the projection registry this plugin needs. */
interface ProjectionReader {
    snapshot(session: Session, keys?: readonly string[]): {
        readonly values: Record<string, unknown>;
    };
}
/**
 * Read one session's usage from the durable projections.
 * @param session - live session.
 * @param projections - projection registry, when registered.
 * @returns that session's usage view.
 */
export declare function readSessionUsage(session: Session, projections: ProjectionReader | undefined): SessionUsageView;
/**
 * Aggregate usage for the live sessions of one workspace.
 * @param input - workspace identity, every live session, and the projection reader.
 * @returns the snapshot the toolbox renders.
 */
export declare function buildUsageSnapshot(input: {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    readonly sessions: readonly Session[];
    readonly currentSessionId?: string;
    readonly projections?: ProjectionReader;
}): UsageSnapshot;
/**
 * Host plugin: resolves the tavern workspace and serves its usage snapshot.
 *
 * Loads with `sessions` and `workspaceRegistry`; the projection registry is read
 * optionally so the plugin still answers (with `projectionsAvailable: false`)
 * on a profile that omits token-meter.
 */
export declare class TavernUsageService extends Service {
    static inject: string[];
    private readonly workspaces;
    private readonly sessions;
    /**
     * @param ctx - Cordis context carrying the workspace, session, and web services.
     */
    constructor(ctx: Context);
    /** @returns the projection registry when token-meter registered it. */
    private projections;
    /**
     * Build the snapshot for one workspace.
     * @param workspaceId - registered workspace id.
     * @param currentSessionId - session the toolbox was opened from.
     * @returns the usage snapshot.
     * @throws Error when the workspace is not registered.
     */
    snapshot(workspaceId: string, currentSessionId?: string): UsageSnapshot;
    private registerRoutes;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Tavern usage statistics. */
        tavernUsage: TavernUsageService;
    }
}
export default TavernUsageService;
