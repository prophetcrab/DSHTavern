import type { StageEntry } from './stage.js';
import type { WorldbookEntry } from './worldbook-match.js';
export { WORLDBOOK_ACTIVE_CHARS_MAX, WORLDBOOK_ACTIVE_MAX, WORLDBOOK_DEFAULT_DEPTH, WORLDBOOK_SCAN_LINES, activateEntries, renderLore, wholeWordIndex, } from './worldbook-match.js';
export type { ActivationOptions, LoreReader, WholeWordOptions, WorldbookEntry, WorldbookLogic, WorldbookVisibility, } from './worldbook-match.js';
/** Worldbook file name inside the tavern state directory. */
export declare const WORLDBOOK_FILE = "worldbook.json";
/** Schema version this build reads and writes. */
export declare const WORLDBOOK_SCHEMA = 1;
/** Persisted worldbook file. */
export interface WorldbookFile {
    readonly schema: number;
    readonly entries: readonly WorldbookEntry[];
    /** ISO-8601 of the last write. */
    readonly updatedAt?: string;
}
/** Largest entry content accepted. */
export declare const WORLDBOOK_CONTENT_MAX = 64000;
/** Largest number of entries a workspace may store. */
export declare const WORLDBOOK_ENTRIES_MAX = 512;
/** A worldbook file or entry is structurally invalid. */
export declare class WorldbookInvalidError extends Error {
    readonly path?: string | undefined;
    constructor(message: string, path?: string | undefined);
}
/** @param workspaceDir - tavern workspace root. @returns the worldbook file path. */
export declare function worldbookPath(workspaceDir: string): string;
/** @returns an empty worldbook. */
export declare function emptyWorldbook(): WorldbookFile;
/**
 * Build one entry from caller input, applying defaults.
 * @param input - partial entry; `id` is generated when absent.
 * @param path - file path for diagnostics.
 * @returns the normalised entry.
 * @throws WorldbookInvalidError when a required field is missing or malformed.
 */
export declare function buildEntry(input: unknown, path?: string): WorldbookEntry;
/**
 * Parse a stored worldbook file.
 * @param text - file content.
 * @param path - file path for diagnostics.
 * @returns the parsed file.
 * @throws WorldbookInvalidError when the document is unusable.
 */
export declare function parseWorldbook(text: string, path: string): WorldbookFile;
/**
 * Read one workspace's worldbook.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored book, or an empty one when absent.
 */
export declare function readWorldbook(workspaceDir: string): Promise<WorldbookFile>;
/** Discriminator stamped into an exported `.world` file. */
export declare const WORLDBOOK_EXPORT_KIND = "dshtavern.worldbook";
/** Envelope written to a `.world` file. */
export interface WorldbookExport {
    readonly kind: typeof WORLDBOOK_EXPORT_KIND;
    readonly schema: number;
    /** ISO-8601 of the export, informational only. */
    readonly exportedAt: string;
    /** Workspace title the book came from, informational only. */
    readonly source?: string;
    readonly entries: readonly WorldbookEntry[];
}
/**
 * Render one workspace's worldbook as a portable `.world` document.
 *
 * The export carries every entry verbatim so a round-trip through import
 * reproduces the same book; the envelope's own fields are advisory and never
 * feed back into matching.
 * @param book - stored worldbook.
 * @param source - workspace title for provenance, when known.
 * @returns the JSON text to download.
 */
export declare function exportWorldbookText(book: WorldbookFile, source?: string): string;
/**
 * Parse a `.world` document into entries ready for {@link writeWorldbook}.
 *
 * Accepts the exported envelope and, for hand-written files, a bare entry
 * array. Each entry is validated by {@link buildEntry}; a document whose
 * entries are all invalid is rejected rather than silently importing nothing.
 * @param text - file content.
 * @param path - file path for diagnostics.
 * @returns the validated entries.
 * @throws WorldbookInvalidError when the document is unusable.
 */
export declare function parseWorldbookImport(text: string, path: string): WorldbookEntry[];
/**
 * Persist one workspace's worldbook atomically.
 * @param workspaceDir - tavern workspace root.
 * @param entries - complete entry list, however malformed.
 * @returns the stored book.
 */
export declare function writeWorldbook(workspaceDir: string, entries: unknown): Promise<WorldbookFile>;
/** Stage lines as scan text, newest last. */
/**
 * Convert a character card's own entries into worldbook entries.
 *
 * Card entries are private to that character, so they are only ever merged into
 * that card's own assembly; they are never offered to another character.
 * @param entries - card-owned entries.
 * @returns equivalent worldbook entries.
 */
export declare function fromCardEntries(entries: readonly {
    readonly id: string;
    readonly name: string;
    readonly content: string;
    readonly keys: readonly string[];
    readonly position: 'before' | 'after';
    readonly constant: boolean;
    readonly enabled: boolean;
}[]): WorldbookEntry[];
/**
 * Stage lines as scan text, newest last.
 * @param stage - staged lines.
 * @param limit - how many trailing lines to include.
 * @returns one line per entry, speech attributed to its speaker.
 */
export declare function stageScanLines(stage: readonly StageEntry[], limit?: number): string[];
