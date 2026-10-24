/** Directory holding tavern runtime state, relative to the workspace root. */
export declare const STATE_DIRECTORY = ".dshtavern";
/** Append-only stage log. */
export declare const STAGE_FILE = "stage.jsonl";
/** Director-owned world snapshot. */
export declare const WORLD_FILE = "world.json";
/** Whether a line was narrated by the director or spoken by a character. */
export type StageKind = 'narration' | 'speech';
/**
 * Who may observe a line.
 *
 * `observable` lines reach every character; `omniscient` lines are director
 * knowledge and never enter a character request. Only `observable` narration is
 * appended to the stage — the director writes its private reasoning to the world
 * state instead.
 */
export type StageScope = 'observable' | 'omniscient';
/** One staged line. */
export interface StageEntry {
    /** Monotonic position in the stage. */
    readonly seq: number;
    /** ISO-8601 instant the line was staged. */
    readonly at: string;
    /** Producer of the line. */
    readonly kind: StageKind;
    /** Character id for a speech line; absent for narration. */
    readonly speaker?: string;
    /** Character display name for a speech line; absent for narration. */
    readonly speakerName?: string;
    /** Line text, already readable by the player. */
    readonly text: string;
    /** Observability; v1 stages only `observable` lines. */
    readonly scope: StageScope;
}
/** Director-owned world snapshot. */
export interface WorldState {
    /** Short description of where the scene stands. */
    readonly scene: string;
    /** Established facts every participant may eventually notice. */
    readonly facts: readonly string[];
    /** Unrevealed knowledge: director-only plot advancement. */
    readonly hidden: readonly string[];
    /** ISO-8601 of the last update; absent before the first write. */
    readonly updatedAt?: string;
}
/** @param workspaceDir - tavern workspace root. @returns its state directory. */
export declare function stateDirectory(workspaceDir: string): string;
/**
 * Directory owning one session's stage and world.
 *
 * A stage belongs to a chat, not to a workspace: two chats in the same tavern
 * are different stories and must not share a transcript. `session` narrows the
 * files to that one chat; omitting it addresses the workspace-level directory,
 * which holds only tavern-wide state such as the last recorded request.
 * @param workspaceDir - tavern workspace root.
 * @param session - owning session id, when addressing a chat.
 * @returns the directory for that scope.
 */
export declare function storyDirectory(workspaceDir: string, session: string | undefined): string;
/** @param workspaceDir - tavern workspace root. @param session - chat identity. @returns the stage file path. */
export declare function stagePath(workspaceDir: string, session?: string): string;
/** @param workspaceDir - tavern workspace root. @param session - chat identity. @returns the world file path. */
export declare function worldPath(workspaceDir: string, session?: string): string;
/** @returns an empty world for a scene that has not started. */
export declare function emptyWorld(): WorldState;
/**
 * Parse one stage line.
 * @param line - raw JSONL line.
 * @returns the entry, or `undefined` when the line is not a usable entry.
 */
export declare function parseStageEntry(line: string): StageEntry | undefined;
/**
 * Read the whole stage.
 * @param workspaceDir - tavern workspace root.
 * @returns staged lines in order; a missing file reads as an empty stage.
 */
export declare function readStage(workspaceDir: string, session?: string): Promise<StageEntry[]>;
/**
 * Append lines to the stage, assigning sequence numbers after the current tail.
 * @param workspaceDir - tavern workspace root.
 * @param lines - lines to append, without `seq`.
 * @returns the appended entries with their assigned sequence numbers.
 */
export declare function appendStage(workspaceDir: string, lines: readonly Omit<StageEntry, 'seq' | 'at'>[], session?: string): Promise<StageEntry[]>;
/**
 * Replace the whole stage with a new line list.
 *
 * Regeneration replays the newest beat, so its discarded narration and speech
 * must leave the stage before the replay reads it; otherwise the new beat reads
 * its own discarded draft as established history and continues from it. The
 * write happens only after the replay settles, so a failed replay leaves the
 * story exactly as it was rather than deleting the beat it could not replace.
 * Sequence numbers are reassigned from the new head because nothing outside
 * the stage stores them.
 * @param workspaceDir - tavern workspace root.
 * @param lines - complete replacement content, in story order.
 * @param session - owning session id, when addressing a chat.
 * @returns the written entries.
 */
export declare function writeStage(workspaceDir: string, lines: readonly Omit<StageEntry, 'seq' | 'at'>[], session?: string): Promise<StageEntry[]>;
/**
 * Parse a stored world snapshot.
 *
 * Shared with beat replay, which restores the snapshot a regenerated beat
 * started from; both readers must agree on what a partial or damaged file
 * means, so the rule lives here once.
 * @param value - parsed JSON value.
 * @returns the world; an empty one for anything unusable.
 */
export declare function parseWorld(value: unknown): WorldState;
/**
 * Read the director's world snapshot.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored world, or an empty one before the first write.
 */
export declare function readWorld(workspaceDir: string, session?: string): Promise<WorldState>;
/**
 * Write the world snapshot atomically (temporary file then rename).
 * @param workspaceDir - tavern workspace root.
 * @param world - snapshot to persist; `updatedAt` is stamped here.
 * @returns the stored snapshot.
 */
export declare function writeWorld(workspaceDir: string, world: Omit<WorldState, 'updatedAt'>, session?: string): Promise<WorldState>;
/**
 * Render the stage as the transcript both the director and characters read.
 * @param entries - staged lines.
 * @param options - optional speaker filter applied to speech lines.
 * @returns one line per entry, prefixed by who produced it.
 */
export declare function renderStage(entries: readonly StageEntry[], options?: {
    readonly onlySpeakers?: readonly string[];
}): string;
