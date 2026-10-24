/**
 * Worldbook matching engine.
 *
 * Pure key matching and activation, shared by the host (which assembles real
 * prompts) and the browser half (which previews activation in the editor).
 * Nothing here touches the filesystem, so both bundles carry the same rules and
 * a preview cannot disagree with the request it describes.
 */
/** How secondary keys combine with a primary hit. */
export type WorldbookLogic = 'and_any' | 'and_all' | 'not_any' | 'not_all';
/**
 * Who may read an entry.
 *
 * Visibility replaces the earlier insert-position split: an entry is filed by
 * its audience, not by where it lands in the prompt. `all` reaches every
 * character, `director` reaches only the director, and `characters` reaches the
 * listed character ids. The director reads every entry regardless, because it
 * is the game master and not a character.
 */
export type WorldbookVisibility = 'all' | 'director' | 'characters';
/** One keyed lore entry. */
export interface WorldbookEntry {
    /** Stable identity used by the editor and the stage records. */
    readonly id: string;
    /** Display name; also the heading this entry contributes. */
    readonly name: string;
    /** Text injected when the entry activates. */
    readonly content: string;
    /** Primary triggers; any one hit activates the entry. */
    readonly keys: readonly string[];
    /** Refining triggers consulted through {@link WorldbookEntry.logic}. */
    readonly secondaryKeys: readonly string[];
    /** How secondary keys combine. */
    readonly logic: WorldbookLogic;
    /** Always inject, ignoring keys. */
    readonly constant: boolean;
    /** Lower values appear earlier in the prompt and survive the budget first. */
    readonly order: number;
    /** How many recent stage lines the scan covers; `0` means the whole window. */
    readonly depth: number;
    /** Whether this entry participates at all. */
    readonly enabled: boolean;
    /** Match case-sensitively. */
    readonly caseSensitive: boolean;
    /** Require the key to sit on word boundaries. */
    readonly wholeWords: boolean;
    /** Who may read the entry. */
    readonly visibility: WorldbookVisibility;
    /** Character ids when `visibility` is `characters`; ignored otherwise. */
    readonly characterIds: readonly string[];
}
/** A prompt being assembled, as far as lore selection is concerned. */
export type LoreReader = {
    readonly kind: 'director';
} | {
    readonly kind: 'character';
    readonly characterId: string;
};
/** Most entries one request may carry. */
export declare const WORLDBOOK_ACTIVE_MAX = 8;
/** Most characters of lore one request may carry. */
export declare const WORLDBOOK_ACTIVE_CHARS_MAX = 6000;
/** Default scan window when an entry names no depth. */
export declare const WORLDBOOK_DEFAULT_DEPTH = 6;
/** Stage lines the caller should hand to {@link activateEntries} by default. */
export declare const WORLDBOOK_SCAN_LINES = 20;
/** Options for {@link activateEntries}. */
export interface ActivationOptions {
    /** Entries from the workspace and the active character card. */
    readonly entries: readonly WorldbookEntry[];
    /** Text outside the stage that the scan must still cover, such as this beat's narration. */
    readonly scanText: string;
    /** Recent stage lines, oldest first; each entry's `depth` indexes into this. */
    readonly recentLines: readonly string[];
    /** Whose prompt is being assembled; decides which entries are visible. */
    readonly reader: LoreReader;
    /** Maximum entries returned. */
    readonly maxEntries?: number;
    /** Maximum characters of content returned. */
    readonly maxChars?: number;
}
/**
 * Select the entries one reader should receive.
 *
 * Constant entries bypass matching. Keyed entries scan the last `depth` lines
 * (their own depth, else the whole provided window) plus `scanText`. Secondary
 * keys then narrow the hit through the entry's logic. The result is ordered by
 * `order` and cut to the budget, so a long worldbook degrades predictably
 * instead of silently consuming the request.
 * @param options - entries, scan inputs, reader, and budget.
 * @returns activated entries in injection order.
 */
export declare function activateEntries(options: ActivationOptions): WorldbookEntry[];
/**
 * Render activated entries as prompt text.
 * @param entries - activated entries in injection order.
 * @returns their contents joined in order; empty when none activated.
 */
export declare function renderLore(entries: readonly WorldbookEntry[]): string;
/**
 * Whether one entry may be read by one prompt.
 *
 * The director reads everything: entries scoped to a single character are facts
 * the game master still knows. A character reads only entries marked for
 * everyone or for that exact character.
 * @param entry - candidate entry.
 * @param reader - the prompt being assembled.
 * @returns whether the reader may receive this entry.
 */
export declare function readableBy(entry: WorldbookEntry, reader: LoreReader): boolean;
/** Options for {@link wholeWordIndex}. */
export interface WholeWordOptions {
    /** Whether the comparison keeps case. */
    readonly caseSensitive: boolean;
    /**
     * Whether CJK characters count as word characters.
     *
     * Worldbook keys are explicit author choices, so an entry asking for whole
     * words means "伞 must not fire inside 雨伞架". Mention detection runs over
     * running prose where a name directly abuts a verb, so it leaves this off.
     */
    readonly cjkWords: boolean;
}
/**
 * Find a key that sits on word boundaries.
 * @param subject - text to search.
 * @param needle - key to find.
 * @param options - case folding and whether CJK binds.
 * @returns the match index, or `-1` when no bounded occurrence exists.
 */
export declare function wholeWordIndex(subject: string, needle: string, options: WholeWordOptions): number;
