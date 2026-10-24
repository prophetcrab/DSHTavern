/**
 * Durable record of the prompts one tavern beat sent.
 *
 * The orchestrator replaces the agent loop's model call, so the director and
 * character requests never pass through the loop's `system/message` path: the
 * session log only ever holds the workspace prompt, which does not change
 * between turns. That left the prompts that actually decide each reply
 * invisible in Trajectory.
 *
 * This module owns the plugin record's payload — its schema, its bounds, and
 * how it renders — with no host imports, so the browser half can share it.
 * `beat-log-host.ts` projects a beat's stored prompts into this shape.
 */
declare module '@deepseek-ai/dsh-session/types' {
    interface PluginRecordMap {
        /** Every prompt one tavern beat sent, in call order. */
        'plugin:dshtavern/beat': TavernBeatLog;
    }
}
/** Plugin record type written after each beat. */
export declare const BEAT_RECORD_TYPE = "plugin:dshtavern/beat";
/**
 * Longest text one logged prompt field may carry.
 *
 * The extreme context preset can legitimately build a director prompt of a few
 * hundred thousand characters. Logging that verbatim would multiply a session's
 * size worse than the story itself, and the full text is already in the beat
 * file beside the stage. This bound keeps a normal beat exact (2–3k characters)
 * and marks a pathological one as truncated instead of silently storing it
 * partly.
 */
export declare const BEAT_LOG_FIELD_MAX_CHARS: number;
/** One model call's prompt and answer. */
export interface TavernBeatLogCall {
    /** Role this call served: the opening writer, the director, or one character. */
    readonly role: 'opening' | 'director' | 'character';
    /** Card identity, for a character call. */
    readonly cardId?: string;
    /** Speaker name, for a character call. */
    readonly name?: string;
    /** Provider/model the call used. */
    readonly model: string;
    /** System prompt sent. */
    readonly system: string;
    /** User message sent. */
    readonly message: string;
    /** Text the call returned. */
    readonly reply: string;
    /** Whether any field above was cut to {@link BEAT_LOG_FIELD_MAX_CHARS}. */
    readonly truncated?: true;
}
/** One beat's prompts, as written to the session log. */
export interface TavernBeatLog {
    /** ISO-8601 instant the beat finished. */
    readonly at: string;
    /** Turn the beat ran as, when the loop had opened one. */
    readonly turn?: number;
    /** Player utterance the beat answered; empty for an opening turn. */
    readonly playerInput: string;
    /** Calls in execution order. */
    readonly calls: readonly TavernBeatLogCall[];
    /** Beat this one replayed, when it was a regeneration. */
    readonly regeneratedFrom?: string;
    /** Hidden plot advancement the director wrote in this beat's first call. */
    readonly inner?: string;
    /** Whether any field was cut to the logging bound. */
    readonly truncated?: true;
}
/** One call as the orchestrator made it, before bounding. */
export interface BeatLogCallInput {
    readonly role: 'opening' | 'director' | 'character';
    readonly cardId?: string;
    readonly name?: string;
    readonly model: string;
    readonly system: string;
    readonly message: string;
    readonly reply: string;
}
/** Everything one beat knows at logging time, before bounding. */
export interface BeatLogInput {
    readonly at: string;
    readonly turn?: number;
    readonly playerInput: string;
    readonly calls: readonly BeatLogCallInput[];
    readonly regeneratedFrom?: string;
    readonly inner?: string;
}
/**
 * Assemble one beat's record, bounding every prompt-sized field.
 * @param input - the beat's calls and identity.
 * @returns the record to append.
 */
export declare function buildBeatLog(input: BeatLogInput): TavernBeatLog;
/**
 * Parse one stored beat record.
 *
 * The payload comes back from disk, so every field is checked; a malformed
 * record is dropped rather than rendered as a half-empty row.
 * @param value - decoded JSON value.
 * @returns the record, or `undefined` when it cannot be trusted.
 */
export declare function parseBeatLog(value: unknown): TavernBeatLog | undefined;
/**
 * One-line account of a beat, for the collapsed row.
 * @param log - stored beat record.
 * @returns a short label naming the turn and who spoke.
 */
export declare function summarizeBeatLog(log: TavernBeatLog): string;
/**
 * Render one beat's prompts as a readable document.
 *
 * Order matters: the director decides what happens, so its calls are shown
 * first, then each character call in the order it ran.
 * @param log - stored beat record.
 * @returns Markdown-style text for the record's detail pane.
 */
export declare function renderBeatLogText(log: TavernBeatLog): string;
