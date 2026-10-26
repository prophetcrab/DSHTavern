/**
 * Provider-neutral image generation types.
 *
 * A provider adapter translates one canonical request into its own wire shape
 * and turns the answer back into bytes. The canonical request deliberately
 * carries only what every provider can understand; provider-specific knobs are
 * config, never prompt input from the model or a beat.
 */

/** One of the image modalities the tavern can ask for. */
export type ImageMode = 'scene' | 'portrait'

/** Aspect ratios the neutral layer understands. */
export type Aspect = '1:1' | '3:2' | '2:3' | '16:9'

/** Provider ids this build knows about. Only some are implemented. */
export type ProviderId = 'openai-images' | 'jimeng' | 'comfyui' | 'gemini-image'

/** One image generation request after prompt approval. */
export interface ImageRequest {
  readonly mode: ImageMode
  readonly prompt: string
  readonly negative?: string
  readonly aspect: Aspect
  /** This build always asks for one image; the field keeps the seam open. */
  readonly count: 1
  readonly seed?: number
}

/** One decoded image returned by a provider. */
export interface GeneratedImage {
  readonly bytes: Uint8Array
  readonly mime: string
}

/** One provider's answer to a request. */
export interface ImageResult {
  readonly images: readonly GeneratedImage[]
  readonly provider: ProviderId
  readonly model: string
  readonly seed?: number
  readonly revisedPrompt?: string
}

/** What one provider can honor; the UI and the prompt builder read this. */
export interface ProviderCapabilities {
  /** Whether the provider has a separate negative-prompt field. */
  readonly negative: boolean
  /** Whether the provider accepts a seed. */
  readonly seed: boolean
  /** Aspect ratios the provider accepts. */
  readonly aspects: readonly Aspect[]
  /** Whether reference images are supported (future). */
  readonly referenceImages: boolean
  /** Whether `generate` submits and polls a task internally. */
  readonly async: boolean
  /** Most images one request may ask for. */
  readonly maxCount: number
  /** Hard prompt length the provider accepts, when it publishes one. */
  readonly promptMaxChars?: number
}

/** OpenAI Images / GPT Image settings. */
export interface OpenAiImagesConfig {
  readonly baseUrl: string
  readonly model: string
  readonly quality: string
}

/** Volcengine Jimeng (即梦) settings. */
export interface JimengConfig {
  readonly endpoint: string
  readonly region: string
  readonly reqKey: string
  readonly promptExpansion: boolean
}

/** Every implemented provider's config block. */
export interface ProviderConfigMap {
  readonly 'openai-images': OpenAiImagesConfig
  readonly jimeng: JimengConfig
}

/** A config block selected by the provider id. */
export type ProviderConfig = ProviderConfigMap[keyof ProviderConfigMap]

/** Secrets resolved for one provider; never persisted or returned to the browser. */
export interface ProviderCredentials {
  readonly apiKey?: string
  readonly accessKey?: string
  readonly secretKey?: string
}

/** Inputs every adapter's `generate` receives. */
export interface ProviderGenerateInput<C extends ProviderConfig = ProviderConfig> {
  readonly config: C
  readonly credentials: ProviderCredentials
  readonly request: ImageRequest
  readonly signal: AbortSignal
  /** Wall-clock ceiling for the whole provider call, including polling. */
  readonly timeoutMs: number
  /** Largest accepted image, in bytes. */
  readonly maxImageBytes: number
}

/** One provider adapter. */
export interface ImageProvider<C extends ProviderConfig = ProviderConfig> {
  readonly id: ProviderId
  readonly label: string
  readonly capabilities: ProviderCapabilities
  generate(input: ProviderGenerateInput<C>): Promise<ImageResult>
}

/** A provider registry entry accepted without forcing one config type. */
export type AnyImageProvider = ImageProvider<never>

/** One adapter after registry erasure; the selected config matches its id. */
export interface RuntimeImageProvider {
  readonly id: ProviderId
  readonly label: string
  readonly capabilities: ProviderCapabilities
  generate(input: ProviderGenerateInput<ProviderConfig>): Promise<ImageResult>
}

/** A provider call failed; the message is safe to show the user. */
export class ImageProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ImageProviderError'
  }
}

/** Trim a prompt's negative clause into the prompt when no field exists. */
export function mergeNegative(prompt: string, negative: string | undefined): string {
  const base = prompt.trim()
  const avoid = negative?.trim() ?? ''
  if (avoid.length === 0) return base
  return `${base}\n\n避免：${avoid}`
}

/** Clamp a prompt to a provider's published ceiling. */
export function clampPrompt(prompt: string, max: number | undefined): string {
  if (max === undefined || prompt.length <= max) return prompt
  return prompt.slice(0, max)
}
