/** Persona file name inside the tavern state directory. */
export declare const PERSONA_FILE = "persona.json";
/** Persona schema version this build reads and writes. */
export declare const PERSONA_SCHEMA = 1;
/** Largest accepted persona file. */
export declare const PERSONA_FILE_MAX_BYTES: number;
/** Most personas one workspace may keep. */
export declare const PERSONA_MAX = 64;
/** One player persona. */
export interface Persona {
    /** Stable identity used by the workbench and the active pointer. */
    readonly id: string;
    /** Display name the characters address the player by. */
    readonly name: string;
    /** Appearance and identifying details. */
    readonly description: string;
    /** Temperament and manner. */
    readonly personality: string;
    /** History the player brings into the story. */
    readonly background: string;
    /** Optional note on how the player speaks; kept separate from temperament. */
    readonly speakingStyle: string;
    /**
     * Everything else that defines the player: abilities, possessions, standing
     * with factions, obligations. Kept apart from `background` so history and
     * current state never blur together.
     */
    readonly characterSheet: string;
    /** Free-form labels for the list. */
    readonly tags: readonly string[];
    /** ISO-8601 creation instant. */
    readonly createdAt: string;
    /** ISO-8601 of the last save. */
    readonly updatedAt: string;
}
/** Caller-provided persona fields. */
export interface PersonaInput {
    readonly name?: unknown;
    readonly description?: unknown;
    readonly personality?: unknown;
    readonly background?: unknown;
    readonly speakingStyle?: unknown;
    readonly characterSheet?: unknown;
    readonly tags?: unknown;
}
/** Persisted persona file. */
export interface PersonaFile {
    readonly schema: number;
    /** Persona whose fields the prompts use; absent when the library is empty. */
    readonly activeId?: string;
    readonly personas: readonly Persona[];
    /** ISO-8601 of the last write. */
    readonly updatedAt?: string;
}
/** A persona file or entry is structurally invalid. */
export declare class PersonaInvalidError extends Error {
    readonly path?: string | undefined;
    constructor(message: string, path?: string | undefined);
}
/** @param workspaceDir - tavern workspace root. @returns the persona file path. */
export declare function personaPath(workspaceDir: string): string;
/** @returns an empty persona library. */
export declare function emptyPersonaFile(): PersonaFile;
/**
 * Build one persona from caller input.
 * @param input - caller fields.
 * @param timestamps - creation and update instants.
 * @param id - stable identity; generated when absent.
 * @returns the validated persona.
 * @throws PersonaInvalidError when a field is malformed or the name is empty.
 */
export declare function buildPersona(input: PersonaInput, timestamps: {
    createdAt: string;
    updatedAt: string;
}, id?: string): Persona;
/**
 * Parse a stored persona file.
 * @param body - file content.
 * @param path - file path for diagnostics.
 * @returns the parsed file.
 * @throws PersonaInvalidError when the document is unusable.
 */
export declare function parsePersonaFile(body: string, path: string): PersonaFile;
/**
 * Read one workspace's persona library.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored library, or an empty one when absent.
 */
export declare function readPersonaFile(workspaceDir: string): Promise<PersonaFile>;
/**
 * Resolve the persona the prompts should use.
 * @param workspaceDir - tavern workspace root.
 * @returns the active persona, or `undefined` when the library is empty.
 */
export declare function readActivePersona(workspaceDir: string): Promise<Persona | undefined>;
/**
 * Persist one workspace's persona library atomically.
 * @param workspaceDir - tavern workspace root.
 * @param file - complete library.
 * @returns the stored library with a fresh `updatedAt`.
 */
export declare function writePersonaFile(workspaceDir: string, file: Omit<PersonaFile, 'schema' | 'updatedAt'>): Promise<PersonaFile>;
/**
 * Render the active persona as the `user-persona` block text.
 *
 * Empty fields are dropped rather than emitted as labelled blanks, so a sparse
 * persona still reads as prose instead of a form.
 * @param persona - active persona.
 * @returns the block text; empty when the persona carries no content.
 */
export declare function renderPersona(persona: Persona): string;
