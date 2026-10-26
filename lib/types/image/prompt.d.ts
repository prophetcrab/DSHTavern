/**
 * Neutral prompt construction for scene and portrait images.
 *
 * The draft is built only from what the player already saw: a beat's narration
 * and speech, the public scene description, and the speaking characters' card
 * appearance. Director-private notes (`inner`, `world.hidden`) never reach an
 * image prompt, so an illustration cannot spoil a reveal.
 */
import type { CharacterCard } from '../character-card.js';
import type { StoredBeat } from '../regenerate.js';
import type { ImageConfig, ImagePreset, ImageStyle } from './config.js';
import type { Aspect, ImageMode, ProviderCapabilities } from './providers/types.js';
/** One character as the image prompt sees it. */
export interface PromptCharacter {
    readonly id: string;
    readonly name: string;
    readonly appearance: string;
}
/** A scene preview and its editable draft. */
export interface ScenePreview {
    readonly mode: 'scene';
    readonly turn: number;
    readonly scene: string;
    readonly characters: readonly PromptCharacter[];
    readonly draft: string;
    readonly negative: string;
    readonly aspect: Aspect;
    readonly style: ImageStyle;
    readonly preset: ImagePreset;
}
/** A portrait preview and its editable draft. */
export interface PortraitPreview {
    readonly mode: 'portrait';
    readonly cardId: string;
    readonly cardName: string;
    readonly appearance: string;
    readonly personality: string;
    readonly scenario: string;
    readonly draft: string;
    readonly negative: string;
    readonly aspect: Aspect;
    readonly style: ImageStyle;
    readonly preset: ImagePreset;
}
/** A prompt could not be built from the requested target. */
export declare class ImagePromptError extends Error {
    constructor(message: string);
}
/** Most scene text one draft forwards. */
export declare const SCENE_CONTEXT_MAX = 4000;
/** Most appearance text one character contributes. */
export declare const CHARACTER_APPEARANCE_MAX = 600;
/** @param text - free text. @returns its first non-empty paragraph, trimmed. */
export declare function firstParagraph(text: string): string;
/** @param card - character card. @returns the appearance used by image prompts. */
export declare function cardAppearance(card: CharacterCard): string;
/** Replace `{{name}}` placeholders, case-insensitively and tolerating spaces. */
export declare function renderImageTemplate(template: string, values: Readonly<Record<string, string>>): string;
/**
 * Find the beat one image targets.
 * @param workspaceDir - tavern workspace root.
 * @param sessionId - chat identity.
 * @param turn - 0/undefined for the newest beat, otherwise an exact turn.
 * @returns the stored beat, or `undefined`.
 */
export declare function findBeat(workspaceDir: string, sessionId: string, turn: number | undefined): Promise<StoredBeat | undefined>;
/**
 * Build the scene context and draft for one beat.
 * @param beat - stored beat.
 * @param cards - workspace cards.
 * @param config - image settings.
 * @returns the preview.
 * @throws ImagePromptError when the beat has no readable turn number.
 */
export declare function scenePreview(beat: StoredBeat, cards: readonly CharacterCard[], config: ImageConfig): ScenePreview;
/**
 * Build the portrait context and draft for one card.
 * @param card - character card.
 * @param config - image settings.
 * @returns the preview.
 */
export declare function portraitPreview(card: CharacterCard, config: ImageConfig): PortraitPreview;
/** The system prompt one LLM refinement call receives. */
export declare function buildRefineSystem(input: {
    readonly mode: ImageMode;
    readonly providerLabel: string;
    readonly capabilities: ProviderCapabilities;
    readonly preset: ImagePreset;
}): string;
/** The user message one refinement call receives. */
export declare function buildRefineMessage(input: {
    readonly context: string;
    readonly draft: string;
    readonly preset: ImagePreset;
}): string;
/** One refined prompt. */
export interface RefinedPrompt {
    readonly prompt: string;
    readonly negative?: string;
    /** Whether the model answered as JSON; false means the raw text was used. */
    readonly parsed: boolean;
}
/**
 * Parse a refinement reply.
 *
 * A model that ignores the JSON contract still produced useful text, so the
 * raw answer becomes the prompt rather than failing the call. The result is
 * clamped to the provider's published limit; the user sees the final text and
 * can edit it before approval.
 * @param text - model output.
 * @param promptMaxChars - provider limit, when known.
 * @returns the refined prompt.
 * @throws ImagePromptError when the reply is empty.
 */
export declare function parseRefineReply(text: string, promptMaxChars: number | undefined): RefinedPrompt;
/** Merge a negative prompt for a provider without a separate field. */
export declare function promptWithNegative(prompt: string, negative: string | undefined): string;
