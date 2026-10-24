/**
 * Green marks on the turn rail for beats that already have a ledger.
 *
 * The chat UI owns the rail and exposes no slot for decorating a mark, so this
 * observes the rendered `button[data-index]` marks and sets one attribute the
 * stylesheet turns green. Matching is by turn number read from the mark's
 * accessible label, which is the only per-turn fact the rail publishes.
 */
/** Attribute set on a rail mark whose turn has been tracked. */
export declare const TRACKED_MARK_ATTRIBUTE = "data-dshtavern-tracked";
/**
 * Read the turn number out of a rail mark's label.
 *
 * The label is a localized sentence ("跳转到第 3 轮" / "Jump to turn 3"), so the
 * number is taken as the last integer in it rather than by matching the whole
 * string, which would break on a copy change or a second language.
 * @param label - the mark's `aria-label`.
 * @returns the turn number, or `undefined` when the label carries none.
 */
export declare function turnOfLabel(label: string | null): number | undefined;
/**
 * Apply the mark to every rendered rail mark.
 *
 * A turn that was regenerated after its ledger was written keeps no mark: the
 * ledger describes a story that no longer exists, and a green dot would claim
 * otherwise.
 * @param tracked - turns that have a current ledger.
 */
export declare function markTrackedTurns(tracked: ReadonlySet<number>): void;
/**
 * Record one chat's tracked turns and repaint the rail.
 * @param sessionId - chat identity the rail is showing.
 * @param turns - turns that have a ledger.
 */
export declare function setTrackedTurns(sessionId: string, turns: readonly number[]): void;
/**
 * Record which covered turns a regeneration invalidated.
 * @param sessionId - chat identity.
 * @param turns - superseded turns.
 */
export declare function setStaleTurns(sessionId: string, turns: readonly number[]): void;
/**
 * Keep the rail marks in sync with the tracker.
 *
 * Repaints on tracker changes and after sidebar/transcript mutations, because
 * the rail is virtualized: scrolling rebuilds the marks and drops attributes.
 * @param sessionId - chat identity the rail is showing.
 * @returns a disposer that stops observing.
 */
export declare function installTrackedTurnMarks(sessionId: string): () => void;
/**
 * Refresh one chat's tracked turns from the tracker route.
 *
 * A profile without the tracker sub-plugin has no route; that is a normal
 * state, so a failed read simply leaves the rail unmarked.
 * @param workspaceId - registered tavern workspace id.
 * @param sessionId - chat identity.
 */
export declare function refreshTrackedTurns(workspaceId: string, sessionId: string): Promise<void>;
