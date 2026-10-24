import type { ReactElement } from 'react';
/** Where a system-prompt block's content comes from. */
/** Which system prompt a block belongs to. */
export type PromptScope = 'director' | 'character';
export type PromptBlockSource = 'template' | 'character' | 'worldbook' | 'persona' | 'chat' | 'dsh' | 'director' | 'state';
/** One system-prompt block in the assembly order. */
export interface PromptBlockView {
    readonly id: string;
    /** Whether this block renders a chosen persona instead of its own text. */
    readonly selectsPersona?: boolean;
    /** Persona the block renders; absent means "follow the preset". */
    readonly personaId?: string;
    /** Which prompt this block belongs to. */
    readonly appliesTo?: PromptScope;
    readonly label: string;
    readonly source: PromptBlockSource;
    readonly description: string;
    readonly enabled: boolean;
    /** Whether the block text can be edited here. */
    readonly editable: boolean;
    /** Effective text (override or catalogue default). */
    readonly content: string;
    /** Catalogue default text. */
    readonly defaultContent: string;
    /** Whether the stored layout overrides the default text. */
    readonly overridden: boolean;
}
/** One workspace's prompt assembly order. */
export interface PromptLayoutSnapshot {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    readonly blocks: readonly PromptBlockView[];
    readonly hasCharacterCard: boolean;
    readonly savedAt?: string;
}
/**
 * Map a drag among the rendered blocks onto the full stored ordering, so the
 * hidden character blocks keep their slots while the visible subset moves.
 * @param blocks - full stored ordering.
 * @param visible - rendered subset, in display order.
 * @param from - dragged index within `visible`.
 * @param to - target index within `visible`.
 * @returns a full ordering with the visible subset reordered.
 */
export declare function reorderVisibleBlocks(blocks: readonly PromptBlockView[], visible: readonly PromptBlockView[], from: number, to: number): PromptBlockView[];
/**
 * Move one array item, returning a new array.
 * @param items - source list.
 * @param from - current index.
 * @param to - target index.
 * @returns reordered copy; unchanged or out-of-bounds indices give a copy.
 */
export declare function moveBlock<T>(items: readonly T[], from: number, to: number): T[];
/** Fetch one workspace's system-prompt assembly order. */
export declare function fetchPromptLayout(workspaceId: string, scope?: PromptScope): Promise<PromptLayoutSnapshot>;
/** Persist a block order, or reset it to the catalogue default. */
export declare function savePromptLayout(workspaceId: string, body: Record<string, unknown>, scope?: PromptScope): Promise<PromptLayoutSnapshot>;
/** One entry the sample line activated. */
export interface PreviewLoreHit {
    readonly id: string;
    readonly name: string;
    readonly visibility: 'all' | 'director' | 'characters';
    readonly chars: number;
}
/** The assembled prompt one scope produces. */
export interface PromptPreview {
    readonly scope: PromptScope;
    readonly system: string;
    readonly cardName?: string;
    readonly cards: readonly {
        id: string;
        name: string;
    }[];
    readonly lore: readonly PreviewLoreHit[];
    readonly loreChars: number;
    readonly sample: string;
}
/** Personas the prompt picker can offer for one workspace. */
export interface PersonaOptions {
    readonly personas: readonly {
        id: string;
        name: string;
    }[];
    /** Name of the workspace preset persona, when one is active. */
    readonly presetName?: string;
}
/**
 * Load the persona choices one workspace offers.
 *
 * The persona library is workspace-scoped, so the picker offers exactly the
 * entries the persona workbench manages.
 * @param workspaceId - tavern workspace id.
 * @returns the selectable personas and the preset's name.
 */
export declare function fetchPersonaOptions(workspaceId: string): Promise<PersonaOptions>;
/**
 * Ask the host to assemble a prompt for inspection.
 *
 * The host runs the same builders the runtime uses, so the result is the request
 * the model would actually receive rather than a client-side approximation.
 * @param workspaceId - tavern workspace id.
 * @param scope - which prompt to assemble.
 * @param options - optional card selection, the sample line to scan, and the
 *   chat whose stage and world the preview should reflect.
 * @returns the assembled preview.
 */
export declare function fetchPromptPreview(workspaceId: string, scope: PromptScope, options?: {
    cardId?: string;
    sample?: string;
    sessionId?: string;
}): Promise<PromptPreview>;
/** One draggable prompt block card. */
export interface PromptCardProps {
    readonly block: PromptBlockView;
    readonly index: number;
    readonly dragging: boolean;
    readonly over: boolean;
    readonly disabled: boolean;
    readonly onDragStart: (index: number) => void;
    readonly onDragOver: (index: number) => void;
    readonly onDrop: (index: number) => void;
    readonly onDragEnd: () => void;
    readonly onToggle: (id: string) => void;
    readonly onOpen: () => void;
    /** Personas the picker may offer; empty when the workspace has none. */
    readonly personas: readonly {
        id: string;
        name: string;
    }[];
    /** Preset persona name, shown on the "follow preset" option. */
    readonly presetName?: string;
    /** Pick one persona for this block, or `undefined` to follow the preset. */
    readonly onPickPersona: (id: string | undefined) => void;
}
/**
 * Render one prompt block card without state, so it is unit-testable.
 * @param props - block data, drag state, and callbacks.
 * @returns the card element.
 */
export declare function PromptCardView(props: PromptCardProps): ReactElement;
/**
 * Character cost of one block, as shown on its card.
 *
 * Card-sourced and runtime blocks carry no stored text: their content is filled
 * while a request is assembled, so a character count would be a lie.
 * @param block - the block to measure.
 * @returns a compact size label.
 */
export declare function promptSizeLabel(block: PromptBlockView): string;
/** Props of the prompt-block edit dialog. */
export interface PromptEditorDialogProps {
    readonly block: PromptBlockView;
    readonly draft: string;
    readonly disabled: boolean;
    readonly onDraftChange: (value: string) => void;
    readonly onSave: () => void;
    readonly onCancel: () => void;
    readonly onResetContent: () => void;
}
/**
 * Floating dialog that edits one block's prompt text.
 * @param props - block, draft text, and editor actions.
 * @returns the dialog element.
 */
export declare function PromptEditorDialog(props: PromptEditorDialogProps): ReactElement;
/** Props of the toolbox prompt orchestration section. */
export interface PromptOrchestrationProps {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    /** Chat whose stage and world the preview should reflect. */
    readonly sessionId?: string;
}
/**
 * Load, edit, and persist one tavern workspace's system-prompt order.
 * @param props - the workspace the toolbox opened for.
 * @returns the orchestration section.
 */
export declare function PromptOrchestration(props: PromptOrchestrationProps): ReactElement;
