/**
 * Trajectory record for one tavern beat's prompts.
 *
 * The host logs the director and character requests it built, because they
 * never pass through the agent loop's own system-prompt path. This module turns
 * each of those records into a Trajectory row: the collapsed row names the turn
 * and who spoke, and the details pane shows every request that produced it.
 *
 * The row is emitted as a `context` node so the shipped Trajectory layout and
 * details panel render it without any target changes on our side.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ContextMessageNode, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';
/** Source kind the row reports as its producer. */
export declare const BEAT_SOURCE_KIND = "dshtavern-beat";
/** State one record keeps: the rendered node and its row summary. */
interface BeatRowState {
    readonly node: ContextMessageNode;
    readonly summary: string;
}
/** Trajectory Definition rendering one beat's logged prompts. */
export declare const tavernBeatDefinition: ConversationNodeDefinition<BeatRowState>;
/**
 * Register the tavern beat record with the Conversation registry.
 *
 * `uiConversation` is injected rather than required: a profile without the
 * Trajectory/Conversation client halves still loads the rest of the tavern UI,
 * it just has no trajectory tab to contribute to.
 * @param ctx - browser plugin context.
 */
export declare function installTavernBeatRecords(ctx: Context): void;
export {};
