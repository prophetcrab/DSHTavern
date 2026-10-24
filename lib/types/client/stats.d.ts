import type { ReactElement } from 'react';
/** Disjoint provider usage buckets. */
export interface UsageBucketsView {
    readonly uncachedInputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    readonly outputTokens: number;
}
/** Context occupancy of one session. */
export interface ContextUsageView {
    readonly usedTokens?: number;
    readonly contextWindow?: number;
    readonly ratio?: number;
}
/** One session's usage. */
export interface SessionUsageView {
    readonly sessionId: string;
    readonly title?: string;
    readonly createdAt?: number;
    readonly totalTokens: number;
    readonly buckets: UsageBucketsView;
    readonly cacheHitRate?: number;
    readonly context: ContextUsageView;
}
/** One workspace's usage snapshot. */
export interface UsageSnapshotView {
    readonly schema: number;
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly totals: UsageBucketsView & {
        readonly totalTokens: number;
        readonly sessionCount: number;
        readonly cacheHitRate?: number;
    };
    readonly current?: SessionUsageView;
    readonly sessions: readonly SessionUsageView[];
    readonly projectionsAvailable: boolean;
    readonly generatedAt: string;
}
/** Props of the usage panel. */
export interface UsagePanelProps {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    readonly sessionId: string;
}
/**
 * Format a token count the way the rest of the UI does.
 * @param value - raw count.
 * @returns `—` for an absent value, otherwise a compact number.
 */
export declare function formatTokens(value: number | undefined): string;
/**
 * Format a 0..1 ratio as a percentage.
 * @param value - ratio, or undefined when unknown.
 * @returns `—` or a one-decimal percentage.
 */
export declare function formatPercent(value: number | undefined): string;
/**
 * Workspace and session usage, refreshed while the panel is open.
 * @param props - the workspace and session the toolbox opened for.
 * @returns the usage section.
 */
export declare function UsagePanel(props: UsagePanelProps): ReactElement;
