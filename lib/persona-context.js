/**
 * Resolve the persona text a character prompt should use.
 *
 * The layout decides: a `user-persona` block that names a persona renders that
 * one, and a block that names none follows the workspace preset. Both callers —
 * the live beat and the preview — go through this function so the two can never
 * disagree about who the player is.
 */
import { readPersonaFile, renderPersona } from './persona.js';
/**
 * Load the persona context for one workspace and layout.
 * @param workspaceDir - tavern workspace root.
 * @param layout - the layout whose `user-persona` block decides the choice.
 * @returns the preset text and every candidate the layout may name.
 */
export async function resolvePersonaContext(workspaceDir, layout) {
    const file = await readPersonaFile(workspaceDir);
    const personaById = {};
    for (const persona of file.personas)
        personaById[persona.id] = renderPersona(persona);
    const preset = file.activeId === undefined
        ? undefined
        : file.personas.find(persona => persona.id === file.activeId)
            ?? file.personas[0];
    // Only the preset is rendered here; a named persona resolves from the map, so
    // a layout naming a deleted persona falls back to the preset rather than
    // dropping the block.
    return {
        personaById,
        ...(preset === undefined ? {} : { persona: renderPersona(preset) }),
    };
}
