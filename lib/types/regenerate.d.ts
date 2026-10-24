import type { BeatRecord } from './orchestrator.js';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        /**
         * A player-requested regeneration of the previous beat.
         *
         * The trigger is a real inbox message because that is the only public way
         * to start a turn, but it is not player text: the orchestrator replays the
         * stored beat's own `playerInput` instead and never stages this message.
         */
        'tavern-regenerate': {
            kind: 'tavern-regenerate';
            form: 'notice';
            summary: string;
        };
        /**
         * The story's opening, run as its own turn.
         *
         * The opening must precede the player's first message, and only the loop
         * can open a turn, so the pre-chat card queues one instead of writing turn
         * events directly. Like the regenerate trigger it carries no player text.
         */
        'tavern-opening': {
            kind: 'tavern-opening';
            form: 'notice';
            summary: string;
        };
    }
}
/** Source kind identifying the opening trigger in derived history. */
export declare const OPENING_SOURCE_KIND = "tavern-opening";
/** Body of the opening trigger; never shown to the player as speech. */
export declare const OPENING_PROMPT = "\uFF08\u5F00\u573A\uFF09";
/** Source kind identifying the regeneration trigger in derived history. */
export declare const REGENERATE_SOURCE_KIND = "tavern-regenerate";
/** Body of the regeneration trigger; never shown to the player as speech. */
export declare const REGENERATE_PROMPT = "\uFF08\u91CD\u65B0\u751F\u6210\u4E0A\u4E00\u5E55\uFF09";
/** Text returned when a regeneration has no replayable beat to work from. */
export declare const REGENERATE_UNAVAILABLE = "\u8FD9\u4E00\u5E55\u6CA1\u6709\u53EF\u91CD\u653E\u7684\u8BB0\u5F55\uFF0C\u65E0\u6CD5\u91CD\u65B0\u751F\u6210\u3002";
/**
 * How long a queued regeneration blocks another one.
 *
 * The trigger's turn has not opened when the request is accepted, so the story
 * shows no new beat yet; this window is what makes a double click one request.
 */
export declare const REGENERATION_QUEUE_WINDOW_MS = 120000;
/** Subdirectory holding one JSON file per beat. */
export declare const BEATS_DIRECTORY = "beats";
/** File recording which turns regeneration superseded. */
export declare const REGENERATIONS_FILE = "regenerations.json";
/** Regeneration file schema written by this build. */
export declare const REGENERATIONS_SCHEMA = 1;
/** One superseded turn and the turn that replaced it. */
export interface RegenerationRecord {
    /** Turn whose reply was replaced. */
    readonly turn: number;
    /** Turn carrying the replacement reply. */
    readonly replacement: number;
    /** ISO-8601 instant of the regeneration. */
    readonly at: string;
}
/** One stored beat with the file that holds it. */
export interface StoredBeat {
    /** Absolute path of the beat file. */
    readonly file: string;
    /** Parsed beat record. */
    readonly record: BeatRecord;
}
/**
 * Parse one stored beat record.
 *
 * Beats are written for inspection and only regeneration reads them back, so a
 * damaged or older file is skipped rather than treated as fatal; the caller
 * then falls back to the previous beat, and a truly unreadable story refuses
 * regeneration with a clear message.
 * @param value - parsed JSON value from a beat file.
 * @returns the record, or `undefined` when it cannot drive a replay.
 */
export declare function parseBeatRecord(value: unknown): BeatRecord | undefined;
/**
 * Count the stage lines one beat staged.
 *
 * Used only for beats written before `stageCountBefore` existed. It counts the
 * narration and speech the record itself describes, which is exactly what the
 * beat appended after the opening lines it did not record.
 * @param record - stored beat.
 * @returns how many stage lines the beat produced.
 */
export declare function stagedLineCount(record: BeatRecord): number;
/**
 * Resolve where the stage must be cut to replay one beat.
 * @param record - stored beat being regenerated.
 * @param stageLength - current number of staged lines.
 * @returns the number of leading lines to keep.
 */
export declare function truncationPoint(record: BeatRecord, stageLength: number): number;
/**
 * Read the beat files newest first.
 * @param directory - story directory.
 * @returns parsed beats, newest first; unreadable files are skipped.
 */
export declare function listBeats(directory: string): Promise<StoredBeat[]>;
/**
 * Read one story's regeneration history.
 * @param directory - story directory.
 * @returns the stored records; an absent or unreadable file reads as none.
 */
export declare function readRegenerations(directory: string): Promise<RegenerationRecord[]>;
/**
 * Record one regeneration atomically.
 * @param directory - story directory.
 * @param record - superseded turn and its replacement.
 * @returns the complete history after the append.
 */
export declare function appendRegeneration(directory: string, record: RegenerationRecord): Promise<RegenerationRecord[]>;
