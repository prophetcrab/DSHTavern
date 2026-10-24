/**
 * Prompt preview: assemble exactly what the model would receive.
 *
 * The preview calls the same builders the runtime uses, so it cannot drift from
 * the real request. It exists to answer two questions the orchestrator panel
 * cannot answer by inspection: what does the final system prompt look like, and
 * which lore entries actually fire for a given line.
 *
 * A preview synthesizes its own stage from the sample text instead of reading a
 * chat, because a layout is workspace-scoped while a stage belongs to one chat.
 */
import type { CharacterCard } from './character-card.js';
import type { BeatLimits } from './orchestrator.js';
import type { PromptLayout, PromptScope } from './prompt-layout.js';
import type { WorldState } from './stage.js';
import type { WorldbookEntry, WorldbookVisibility } from './worldbook.js';
/** One character available to preview. */
export interface PreviewCardRef {
    readonly id: string;
    readonly name: string;
}
/** One lore entry that the sample line activates. */
export interface PreviewLoreHit {
    readonly id: string;
    readonly name: string;
    readonly visibility: WorldbookVisibility;
    /** Characters of content this entry contributes. */
    readonly chars: number;
}
/** Assembled preview for one scope. */
export interface PromptPreview {
    /** Which prompt was assembled. */
    readonly scope: PromptScope;
    /** The complete system prompt the model would receive. */
    readonly system: string;
    /** Character this preview rendered; absent for the director scope. */
    readonly cardName?: string;
    /** Every card the preview could have rendered. */
    readonly cards: readonly PreviewCardRef[];
    /** Entries the sample line activated, in injection order. */
    readonly lore: readonly PreviewLoreHit[];
    /** Total characters of lore injected. */
    readonly loreChars: number;
    /** Line the preview scanned for triggers. */
    readonly sample: string;
}
/** Inputs {@link buildPreview} needs; the caller loads them from disk. */
export interface PreviewInput {
    readonly scope: PromptScope;
    readonly layout: PromptLayout;
    readonly cards: readonly CharacterCard[];
    /** Card to render for the character scope; defaults to the first card. */
    readonly cardId?: string;
    /** Workspace lore. */
    readonly worldbook: readonly WorldbookEntry[];
    /** Sample player line driving activation. */
    readonly sample?: string;
    /** Director-owned world state, used only by the director scope. */
    readonly world?: WorldState;
    /** Active player persona text, when the workspace has one. */
    readonly persona?: string;
    /** Rendered text per persona id, so a named block can resolve its persona. */
    readonly personaById?: Readonly<Record<string, string>>;
    /** Runtime knobs, so the preview carries the same history and lore as a beat. */
    readonly limits?: BeatLimits;
}
/**
 * Assemble one preview.
 * @param input - layouts, cards, lore, and the sample line.
 * @returns the assembled system prompt plus the entries that fired.
 * @throws Error when the character scope has no card to render.
 */
export declare function buildPreview(input: PreviewInput): PromptPreview;
