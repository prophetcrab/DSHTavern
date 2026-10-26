import type { ImageProvider, ImageRequest, OpenAiImagesConfig, ProviderCapabilities } from './types.js';
/** Aspect ratios GPT Image accepts. */
export declare const OPENAI_ASPECTS: readonly ["1:1", "3:2", "2:3"];
/** Capability table shown by the client. */
export declare const OPENAI_CAPABILITIES: ProviderCapabilities;
/** Map a neutral aspect to a GPT Image size. */
export declare function openAiSize(aspect: ImageRequest['aspect']): string;
/**
 * Resolve the generations endpoint from a base URL.
 *
 * Accepts a bare host, a `/v1` root, or the full `${...}/images/generations`
 * path so a relay configured either way works without a second setting.
 */
export declare function openAiImagesEndpoint(baseUrl: string): string;
/** GPT Image adapter. */
export declare const openAiImagesProvider: ImageProvider<OpenAiImagesConfig>;
