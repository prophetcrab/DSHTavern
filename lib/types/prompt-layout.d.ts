/**
 * Layout file schema version this build reads and writes.
 *
 * Version 2 added the `lore-tail`, `character-stage`, and `character-duty`
 * character blocks. A version-1 file lists only the original catalogue, so
 * reading one fills the new blocks in at their catalogue positions; a version-2
 * file is not readable by a version-1 build, which rejects unknown ids.
 */
export declare const PROMPT_LAYOUT_SCHEMA = 2;
/** Workspace directory owning prompt files. */
export declare const PROMPT_DIRECTORY = "prompts";
/** Layout file name inside {@link PROMPT_DIRECTORY}. */
export declare const PROMPT_LAYOUT_FILE = "prompt.json";
/** Director-prompt layout file name inside {@link PROMPT_DIRECTORY}. */
export declare const DIRECTOR_LAYOUT_FILE = "director.json";
/** Largest layout file accepted; it also stores edited prompt text. */
export declare const PROMPT_LAYOUT_MAX_BYTES: number;
/** Largest editable content per block. */
export declare const PROMPT_BLOCK_CONTENT_MAX_BYTES: number;
/**
 * Which system prompt a block belongs to.
 *
 * `director` blocks compose the game-master prompt, whose runtime inputs are the
 * world state and the cast roster. `character` blocks compose one character's
 * prompt from its own card. The two catalogues are independent: a block in one
 * never appears in the other's layout.
 */
export type PromptScope = 'director' | 'character';
/** Where a system-prompt block's content comes from. */
export type PromptBlockSource = 'template' | 'character' | 'worldbook' | 'persona' | 'chat' | 'dsh' | 'director' | 'state';
/** One system-prompt block in the catalogue. */
export interface PromptBlockDefinition {
    /** Stable identifier used by the layout file and the client. */
    readonly id: string;
    /** Which prompt this block belongs to. */
    readonly appliesTo: PromptScope;
    /** Display name. */
    readonly label: string;
    /** Content owner, shown as a badge. */
    readonly source: PromptBlockSource;
    /** One-line explanation of what the block contributes. */
    readonly description: string;
    /** Whether the user can edit this block's text in the orchestrator. */
    readonly editable: boolean;
    /** Whether the block renders a chosen persona instead of its own text. */
    readonly selectsPersona?: boolean;
    /** Text used when the layout carries no override. */
    readonly defaultContent: string;
}
/** A persisted block entry: catalogue id, enabled flag, and optional text. */
export interface PromptBlockState {
    readonly id: string;
    readonly enabled: boolean;
    /** Edited text; omitted while the block still uses {@link PromptBlockDefinition.defaultContent}. */
    readonly content?: string;
    /**
     * Persona this block renders instead of its text.
     *
     * Set on `user-persona` when the author picks one of the workspace personas
     * rather than following the workspace's preset; absent means "follow the
     * preset".
     */
    readonly personaId?: string;
}
/** One workspace's persisted prompt layout. */
export interface PromptLayout {
    readonly schema: number;
    /** Blocks in assembly order. */
    readonly blocks: readonly PromptBlockState[];
    /** ISO-8601 of the last write. */
    readonly updatedAt?: string;
}
/** A catalogue entry with the persisted state applied. */
export interface PromptBlockView extends PromptBlockDefinition {
    readonly enabled: boolean;
    /** Effective text: the override when present, otherwise the default. */
    readonly content: string;
    /** Whether the stored layout overrides the default text. */
    readonly overridden: boolean;
    /** Persona this block renders, when the layout names one. */
    readonly personaId?: string;
}
/** A layout file used a newer schema than this build understands. */
export declare class PromptLayoutVersionError extends Error {
    readonly path: string;
    readonly schema: number;
    constructor(path: string, schema: number);
}
/** A layout payload is not a valid full ordering of the catalogue. */
export declare class PromptLayoutInvalidError extends Error {
    constructor(message: string);
}
/**
 * Canonical system-prompt blocks in their default assembly order.
 *
 * This is the exposed surface of prompt orchestration: every block that can
 * reach the model's system prompt must be listed here, including the ones the
 * current DSH composition injects (`dsh` source) so nothing is hidden.
 */
export declare const PROMPT_BLOCKS: readonly PromptBlockDefinition[];
/** Stable set of catalogue ids. */
export declare const PROMPT_BLOCK_IDS: readonly string[];
/**
 * Director-prompt blocks in their default assembly order.
 *
 * The director runs a different job than a character: it narrates, paces the
 * scene, and picks who speaks. Its catalogue therefore holds no card-sourced
 * blocks; `state` blocks are filled at runtime from the world state and roster,
 * exactly as `character` blocks are filled from the active card.
 */
export declare const DIRECTOR_BLOCKS: readonly PromptBlockDefinition[];
/** Stable set of director catalogue ids. */
export declare const DIRECTOR_BLOCK_IDS: readonly string[];
/**
 * @param scope - which prompt the caller composes.
 * @returns that scope's catalogue.
 */
export declare function blocksFor(scope: PromptScope): readonly PromptBlockDefinition[];
/**
 * @param scope - which prompt the caller composes.
 * @returns that scope's catalogue ids.
 */
export declare function blockIdsFor(scope: PromptScope): readonly string[];
/**
 * @param scope - which prompt the layout orders; defaults to the character prompt.
 * @returns the default layout for that scope: catalogue order, every block enabled.
 */
export declare function defaultPromptLayout(scope?: PromptScope): PromptLayout;
/**
 * @param workspaceDir - tavern workspace root.
 * @param scope - which prompt's layout file to address.
 * @returns the absolute layout file path.
 */
export declare function promptLayoutPath(workspaceDir: string, scope?: PromptScope): string;
/**
 * Apply the persisted enabled flags to a catalogue.
 * @param layout - persisted layout.
 * @param scope - which catalogue to resolve against.
 * @returns catalogue entries in layout order.
 */
export declare function promptBlockViews(layout: PromptLayout, scope?: PromptScope): PromptBlockView[];
/** Placeholder values used when rendering the system prompt. */
export interface PromptRenderVariables {
    /** Character name substituted for `{{char}}`. */
    readonly char?: string;
    /** User name substituted for `{{user}}`. */
    readonly user?: string;
}
/**
 * Render the enabled, non-empty blocks into the model-facing system prompt.
 *
 * SillyTavern-style `{{char}}` / `{{user}}` placeholders are substituted here,
 * because DSH's own prompt interpolation rejects unknown variables.
 * @param views - effective block views in assembly order.
 * @param variables - names substituted for the placeholders.
 * @returns the joined prompt text; empty when no block contributes.
 */
export declare function renderPromptText(views: readonly PromptBlockView[], variables?: PromptRenderVariables): string;
/**
 * Fill blocks a stored layout predates, keeping the order the user chose.
 *
 * A stored layout is a full ordering of the catalogue it was written against.
 * When the catalogue grows, the new ids have no slot; inserting each one where
 * it sits in the catalogue default keeps the author's relative order intact
 * and gives the new blocks their enabled default.
 * @param stored - validated blocks from the file, in their stored order.
 * @param scope - catalogue the blocks belong to.
 * @returns a full ordering of the current catalogue.
 */
export declare function mergeCatalogueBlocks(stored: readonly PromptBlockState[], scope?: PromptScope): PromptBlockState[];
export declare function normalizePromptBlocks(value: unknown, scope?: PromptScope): PromptBlockState[];
/**
 * Whether a workspace has at least one imported character card.
 * @param workspaceDir - tavern workspace root.
 * @returns `true` when `<workspace>/characters/` holds a `.charc` card.
 */
export declare function hasCharacterCards(workspaceDir: string): Promise<boolean>;
/**
 * Map a drag among visible blocks onto the full stored ordering.
 *
 * The character-sourced blocks are hidden until a character card exists, so
 * the list the user drags is a subset; this keeps the hidden blocks in place
 * while moving the visible ones.
 * @param blocks - the full block ordering.
 * @param visible - the subset currently rendered, in display order.
 * @param from - dragged index within `visible`.
 * @param to - target index within `visible`.
 * @returns a full ordering with the visible subset reordered.
 */
export declare function reorderVisibleBlocks<T extends {
    readonly id: string;
}>(blocks: readonly T[], visible: readonly T[], from: number, to: number): T[];
/**
 * Read one workspace's layout, falling back to the default when absent.
 * @param workspaceDir - tavern workspace root.
 * @returns the persisted or default layout.
 * @throws PromptLayoutInvalidError when the file is corrupt.
 * @throws PromptLayoutVersionError when the file is newer than this build.
 */
export declare function readPromptLayout(workspaceDir: string, scope?: PromptScope): Promise<PromptLayout>;
/**
 * Synchronous variant used by the prompt text provider, which DSH calls while
 * assembling a request (before any async pre-step hook can run).
 * @param workspaceDir - tavern workspace root.
 * @returns the persisted or default layout.
 */
export declare function readPromptLayoutSync(workspaceDir: string, scope?: PromptScope): PromptLayout;
/**
 * Validate one layout document.
 * @param text - raw file content.
 * @param path - file path used in diagnostics.
 * @returns the validated layout.
 */
export declare function parsePromptLayoutText(text: string, path: string, scope?: PromptScope): PromptLayout;
/**
 * Persist one workspace's layout atomically (temporary file then rename).
 * @param workspaceDir - tavern workspace root.
 * @param blocks - a full ordering; validated before writing.
 * @returns the stored layout.
 */
export declare function writePromptLayout(workspaceDir: string, blocks: unknown, scope?: PromptScope): Promise<PromptLayout>;
