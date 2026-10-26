/**
 * Implemented image provider adapters.
 *
 * Adding a provider is one module plus one entry here; the rest of the plugin
 * works from the capability table and the neutral request. ComfyUI and Gemini
 * are named in the type union but intentionally absent until their adapters
 * land.
 */
import type { ProviderGenerateInput, ProviderId, RuntimeImageProvider } from './types.js';
/** Providers this build can call. */
export declare const IMAGE_PROVIDERS: Readonly<Record<string, RuntimeImageProvider>>;
/** @param id - provider id. @returns its adapter, or `undefined` when unimplemented. */
export declare function imageProvider(id: ProviderId): RuntimeImageProvider | undefined;
/** @param id - provider id. @returns a capability table, with a conservative fallback. */
export declare function providerCapabilities(id: ProviderId): RuntimeImageProvider['capabilities'];
/** @param id - provider id. @returns the label shown in the panel. */
export declare function providerLabel(id: ProviderId): string;
/** Re-export the generate input type for the service. */
export type { ProviderGenerateInput };
