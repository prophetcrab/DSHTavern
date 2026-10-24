import type { ReactElement } from 'react';
/** One superseded turn and the turn that replaced it. */
export interface RegenerationView {
    readonly turn: number;
    readonly replacement: number;
}
/**
 * Subscribe to the superseded-turn cache.
 * @param listener - called after any session's records change.
 * @returns the unsubscribe function.
 */
export declare function subscribeRegenerations(listener: () => void): () => void;
/**
 * Read one session's superseded turns.
 * @param sessionId - chat identity.
 * @returns turn number to replacement turn number; a stable empty map before the first read.
 */
export declare function regenerationSnapshot(sessionId: string): ReadonlyMap<number, number>;
/**
 * Read the newest turn the Host can replay.
 * @param sessionId - chat identity.
 * @returns that turn, or `undefined` when the story has nothing to replay.
 */
export declare function replayableTurn(sessionId: string): number | undefined;
/**
 * Follow a replacement chain to the reply that currently stands.
 *
 * Regenerating a regeneration adds another hop (2→3, then 3→4). The marker
 * under turn 2 must name the reply the player can actually read, not the
 * intermediate draft that was itself replaced.
 * @param records - superseded turns for the session.
 * @param turn - the turn whose marker is being rendered.
 * @returns the newest replacement turn, or `undefined` when the turn stands.
 */
export declare function finalReplacement(records: ReadonlyMap<number, number>, turn: number): number | undefined;
/**
 * Fetch one session's superseded turns.
 *
 * `force` exists because the list grows at the end of a regeneration: a cache
 * filled before that write would keep the replaced reply looking current.
 * @param workspaceId - registered tavern workspace id.
 * @param sessionId - chat identity.
 * @param force - re-read even when a cached list exists.
 */
export declare function ensureRegenerations(workspaceId: string, sessionId: string, force?: boolean): void;
/** Standard props the turn-tail slot provides to the strip. */
export interface TurnActionsProps {
    /** Completed turn this strip belongs to. */
    readonly turn: {
        readonly turn: number;
        readonly status: 'open' | 'closed' | 'unknown';
    };
    /** Current Session identity. */
    readonly sessionId: string;
    /** Selector hook over the Chat assembly, used to find the newest turn. */
    readonly useChat: (selector: (snapshot: {
        readonly timeline?: {
            readonly turnOrder?: readonly number[];
        };
    }) => unknown) => unknown;
    /** Session-list selector supplying the working directory. */
    readonly useSessions: (selector: (state: {
        byId: Record<string, {
            cwd?: string;
        }>;
    }) => unknown) => unknown;
}
/**
 * Render the regenerate action and the superseded marker.
 * @param props - owning turn, session identity, and the standard hooks.
 * @returns an action row, or `null` outside a tavern or under a stale turn.
 */
export declare function TavernTurnActions(props: TurnActionsProps): ReactElement | null;
