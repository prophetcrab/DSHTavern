/**
 * Tracking prompt and reply parsing.
 *
 * A run asks a model to re-read the story a chat has produced and restate it as
 * a progress ledger. The transcript is the raw material, the previous ledger is
 * the baseline, and the answer is one world entry plus one entry per character:
 * what changed for them, not what they said.
 *
 * The reply is JSON so the panel can render entries without parsing prose. A
 * run that cannot produce usable JSON writes nothing — a wrong ledger is worse
 * than a missing one, because later runs build on it.
 */
import type { CharacterCard } from '../character-card.js';
import type { StageEntry } from '../stage.js';
import type { WorldState } from '../stage.js';
import type { CharacterProgress, TrackerLengths, UserProgress } from './summary.js';
/** Longest one ledger field may be, in characters. */
export declare const TRACKER_FIELD_MAX_CHARS = 4000;
/** Most characters one ledger may carry entries for. */
export declare const TRACKER_CHARACTER_MAX = 40;
/** One ledger as the model returned it. */
export interface ParsedLedger {
    readonly world: string;
    readonly user?: UserProgress;
    readonly characters: readonly CharacterProgress[];
}
/**
 * Render the story so far as the transcript a run reads.
 *
 * Lines are emitted in story order with their speaker, which is what lets the
 * model attribute a change to the character it happened to. Only the newest
 * `maxChars` characters are kept: a long session must still fit one request,
 * and the recent scene is what the ledger's "current moment" describes.
 * @param stage - staged lines, oldest first.
 * @param maxChars - character budget; older lines are dropped first.
 * @returns the transcript and how many characters it carries.
 */
export declare function renderTranscript(stage: readonly StageEntry[], maxChars: number): {
    text: string;
    chars: number;
};
/**
 * Build the system prompt one tracking run sends.
 *
 * Every run reads the whole story from the beginning, so the ledger always
 * describes the current story as a whole rather than a slice of it. The
 * instructions separate the four things a reader needs from a long story:
 * where the world stands, where the player stands, what each character has come
 * to know or want, and what is still unresolved. It explicitly forbids
 * inventing progress, because the ledger is read as fact.
 *
 * Length budgets are stated per section, and the same numbers are enforced by
 * the host after parsing: the prompt asks, the host guarantees.
 * @param input - cast, current world state, and the length budgets.
 * @returns the system prompt text.
 */
export declare function buildTrackerSystem(input: {
    readonly cards: readonly CharacterCard[];
    readonly world: WorldState;
    readonly lengths: TrackerLengths;
}): string;
/** Name the ledger uses for the player, who has no card. */
export declare const PLAYER_LABEL = "\u73A9\u5BB6";
/**
 * Build the user message one tracking run sends.
 * @param transcript - the whole story so far, oldest first.
 * @param turn - newest beat the transcript reaches.
 * @returns the message text.
 */
export declare function buildTrackerMessage(transcript: string, turn: number): string;
/**
 * Parse one tracking reply into a ledger.
 *
 * A reply that carries no usable ledger yields `undefined` rather than an empty
 * one: the caller then keeps the previous state, so the next run retries the
 * same range instead of silently skipping it.
 *
 * Each section is cut to its configured ceiling. The prompt already asks for
 * those lengths, so the cut only fires when the model overshoots; keeping it
 * here means a long ledger cannot push the next run's prompt past the context
 * window, which is the failure mode that compounds.
 * @param text - raw model output.
 * @param cards - cast, used to resolve a character name back to its card id.
 * @param lengths - per-category budgets; omitted keeps the legacy flat ceiling.
 * @returns the ledger, or `undefined` when nothing usable parsed.
 */
export declare function parseTrackerReply(text: string, cards: readonly CharacterCard[], lengths?: TrackerLengths): ParsedLedger | undefined;
