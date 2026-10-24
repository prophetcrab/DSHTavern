/**
 * Click a character's name in a speech bubble to reply to that character.
 *
 * The bubble is rendered from Markdown, so its markup belongs to the chat
 * renderer and no React handler can be attached to the name. This observes the
 * rendered transcript instead: every speech bubble starts with a bold-only
 * paragraph holding the speaker's name, and that paragraph is the click target.
 *
 * Replying means pre-filling the composer with the character's name, not
 * sending anything: the player still writes the line, and the tavern's
 * "player named a character" rule routes the answer to that character.
 */
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client';
/** Attribute set on a speech bubble's name paragraph. */
export declare const REPLY_TARGET_ATTRIBUTE = "data-dshtavern-reply";
/**
 * Prefix the composer receives when the player picks a speaker.
 *
 * Reads as an addressed line rather than a script-style speaker tag, so the
 * player finishes a sentence ("对白鹭说，你先别动") instead of writing dialogue
 * in a transcript format.
 * @param name - the speaker being addressed.
 * @returns the prefilled prefix, ending where the player starts typing.
 */
export declare function replyPrefix(name: string): string;
/**
 * Speaker name of the bubble one paragraph belongs to.
 *
 * The bubble is a blockquote whose first child paragraph holds only the name;
 * anything else in the transcript is narration or ordinary prose and is not a
 * reply target.
 * @param element - candidate paragraph.
 * @returns the name, or `undefined` when the element is not a bubble's name.
 */
export declare function speakerNameOf(element: Element): string | undefined;
/**
 * Mark every bubble name in the transcript as a reply target.
 *
 * Idempotent and cheap: it only touches attributes, so a re-render that drops
 * them is repaired by the next observation rather than patched in place.
 */
export declare function markReplyTargets(): void;
/**
 * Pre-fill the composer so the next line is addressed to one character.
 * @param actions - the session's public input actions.
 * @param name - speaker name to prefix.
 */
export declare function startReply(actions: InputActions | undefined, name: string): void;
/**
 * Keep bubble names clickable for the life of one mounted session view.
 *
 * One delegated listener handles every bubble, including ones rendered later,
 * so scrolling through history needs no per-element bookkeeping.
 * @param actions - the session's public input actions.
 * @returns a disposer that stops observing and removes the listener.
 */
export declare function installReplyTargets(actions: InputActions | undefined): () => void;
