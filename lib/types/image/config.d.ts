import type { Aspect, ImageMode, OpenAiImagesConfig, ProviderConfigMap, ProviderId, JimengConfig } from './providers/types.js';
/** File name inside the tavern state directory. */
export declare const IMAGE_CONFIG_FILE = "image.json";
/** Schema version this build reads and writes. */
export declare const IMAGE_CONFIG_SCHEMA = 1;
/** Providers this build can actually call. */
export declare const IMAGE_PROVIDERS: readonly ProviderId[];
/** Every aspect the neutral layer knows. */
export declare const IMAGE_ASPECTS: readonly Aspect[];
/** Built-in style presets. */
export declare const IMAGE_STYLES: readonly ["anime", "cinematic", "painterly", "dark-fantasy", "custom"];
/** One style preset id. */
export type ImageStyle = (typeof IMAGE_STYLES)[number];
/** Providers this build can select. */
export type ImageProviderId = 'openai-images' | 'jimeng';
/** Style suffixes appended to a neutral prompt. */
export declare const STYLE_TEXT: Readonly<Record<Exclude<ImageStyle, 'custom'>, string>>;
/** A refinement model choice; absent follows the current session. */
export interface ImageModelChoice {
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
}
/** One prompt preset (scene or portrait). */
export interface ImagePreset {
    readonly aspect: Aspect;
    readonly style: ImageStyle;
    readonly customStyle: string;
    readonly template: string;
    readonly negative: string;
}
/** One workspace's image settings. */
export interface ImageConfig {
    readonly schema: number;
    /** Whether this tavern exposes the image tools; never an auto-generation switch. */
    readonly enabled: boolean;
    readonly provider: ImageProviderId;
    readonly providers: ProviderConfigMap;
    /** Explicit refinement model; absent follows the current session. */
    readonly refineModel?: ImageModelChoice;
    readonly scene: ImagePreset;
    readonly portrait: ImagePreset;
    readonly timeoutMs: number;
    readonly maxImageBytes: number;
}
/** Bounds every numeric field is validated against. */
export declare const IMAGE_CONFIG_LIMITS: {
    readonly timeoutMs: {
        readonly min: 10000;
        readonly max: 300000;
    };
    readonly maxImageBytes: {
        readonly min: 1048576;
        readonly max: 52428800;
    };
    readonly templateChars: {
        readonly min: 0;
        readonly max: 8000;
    };
    readonly negativeChars: {
        readonly min: 0;
        readonly max: 2000;
    };
    readonly customStyleChars: {
        readonly min: 0;
        readonly max: 2000;
    };
    readonly promptChars: {
        readonly min: 1;
        readonly max: 8000;
    };
};
/** Smallest accepted image. */
export declare const IMAGE_MIN_BYTES = 1024;
/** A stored image config is structurally invalid. */
export declare class ImageConfigInvalidError extends Error {
    readonly path?: string | undefined;
    constructor(message: string, path?: string | undefined);
}
/** Default OpenAI Images block. */
export declare function defaultOpenAiConfig(): OpenAiImagesConfig;
/** Default Jimeng block. */
export declare function defaultJimengConfig(): JimengConfig;
/** Default scene preset. */
export declare function defaultScenePreset(): ImagePreset;
/** Default portrait preset. */
export declare function defaultPortraitPreset(): ImagePreset;
/** @returns a fresh copy of the shipped defaults. */
export declare function defaultImageConfig(): ImageConfig;
/** @param workspaceDir - tavern workspace root. @returns the config path. */
export declare function imageConfigPath(workspaceDir: string): string;
/** Whether a URL's host is loopback, private, or a local name. */
export declare function isLocalHost(hostname: string): boolean;
/**
 * Validate an HTTP(S) endpoint.
 *
 * Plain HTTP is accepted only for loopback/private hosts (local ComfyUI or a
 * LAN relay); a public endpoint must use TLS, so a misconfigured base URL can
 * never send a key over cleartext.
 */
export declare function httpUrl(value: unknown, field: string, fallback: string, allowEmpty: boolean): string;
/**
 * Validate a stored config, filling absent fields from the defaults.
 * @param value - candidate document.
 * @returns a complete config.
 * @throws ImageConfigInvalidError when a present field is invalid.
 */
export declare function normalizeImageConfig(value: unknown): ImageConfig;
/**
 * Read one workspace's image settings.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored config, or the defaults when absent.
 * @throws ImageConfigInvalidError when the file is unusable.
 */
export declare function readImageConfig(workspaceDir: string): Promise<ImageConfig>;
/**
 * Persist one workspace's image settings atomically.
 * @param workspaceDir - tavern workspace root.
 * @param value - full config payload, validated before writing.
 * @returns the stored config.
 */
export declare function writeImageConfig(workspaceDir: string, value: unknown): Promise<ImageConfig>;
/** @param preset - scene or portrait prompt preset. @returns its style suffix. */
export declare function styleText(preset: ImagePreset): string;
/** @param mode - which preset to use. @param config - workspace config. @returns the preset. */
export declare function presetFor(mode: ImageMode, config: ImageConfig): ImagePreset;
/** @param error - filesystem error. @returns whether it means "not found". */
export declare function isMissing(error: unknown): boolean;
