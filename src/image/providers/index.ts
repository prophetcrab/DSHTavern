/**
 * Implemented image provider adapters.
 *
 * Adding a provider is one module plus one entry here; the rest of the plugin
 * works from the capability table and the neutral request. ComfyUI and Gemini
 * are named in the type union but intentionally absent until their adapters
 * land.
 */
import type { ImageProvider, ProviderConfig, ProviderGenerateInput, ProviderId, RuntimeImageProvider } from './types.js'
import { openAiImagesProvider } from './openai-images.js'
import { jimengProvider } from './jimeng.js'

/** Erase a provider's specific config type at the registry boundary. */
function runtime<C extends ProviderConfig>(provider: ImageProvider<C>): RuntimeImageProvider {
  return provider as unknown as RuntimeImageProvider
}

/** Providers this build can call. */
export const IMAGE_PROVIDERS: Readonly<Record<string, RuntimeImageProvider>> = {
  'openai-images': runtime(openAiImagesProvider),
  jimeng: runtime(jimengProvider),
}

/** @param id - provider id. @returns its adapter, or `undefined` when unimplemented. */
export function imageProvider(id: ProviderId): RuntimeImageProvider | undefined {
  return IMAGE_PROVIDERS[id]
}

/** @param id - provider id. @returns a capability table, with a conservative fallback. */
export function providerCapabilities(id: ProviderId): RuntimeImageProvider['capabilities'] {
  return imageProvider(id)?.capabilities ?? {
    negative: false,
    seed: false,
    aspects: ['1:1'],
    referenceImages: false,
    async: false,
    maxCount: 1,
  }
}

/** @param id - provider id. @returns the label shown in the panel. */
export function providerLabel(id: ProviderId): string {
  return imageProvider(id)?.label ?? id
}

/** Re-export the generate input type for the service. */
export type { ProviderGenerateInput }
