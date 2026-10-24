/**
 * Role-play orchestration: one director call decides what happens, then one
 * isolated call per speaking character produces that character's line.
 *
 * Isolation is structural: each character call receives only its own card and
 * the observable stage. Two characters therefore cannot contaminate each
 * other's voice, and a character never sees the director's private knowledge.
 *
 * The director returns JSON so the orchestrator never parses prose to learn who
 * spoke next. Narration is observable-only; hidden plot advancement goes to the
 * world state instead of the stage.
 */
import type { CharacterCard } from './character-card.js';
import type { PromptLayout } from './prompt-layout.js';
import type { StageEntry, WorldState } from './stage.js';
import type { WorldbookEntry } from './worldbook.js';
/** One cast member as the director sees it; never the full card. */
export interface CastMember {
    /** Stable card id the director names in `nextSpeaker`. */
    readonly id: string;
    /** Display name. */
    readonly name: string;
    /** One-line role summary for the roster. */
    readonly brief: string;
}
/**
 * One-line cast brief: the card's first line of description, else its tags.
 *
 * The director only needs enough to decide who reacts; the full card would
 * leak the character's private definition into the director prompt.
 * @param card - cast member's card.
 * @returns a short identifying phrase.
 */
export declare function cardBrief(card: CharacterCard): string;
/** What the director decided for one beat. */
export interface DirectorDecision {
    /** Observable narration to stage before any speech; empty when none. */
    readonly narration: string;
    /** Director-only plot advancement appended to the world state. */
    readonly inner: string;
    /** Character id that speaks next, or `undefined` for a narration-only beat. */
    readonly nextSpeaker?: string;
}
/** One ordered piece of a beat, as it will be shown to the player. */
export type BeatSegment = {
    readonly kind: 'narration';
    readonly text: string;
} | {
    readonly kind: 'speech';
    readonly name: string;
    readonly text: string;
};
/** Where a turn's speaking character came from. */
export type SpeakerSource = 'director' | 'player-mention' | 'fallback-first';
/** One director/character exchange inside a beat, kept for inspection and replay. */
export interface BeatTurn {
    directorSystem: string;
    /** Final director answer, after any repair call. */
    directorReply: string;
    /** What the director answered before the format repair replaced it. */
    directorRawReply?: string;
    /** Repair call's system prompt, when the director ignored the output contract. */
    repairSystem?: string;
    /** Repair call's user message. */
    repairMessage?: string;
    decision: DirectorDecision;
    /** Route and model the director call used. */
    directorModel?: {
        readonly provider: string;
        readonly model: string;
    };
    /** Route and model the character call used. */
    characterModel?: {
        readonly provider: string;
        readonly model: string;
    };
    /** How the speaking character was chosen, when one spoke. */
    speakerSource?: SpeakerSource;
    /** Character the orchestrator actually used; differs from the director's pick when overridden. */
    effectiveSpeaker?: {
        readonly id: string;
        readonly name: string;
    };
    characterSystem?: string;
    characterPromptMessages?: readonly {
        role: string;
        text: string;
    }[];
    speech?: string;
}
/** Evidence of one orchestrated beat, written for inspection. */
export interface BeatRecord {
    at: string;
    playerInput: string;
    directorSystem: string;
    directorReply: string;
    decision: DirectorDecision;
    characterSystem?: string;
    characterPromptMessages?: readonly {
        role: string;
        text: string;
    }[];
    speech?: string;
    /** Every director/character exchange this beat ran, in order. */
    turns?: readonly BeatTurn[];
    /** DSH turn that produced this beat, when the loop had opened it. */
    turn?: number;
    /**
     * Stage length before this beat staged anything.
     *
     * Regeneration truncates here so the discarded draft never reaches the next
     * prompt. Absent on beats written before this field existed; those fall back
     * to counting the lines the record itself describes.
     */
    stageCountBefore?: number;
    /** World snapshot before this beat wrote to it; absent on older records. */
    worldBefore?: WorldState;
    /** Timestamp of the beat this one replaced, when it is a regeneration. */
    regeneratedFrom?: string;
}
/** How many staged lines a character reads; older lines are dropped first. */
export declare const STAGE_WINDOW = 40;
/** Longest single player utterance forwarded to the director. */
export declare const PLAYER_INPUT_MAX = 8000;
/** Most characters that may speak in one player turn before the beat is closed. */
export declare const MAX_SPEECHES_PER_BEAT = 3;
/**
 * Build the director system prompt.
 *
 * The prompt states the hard boundaries as rules the model cannot satisfy by
 * accident: narration never enters a character's mind, the director never acts
 * for the player, and the director never decides what a character chooses.
 * @param input - world snapshot, cast roster, and visible stage.
 * @returns the system prompt text.
 */
/** Runtime knobs one orchestrated beat reads; every field defaults to the shipped constant. */
export interface BeatLimits {
    /** Character speeches one player turn may produce. */
    readonly maxSpeechesPerBeat?: number;
    /** Staged lines every prompt carries. */
    readonly stageWindow?: number;
    /** Character cap on the staged transcript; absent means only the line budget applies. */
    readonly stageMaxChars?: number;
    /** Recent stage lines the worldbook scan covers. */
    readonly loreScanLines?: number;
    /** Worldbook entries one request may inject. */
    readonly loreMaxEntries?: number;
    /** Worldbook characters one request may inject. */
    readonly loreMaxChars?: number;
    /** Player utterance length forwarded to the model. */
    readonly playerInputMax?: number;
    /** Tell the director to alternate speakers. */
    readonly rotateSpeakers?: boolean;
}
/**
 * Keep the newest staged lines that fit a character budget.
 *
 * The line budget alone stops bounding a prompt once it is large: an author can
 * raise it for long scenes and get a transcript whose size depends on how wordy
 * each line happened to be. Trimming from the front keeps the most recent
 * exchange, which is what every reader in the beat actually needs.
 * @param entries - staged lines, oldest first.
 * @param maxLines - line budget applied first.
 * @param maxChars - character budget, or undefined for none.
 * @returns the kept tail.
 */
export declare function tailWithinChars<T extends {
    readonly text: string;
}>(entries: readonly T[], maxLines: number, maxChars: number | undefined): readonly T[];
/** Inputs shared by both director prompt builders. */
interface DirectorPromptInput {
    readonly world: WorldState;
    readonly cast: readonly CastMember[];
    readonly stage: readonly StageEntry[];
    readonly layout: PromptLayout;
    /** Workspace lore; entries marked director-only are included here. */
    readonly worldbook?: readonly WorldbookEntry[];
    /** The player's utterance for this beat, if any. */
    readonly playerInput?: string;
    /** Runtime knobs; omitted fields use the shipped constants. */
    readonly limits?: BeatLimits;
}
export declare function buildDirectorSystem(input: DirectorPromptInput): string;
/**
 * Render the world state for the director prompt.
 * @param world - director-owned snapshot.
 * @returns section text; empty when nothing is recorded yet.
 */
export declare function renderWorld(world: WorldState): string;
/**
 * Build the director prompt for a follow-up turn inside the same beat.
 *
 * After a character speaks, the director decides whether the scene continues
 * with someone else or settles. The previous speaker is named so a two-person
 * scene alternates instead of repeating.
 * @param input - world, cast, current stage, and the director layout.
 * @param spoken - characters that already spoke this beat, latest last.
 * @returns the system prompt text.
 */
export declare function buildDirectorContinuation(input: DirectorPromptInput, spoken: readonly CastMember[]): string;
/**
 * One run of a character's reply: something they do, or something they say.
 *
 * The character prompt asks for actions in asterisks (`*她把伞收起*`), which is
 * also how the stage renders them. Splitting the runs apart is what lets the
 * player read a gesture as direction rather than as dialogue.
 */
export interface SpeechRun {
    /** `action` is stage direction; `dialogue` is spoken text. */
    readonly kind: 'action' | 'dialogue';
    /** Run text, trimmed, with its delimiters removed. */
    readonly text: string;
}
/**
 * Split one character reply into its action and dialogue runs.
 *
 * A run separated by a newline yields a dialogue run that trims to nothing and
 * is dropped, so `*动作*\n\n台词` and `*动作* 台词` both produce the same two
 * runs. `**bold**` is left alone: it is emphasis inside a run, not a delimiter.
 * An unclosed `*` is treated as literal text rather than swallowing the rest of
 * the reply.
 * @param text - raw character reply.
 * @returns the runs in reading order; empty when the reply is blank.
 */
export declare function splitSpeechRuns(text: string): SpeechRun[];
/**
 * Render one beat's ordered segments as the assistant message the player sees.
 *
 * Narration becomes a blockquote so it reads as stage direction. Speech becomes
 * a blockquote too, but with the speaker's name as its first paragraph: the
 * client turns that shape into a chat bubble, because a quote containing a name
 * is the only container Markdown can produce here — raw HTML stays literal text
 * in the chat renderer. The client scopes this styling to tavern sessions
 * (`body[data-dshtavern-story]`), so an ordinary conversation is unaffected.
 * @param segments - narration and speech pieces in story order.
 * @returns the visible reply text.
 */
export declare function renderBeatMarkdown(segments: readonly BeatSegment[]): string;
/**
 * Build one character's system prompt: its own card, activated lore, and the
 * observable stage.
 *
 * Lore is keyed on what the character can currently perceive, so the scan text
 * includes the stage, the beat's narration, and the player's own words. The
 * player never enters the stage itself, so leaving that input out would make
 * "the player says X" fail to activate an entry that "a character says X"
 * activates.
 * @param input - resolved prompt layout, the card, its lore, and recent stage.
 * @returns the system prompt text.
 */
export declare function buildCharacterSystem(input: {
    readonly layout: PromptLayout;
    readonly card: CharacterCard;
    readonly stage: readonly StageEntry[];
    /** Workspace lore plus this card's own entries. */
    readonly worldbook?: readonly WorldbookEntry[];
    /** The player's utterance for this beat, if any. */
    readonly playerInput?: string;
    /** Narration this beat already staged, so its keywords count too. */
    readonly narration?: string;
    /** Runtime knobs; omitted fields use the shipped constants. */
    /** Workspace preset persona text; used when the layout names no persona. */
    readonly persona?: string;
    /** Rendered text per persona id, so a block can name the persona it wants. */
    readonly personaById?: Readonly<Record<string, string>>;
    readonly limits?: BeatLimits;
}): string;
/** One character line already spoken this beat, as a later speaker hears it. */
export interface PreviousTurn {
    /** Display name of the character who spoke. */
    readonly name: string;
    /** What they said, as produced by their own call. */
    readonly text: string;
}
/**
 * Build the user message one character receives.
 *
 * The first speaker of a beat answers the player, so their message pairs the
 * new narration with the player's words. Every later speaker answers the turn
 * that just happened: repeating the player's original line as the thing to
 * respond to is what made three characters in one beat all reply "不抖" to a
 * question only one of them was asked. For those turns the player's words stay
 * in the message as background — everyone at the table heard them — but the
 * most recent line is the one the message ends on.
 * @param narration - narration staged for this director turn, if any.
 * @param playerInput - the player's utterance for the beat.
 * @param previous - the character who spoke immediately before this turn.
 * @returns the message text.
 */
export declare function buildCharacterMessage(narration: string, playerInput: string, previous?: PreviousTurn): string;
/**
 * Parse the director's reply into a decision.
 *
 * Accepts the documented JSON object and tolerates a fenced or prefixed reply by
 * extracting the outermost braces. A reply that carries no JSON at all is
 * treated as pure narration, which keeps the story moving instead of failing the
 * turn.
 *
 * Both the JSON and the prose fallback pass through {@link splitTranscriptShaped}
 * first: a director that answers as a transcript (`[旁白] … [白鹭] …`) would
 * otherwise put another character's dialogue on the stage as narration, where
 * every later character reads it as something they witnessed.
 * @param text - raw director output.
 * @returns the parsed decision.
 */
export declare function parseDirectorReply(text: string): DirectorDecision;
/**
 * Whether a reply arrived as the documented JSON object.
 *
 * Distinct from {@link parseDirectorReply}, which always produces a usable
 * decision: this answers the narrower question "did the director obey the
 * contract", so a caller can decide whether a repair call is worth spending.
 * @param text - raw director output.
 * @returns true when the reply parses as a JSON object with a narration field.
 */
export declare function isDirectorJsonReply(text: string): boolean;
/**
 * Prompt asking the director to restate its previous answer as JSON.
 *
 * Used only after a malformed reply: the model already decided what happens,
 * so this asks for the format, not for a new decision.
 * @param originalSystem - the system prompt that produced the malformed reply.
 * @param malformedReply - what the model actually said.
 * @returns the repair system prompt.
 */
export declare function buildDirectorRepairSystem(originalSystem: string, malformedReply: string): string;
/**
 * Split a transcript-shaped reply into narration and the first speaker tag.
 *
 * The director is asked for JSON, but it sometimes answers the way the stage is
 * rendered. This reads the leading narration lines, drops their `[旁白]`
 * markers, and reports the first non-narration tag as the speaker. Text after
 * that tag is discarded: the named character gets its own call, and replaying a
 * pre-written line as well would stage the same speech twice.
 * @param text - raw director output, possibly JSON-wrapped narration.
 * @returns narration plus the tagged speaker name; `undefined` when no tag appears.
 */
export declare function splitTranscriptShaped(text: string): {
    narration: string;
    speakerName?: string;
} | undefined;
/**
 * Resolve the director's speaker reference against the cast.
 *
 * The director is told to answer with an id, but accepting a name keeps a
 * slightly-off answer from dropping the beat's speech.
 * @param decision - director decision.
 * @param cast - cast roster.
 * @returns the matching cast member, or `undefined`.
 */
export declare function resolveSpeaker(decision: DirectorDecision, cast: readonly CastMember[]): CastMember | undefined;
/**
 * Find the cast member the player addressed by name.
 *
 * A Latin name counts only as a whole token, so "Ann" does not match "Annex".
 * Chinese prose has no spaces and a name often abuts a verb ("林见夏在车上"),
 * so CJK characters do not bind: a CJK name matches as a substring. When the
 * player names several characters, the earliest mention wins.
 * @param playerInput - the player's utterance.
 * @param cast - cast roster.
 * @returns the most-mentioned character, or `undefined`.
 */
export declare function mentionedSpeaker(playerInput: string, cast: readonly CastMember[]): CastMember | undefined;
export {};
