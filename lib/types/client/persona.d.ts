import type { ReactElement } from 'react';
/** One persona as served by `/tavern/personas`. */
export interface PersonaView {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly personality: string;
    readonly background: string;
    readonly speakingStyle: string;
    /** Abilities, possessions, standing: everything else that defines the player. */
    readonly characterSheet: string;
    readonly tags: readonly string[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
/**
 * Render the prompt text one persona contributes.
 *
 * Mirrors the host renderer so the preview matches the request. Empty fields are
 * dropped rather than emitted as labelled blanks.
 * @param persona - persona to render.
 * @returns the block text.
 */
export declare function renderPersonaPreview(persona: PersonaView): string;
/** Props of the persona workbench. */
export interface PersonaWorkbenchProps {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
}
/**
 * Two-pane persona editor: the library on the left, the selected persona on the
 * right, with the active persona marked so the list answers "who am I now".
 * @param props - the workspace this workbench edits.
 * @returns the workbench section.
 */
export declare function PersonaWorkbench(props: PersonaWorkbenchProps): ReactElement;
