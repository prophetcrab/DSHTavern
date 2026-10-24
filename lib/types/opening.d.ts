import type { CharacterCard } from './character-card.js';
import type { WorldbookEntry } from './worldbook.js';
/** One opening script segment, in the order the player reads it. */
export interface OpeningSegment {
    /** `narration` is the scene; `speech` is a character's first line. */
    readonly kind: 'narration' | 'speech';
    /** Card id for a speech segment, so the stage can name the speaker. */
    readonly cardId?: string;
    /** Speaker display name for a speech segment. */
    readonly speakerName?: string;
    /** Text of the segment. */
    readonly text: string;
}
/** One resolved opening script. */
export interface OpeningScript {
    /** Segments in reading order; never empty when stored. */
    readonly segments: readonly OpeningSegment[];
    /** Card the script centres on, when the model named one. */
    readonly focusCardId?: string;
    /** ISO-8601 of generation, for the record. */
    readonly generatedAt?: string;
    /** ISO-8601 of the moment the script was written into the session transcript. */
    readonly appendedAt?: string;
    /** Provider/model the script was generated with, stamped on its transcript turn. */
    readonly generatedBy?: {
        readonly provider: string;
        readonly model: string;
    };
    /**
     * Exact system prompt the generation call sent.
     *
     * Kept beside the script because the opening turn runs later than the
     * generation and must log what was actually sent, not a prompt rebuilt from
     * whatever the cards say by then.
     */
    readonly system?: string;
    /** Exact user message the generation call sent. */
    readonly message?: string;
}
/** Schema version of the stored script. */
export declare const OPENING_SCHEMA = 1;
/** File name inside a story directory. */
export declare const OPENING_FILE = "opening.json";
/** Longest opening script accepted, in segments. */
export declare const OPENING_SEGMENTS_MAX = 8;
/** Build the system prompt that writes an opening script. */
export declare function buildOpeningSystem(input: {
    readonly cards: readonly CharacterCard[];
    /** Workspace lore; constant and matching entries are injected. */
    readonly worldbook?: readonly WorldbookEntry[];
}): string;
/**
 * Parse one opening reply into segments.
 *
 * Tolerates a fenced or prefixed reply by extracting the outermost JSON object,
 * the same tolerance the director parser applies. A reply with no usable
 * segments yields an empty script so the caller can fall back rather than stage
 * malformed text.
 * @param text - raw model output.
 * @param cards - cast used to resolve a speaker name back to its card.
 * @returns the parsed script; `segments` is empty when nothing usable parsed.
 */
export declare function parseOpeningReply(text: string, cards: readonly CharacterCard[]): OpeningScript;
/**
 * Read one story's stored opening script.
 * @param directory - story directory.
 * @returns the stored script, or `undefined` when none was written or it is unusable.
 */
export declare function readOpeningScript(directory: string): Promise<OpeningScript | undefined>;
/**
 * Persist one story's opening script atomically.
 * @param directory - story directory.
 * @param script - script to store.
 */
export declare function writeOpeningScript(directory: string, script: OpeningScript): Promise<void>;
