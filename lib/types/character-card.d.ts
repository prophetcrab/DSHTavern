/** Card schema version this build reads and writes. */
export declare const CHARACTER_SCHEMA = 1;
/** Discriminator stored in every card. */
export declare const CHARACTER_KIND = "dshtavern.character";
/** File extension for one character card. */
export declare const CHARACTER_EXTENSION = ".charc";
/** Directory holding character cards, relative to the workspace root. */
export declare const CHARACTERS_DIRECTORY = "characters";
/** Largest accepted card file. */
export declare const CHARACTER_CARD_MAX_BYTES: number;
/** One card-owned lore entry (character book entry). */
export interface CharacterEntry {
    readonly id: string;
    readonly name: string;
    readonly content: string;
    readonly keys: readonly string[];
    readonly position: 'before' | 'after';
    readonly constant: boolean;
    readonly enabled: boolean;
}
/** One static character definition. */
export interface CharacterCard {
    readonly schema: number;
    readonly kind: typeof CHARACTER_KIND;
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly personality: string;
    readonly scenario: string;
    readonly systemPrompt: string;
    readonly exampleDialogues: string;
    readonly greetings: {
        readonly first: string;
        readonly alternates: readonly string[];
    };
    readonly tags: readonly string[];
    readonly entries: readonly CharacterEntry[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
/** Caller-provided card fields (create/save). */
export interface CharacterCardInput {
    readonly name?: unknown;
    readonly description?: unknown;
    readonly personality?: unknown;
    readonly scenario?: unknown;
    readonly systemPrompt?: unknown;
    readonly exampleDialogues?: unknown;
    readonly greetings?: unknown;
    readonly tags?: unknown;
    readonly entries?: unknown;
}
/** A stored card is corrupt or violates the schema. */
export declare class CharacterCardInvalidError extends Error {
    readonly path?: string | undefined;
    constructor(message: string, path?: string | undefined);
}
/** @param workspaceDir - tavern workspace root. @returns its characters directory. */
export declare function charactersDirectory(workspaceDir: string): string;
/** @param workspaceDir - tavern workspace root. @param id - card id. @returns the absolute card path. */
export declare function characterCardPath(workspaceDir: string, id: string): string;
/**
 * Whether an id is safe to use as a card file name.
 * @param id - candidate id.
 * @returns true for ids this build may read or write.
 */
export declare function isCharacterId(id: string): boolean;
/**
 * Build a normalized card from caller input.
 * @param id - stable card id.
 * @param input - caller fields.
 * @param timestamps - creation/update instants.
 * @returns the validated card.
 */
export declare function buildCharacterCard(id: string, input: CharacterCardInput, timestamps: {
    createdAt: string;
    updatedAt: string;
}): CharacterCard;
/**
 * Parse one stored card.
 * @param text - file content.
 * @param path - file path for diagnostics.
 * @returns the validated card.
 */
export declare function parseCharacterCard(text: string, path: string): CharacterCard;
/**
 * Parse an imported card as a new card owned by the target workspace.
 *
 * An exported `.charc` carries its original id and timestamps; importing keeps
 * the content but mints a fresh id, so importing into the workspace a card came
 * from creates a copy instead of colliding with or overwriting the original.
 * @param text - file content.
 * @param path - file path for diagnostics.
 * @returns the card to store.
 */
export declare function parseCharacterCardImport(text: string, path: string): CharacterCard;
/**
 * Render one card as a portable `.charc` document.
 *
 * Byte-for-byte the format {@link writeCard} stores, so an exported file can be
 * re-imported without a conversion step.
 * @param card - stored card.
 * @returns the JSON text to download.
 */
export declare function exportCharacterCardText(card: CharacterCard): string;
/** One unreadable card found during a directory scan. */
export interface CharacterCardProblem {
    readonly file: string;
    readonly error: string;
}
/** Result of listing one workspace's cards. */
export interface CharacterCardListing {
    readonly cards: readonly CharacterCard[];
    readonly problems: readonly CharacterCardProblem[];
}
/**
 * List every card in one workspace.
 * @param workspaceDir - tavern workspace root.
 * @returns readable cards (newest first) and unreadable files.
 */
export declare function listCharacterCards(workspaceDir: string): Promise<CharacterCardListing>;
/**
 * Read one workspace's cards synchronously.
 *
 * The prompt text provider runs while DSH assembles a request, before any async
 * hook can run, so it cannot await the directory scan. Unreadable files are
 * skipped exactly as in {@link listCharacterCards}.
 * @param workspaceDir - tavern workspace root.
 * @returns readable cards, newest first.
 */
export declare function listCharacterCardsSync(workspaceDir: string): CharacterCard[];
/**
 * Read one card.
 * @param workspaceDir - tavern workspace root.
 * @param id - card id.
 * @returns the card, or undefined when absent.
 */
export declare function readCharacterCard(workspaceDir: string, id: string): Promise<CharacterCard | undefined>;
/**
 * Persist one already-validated card.
 * @param workspaceDir - tavern workspace root.
 * @param card - card to store; its id names the file.
 */
export declare function writeCharacterCard(workspaceDir: string, card: CharacterCard): Promise<void>;
/**
 * Create one card in a workspace.
 * @param workspaceDir - tavern workspace root.
 * @param input - card fields.
 * @returns the stored card.
 */
export declare function createCharacterCard(workspaceDir: string, input: CharacterCardInput): Promise<CharacterCard>;
/**
 * Save one existing card.
 * @param workspaceDir - tavern workspace root.
 * @param id - card id.
 * @param input - replacement card fields.
 * @returns the stored card.
 * @throws CharacterCardInvalidError when the card does not exist.
 */
export declare function saveCharacterCard(workspaceDir: string, id: string, input: CharacterCardInput): Promise<CharacterCard>;
/**
 * Delete one card.
 * @param workspaceDir - tavern workspace root.
 * @param id - card id.
 * @returns whether a card file was removed.
 */
export declare function deleteCharacterCard(workspaceDir: string, id: string): Promise<boolean>;
