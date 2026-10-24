/** Directory holding tracker data inside the tavern state directory. */
export declare const TRACKER_DIRECTORY = "tracker";
/** Settings file name inside {@link TRACKER_DIRECTORY}. */
export declare const TRACKER_CONFIG_FILE = "config.json";
/** Run-state file name inside {@link TRACKER_DIRECTORY}. */
export declare const TRACKER_STATE_FILE = "state.json";
/** Directory holding one ledger per run. */
export declare const TRACKER_SUMMARIES_DIRECTORY = "summaries";
/** Schema version this build reads and writes. */
export declare const TRACKER_SCHEMA = 1;
/** Bounds a config field is validated against. */
export declare const TRACKER_LIMITS: {
    /** Beats between two automatic runs; 0 disables the turn trigger. */
    readonly everyTurns: {
        readonly min: 1;
        readonly max: 200;
    };
    /** Minutes between two automatic runs; 0 disables the time trigger. */
    readonly everyMinutes: {
        readonly min: 1;
        readonly max: 10080;
    };
    /** Longest transcript one run forwards, in characters. */
    readonly maxTranscriptChars: {
        readonly min: 2000;
        readonly max: 800000;
    };
    /** World entry: how long the model should aim for. */
    readonly worldChars: {
        readonly min: 60;
        readonly max: 4000;
    };
    /** One character entry: how long the model should aim for. */
    readonly characterChars: {
        readonly min: 40;
        readonly max: 2000;
    };
    /** Player entry: how long the model should aim for. */
    readonly userChars: {
        readonly min: 40;
        readonly max: 2000;
    };
};
/** How far past a suggested length a section may run before it is cut. */
export declare const TRACKER_LENGTH_SLACK = 2;
/**
 * Longest one section may reach before the host truncates it.
 *
 * The suggested length is what the prompt asks for; this ceiling is what the
 * host enforces after the fact, so a model that ignores the suggestion cannot
 * write an unbounded ledger. The slack lets a section that runs a sentence over
 * survive intact instead of being cut mid-clause.
 * @param suggested - the configured suggestion, in characters.
 * @returns the enforced ceiling, in characters.
 */
export declare function trackerSectionCeiling(suggested: number): number;
/** Largest reply one run accepts, in characters. */
export declare const TRACKER_REPLY_MAX_CHARS = 12000;
/** How often the host reconsiders whether a chat is due, in milliseconds. */
export declare const TRACKER_POLL_MS = 60000;
/** One role's model selection; both halves are required together. */
export interface TrackerModelChoice {
    readonly provider: string;
    readonly model: string;
}
/** Which of the two schedules a workspace uses. */
export type TrackerTrigger = 'turns' | 'minutes';
/** How much text one category of the ledger may carry. */
export interface TrackerLengthBudget {
    /** Length the prompt asks for, in characters. */
    readonly suggested: number;
}
/** Per-category length budgets for one ledger. */
export interface TrackerLengths {
    /** The world entry. */
    readonly world: TrackerLengthBudget;
    /** One character entry; every character gets the same budget. */
    readonly character: TrackerLengthBudget;
    /** The player entry. */
    readonly user: TrackerLengthBudget;
}
/** Trigger settings for one tavern workspace. */
export interface TrackerConfig {
    readonly schema: number;
    /** Whether automatic runs are enabled at all. */
    readonly enabled: boolean;
    /**
     * Which schedule is active.
     *
     * The two are alternatives, not a race: a workspace picks the one that fits
     * how it is played. "Every N turns" suits a chat driven by play; "every N
     * minutes" suits one left running.
     */
    readonly trigger: TrackerTrigger;
    /** Run after this many new beats, when `trigger` is `turns`. */
    readonly everyTurns: number;
    /** Run after this many minutes, when `trigger` is `minutes`. */
    readonly everyMinutes: number;
    /** Longest transcript forwarded; older lines are dropped from the front. */
    readonly maxTranscriptChars: number;
    /** How much each category of the ledger may carry. */
    readonly lengths: TrackerLengths;
    /** Model the run uses; absent follows the session default. */
    readonly model?: TrackerModelChoice;
}
/** What has been tracked for one chat. */
export interface TrackerState {
    readonly schema: number;
    /** Newest beat the last run covered; `0` before the first run. */
    readonly lastTurn: number;
    /** ISO-8601 of the last run. */
    readonly lastAt?: string;
}
/** One character's entry in a ledger. */
export interface CharacterProgress {
    /** Card id when the run could resolve it. */
    readonly id?: string;
    /** Display name used when it could not. */
    readonly name: string;
    /** What this character has established or changed so far. */
    readonly progress: string;
}
/**
 * What the player has established, tracked like a cast member.
 *
 * The player has no card, so this entry is built purely from what they said and
 * did on stage: their stated identity, what they have committed to, and how the
 * cast now sees them.
 */
export interface UserProgress {
    /** What the player has established or changed so far. */
    readonly progress: string;
}
/** One tracking run's result. */
export interface TrackerSummary {
    readonly schema: number;
    /** Newest beat this ledger covers. */
    readonly turn: number;
    /** ISO-8601 instant of the run. */
    readonly at: string;
    /** Provider/model the run used, for the record. */
    readonly model?: string;
    /** Where the story stands: setting, stakes, and the current moment. */
    readonly world: string;
    /** The player's own established situation; absent on ledgers written before it existed. */
    readonly user?: UserProgress;
    /** One entry per character that appeared or mattered. */
    readonly characters: readonly CharacterProgress[];
    /** Characters of transcript this run was given. */
    readonly transcriptChars: number;
    /**
     * Newest turn covered by the previous ledger; absent on the first run.
     *
     * A run always reads the whole story, so this is not the range it summarised
     * — it records where the previous ledger stopped, which is what lets the
     * panel show how far the story has moved since.
     */
    readonly sinceTurn?: number;
}
/** A stored config is structurally invalid. */
export declare class TrackerConfigInvalidError extends Error {
    readonly path?: string | undefined;
    constructor(message: string, path?: string | undefined);
}
/**
 * @param workspaceDir - tavern workspace root.
 * @returns the tracker's own directory.
 */
export declare function trackerDirectory(workspaceDir: string): string;
/**
 * @param workspaceDir - tavern workspace root.
 * @returns the settings file path.
 */
export declare function trackerConfigPath(workspaceDir: string): string;
/**
 * @param workspaceDir - tavern workspace root.
 * @returns the run-state file path.
 */
export declare function trackerStatePath(workspaceDir: string): string;
/**
 * @param workspaceDir - tavern workspace root.
 * @returns the directory holding one ledger per run.
 */
export declare function trackerSummariesDirectory(workspaceDir: string): string;
/** @returns the settings a workspace starts from. */
export declare function defaultTrackerConfig(): TrackerConfig;
/**
 * Validate one settings payload, filling absent fields from the defaults.
 * @param value - candidate config, however malformed.
 * @returns the normalised config.
 * @throws TrackerConfigInvalidError when a present field is invalid.
 */
export declare function normalizeTrackerConfig(value: unknown): TrackerConfig;
/**
 * Read one workspace's tracker settings.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored config, or the defaults when absent.
 * @throws TrackerConfigInvalidError when the file is unusable.
 */
export declare function readTrackerConfig(workspaceDir: string): Promise<TrackerConfig>;
/**
 * Persist one workspace's tracker settings atomically.
 * @param workspaceDir - tavern workspace root.
 * @param value - full config payload, validated before writing.
 * @returns the stored config.
 */
export declare function writeTrackerConfig(workspaceDir: string, value: unknown): Promise<TrackerConfig>;
/**
 * Read one chat's run state.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @returns the stored state, or `lastTurn: 0` when absent.
 */
export declare function readTrackerState(workspaceDir: string, session: string | undefined): Promise<TrackerState>;
/**
 * Persist one chat's run state atomically.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @param state - state to store.
 */
export declare function writeTrackerState(workspaceDir: string, session: string | undefined, state: TrackerState): Promise<void>;
/**
 * Persist one ledger atomically.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @param summary - ledger to store.
 * @returns the stored ledger.
 */
export declare function writeTrackerSummary(workspaceDir: string, session: string | undefined, summary: TrackerSummary): Promise<TrackerSummary>;
/**
 * List one chat's ledgers, newest first.
 * @param workspaceDir - tavern workspace root.
 * @param session - chat identity.
 * @returns parsed ledgers; unreadable files are skipped.
 */
export declare function listTrackerSummaries(workspaceDir: string, session: string | undefined): Promise<TrackerSummary[]>;
/**
 * Validate one stored ledger.
 * @param value - decoded JSON value.
 * @returns the ledger, or `undefined` when it cannot be rendered.
 */
export declare function parseTrackerSummary(value: unknown): TrackerSummary | undefined;
/**
 * Turns a ledger has read, for the turn rail's marker.
 *
 * A ledger is written from the whole story up to its own turn, so reaching turn
 * N means every turn before it was read too. Marking only the turns that happen
 * to own a ledger file would light up 3 and 7 while leaving 1, 2, 4, 5 and 6
 * dark, which reads as "these turns were skipped" — the opposite of what
 * happened.
 * @param summaries - ledgers newest first.
 * @returns every turn up to the newest ledger's turn, ascending; empty before
 *   the first run.
 */
export declare function trackedTurns(summaries: readonly TrackerSummary[]): number[];
/**
 * Whether one chat is due for an automatic run.
 *
 * The two schedules are alternatives, not a race: only the configured trigger
 * is consulted. A time trigger that has never run fires immediately, because
 * "every N minutes" on a chat that has never been tracked means "start now".
 * @param config - workspace settings.
 * @param state - what has been tracked.
 * @param newestTurn - newest beat in the chat.
 * @param now - current epoch milliseconds.
 * @returns whether a run should start.
 */
export declare function trackerDue(config: TrackerConfig, state: TrackerState, newestTurn: number, now: number): boolean;
/**
 * Turns covered by a ledger that a later regeneration replaced.
 *
 * A ledger describes the story as it stood when it was written. Regenerating a
 * beat it covers rewrote part of that story, so the ledger no longer matches
 * what is on stage. The comparison is by time, not just by turn number: a
 * replay of an already-covered beat produces a *new* turn, and a ledger written
 * after that regeneration describes the replacement and is perfectly current.
 * @param records - regeneration history for the chat.
 * @param ledgerTurn - newest turn the ledger covers.
 * @param ledgerAt - epoch milliseconds the ledger was written.
 * @returns superseded turns inside the ledger's range, ascending.
 */
export declare function staleTurnsAfterWrite(records: readonly {
    readonly turn: number;
    readonly at: string;
}[], ledgerTurn: number, ledgerAt: number): number[];
