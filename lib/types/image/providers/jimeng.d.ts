import type { ImageProvider, ImageRequest, JimengConfig, ProviderCapabilities } from './types.js';
/** Aspect ratios Jimeng accepts. */
export declare const JIMENG_ASPECTS: readonly ["1:1", "3:2", "2:3", "16:9"];
/** Capability table shown by the client. */
export declare const JIMENG_CAPABILITIES: ProviderCapabilities;
/** API version the two task actions use. */
export declare const JIMENG_API_VERSION = "2022-08-31";
/** How often the adapter polls a submitted task. */
export declare const JIMENG_POLL_MS = 2000;
/** Map a neutral aspect to Jimeng width/height. */
export declare function jimengSize(aspect: ImageRequest['aspect']): {
    width: number;
    height: number;
};
/** Build one action URL from the configured endpoint. */
export declare function jimengActionUrl(endpoint: string, action: string): URL;
/** Jimeng adapter. */
export declare const jimengProvider: ImageProvider<JimengConfig>;
