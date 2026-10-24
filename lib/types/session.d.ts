/**
 * Tavern prompt assembly (A route, D005).
 *
 * Mounted as the only row of the `tavern` agent preset. For every agent created
 * under this preset it:
 *
 * - registers a `complete` system-prompt section whose text is the workspace's
 *   edited prompt block order (the sole system prompt),
 * - suppresses optional runtime context, and
 * - refreshes that text before each step from
 *   `ctx.tavernWorkspaces.assemblePromptText(sessionCwd)`.
 *
 * Nothing global, cross-workspace, or preset-default participates. DSH's
 * required working-directory context survives by design (D005).
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name. */
export declare const name = "tavern-prompt";
/** Services this preset row requires. */
export declare const inject: string[];
/** Prompt-section name registered per agent; unique within the agent scope. */
export declare const SECTION_NAME = "tavern:workspace-prompt";
/**
 * Register the per-agent complete prompt section and its pre-step refresh.
 * @param ctx - the preset row context (scope shared by tavern agents).
 */
export declare function apply(ctx: Context): void;
