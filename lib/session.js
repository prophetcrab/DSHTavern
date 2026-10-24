import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
/** Cordis plugin name. */
export const name = 'tavern-prompt';
/** Services this preset row requires. */
export const inject = ['systemPrompt', 'tavernWorkspaces'];
/** Prompt-section name registered per agent; unique within the agent scope. */
export const SECTION_NAME = 'tavern:workspace-prompt';
/** Section order: a complete section ignores ordering, but keep it deterministic. */
const SECTION_ORDER = -1000;
// TEMPORARY diagnosis for preset mounting; removed once the row is verified.
const DEBUG_FILE = join(process.env.TEMP ?? process.env.DSH_HOME ?? '.', 'dshtavern-session-debug.log');
function debug(line) {
    void appendFile(DEBUG_FILE, `${new Date().toISOString()} ${line}\n`, 'utf8').catch(() => undefined);
}
/**
 * Register the per-agent complete prompt section and its pre-step refresh.
 * @param ctx - the preset row context (scope shared by tavern agents).
 */
export function apply(ctx) {
    debug('apply: tavern preset row loaded');
    ctx.on('agent/created', ({ agent }) => {
        const cwd = agent.session.header.cwd;
        debug(`agent/created cwd=${String(cwd)}`);
        let promptText = '';
        agent.ctx.effect(() => agent.ctx.systemPrompt.section({
            name: SECTION_NAME,
            order: SECTION_ORDER,
            complete: true,
            interpolate: false,
            text: () => promptText,
        }), 'tavern: workspace prompt section');
        debug('section registered');
        agent.ctx.systemPrompt.suppressRuntimeContext();
        agent.ctx.on('agent/pre-step', async (_payload, next) => {
            try {
                const assembled = await ctx.tavernWorkspaces.assemblePromptText(cwd);
                if (assembled !== undefined)
                    promptText = assembled;
                debug(`pre-step cwd=${String(cwd)} assembled=${assembled === undefined ? 'undefined' : String(assembled.length)}`);
            }
            catch (error) {
                ctx.logger.warn(`[dshtavern] prompt assembly failed: ${String(error)}`);
                debug(`pre-step failed: ${String(error)}`);
            }
            return next();
        });
    });
}
