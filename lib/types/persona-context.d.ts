import type { PromptLayout } from './prompt-layout.js';
/** Persona inputs for one prompt assembly. */
export interface PersonaContext {
    /** Workspace preset persona, rendered; used when the layout names none. */
    readonly persona?: string;
    /** Rendered text for every persona the layout could name. */
    readonly personaById: Readonly<Record<string, string>>;
}
/**
 * Load the persona context for one workspace and layout.
 * @param workspaceDir - tavern workspace root.
 * @param layout - the layout whose `user-persona` block decides the choice.
 * @returns the preset text and every candidate the layout may name.
 */
export declare function resolvePersonaContext(workspaceDir: string, layout: PromptLayout): Promise<PersonaContext>;
