/**
 * Resolve the persona text a character prompt should use.
 *
 * The layout decides: a `user-persona` block that names a persona renders that
 * one, and a block that names none follows the workspace preset. Both callers —
 * the live beat and the preview — go through this function so the two can never
 * disagree about who the player is.
 */
import { readPersonaFile, renderPersona } from './persona.js'
import type { PromptLayout } from './prompt-layout.js'

/** Persona inputs for one prompt assembly. */
export interface PersonaContext {
  /** Workspace preset persona, rendered; used when the layout names none. */
  readonly persona?: string
  /** Rendered text for every persona the layout could name. */
  readonly personaById: Readonly<Record<string, string>>
}

/**
 * Load the persona context for one workspace and layout.
 * @param workspaceDir - tavern workspace root.
 * @param layout - the layout whose `user-persona` block decides the choice.
 * @returns the preset text and every candidate the layout may name.
 */
export async function resolvePersonaContext(
  workspaceDir: string,
  layout: PromptLayout,
): Promise<PersonaContext> {
  const file = await readPersonaFile(workspaceDir)
  const personaById: Record<string, string> = {}
  for (const persona of file.personas) personaById[persona.id] = renderPersona(persona)
  const preset = file.activeId === undefined
    ? undefined
    : file.personas.find(persona => persona.id === file.activeId)
      ?? file.personas[0]
  // Only the preset is rendered here; a named persona resolves from the map, so
  // a layout naming a deleted persona falls back to the preset rather than
  // dropping the block.
  return {
    personaById,
    ...(preset === undefined ? {} : { persona: renderPersona(preset) }),
  }
}
