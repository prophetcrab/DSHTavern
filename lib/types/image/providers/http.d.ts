import type { GeneratedImage, ProviderId } from './types.js';
/** Largest provider JSON response this build reads. */
export declare const MAX_PROVIDER_JSON_BYTES: number;
/**
 * Read a response body up to a byte ceiling.
 * @param response - fetch response.
 * @param maxBytes - largest accepted body.
 * @returns the body bytes.
 * @throws ImageProviderError when the body is larger.
 */
export declare function readBoundedBytes(response: Response, maxBytes: number, provider?: ProviderId): Promise<Uint8Array>;
/**
 * Read a response body as JSON without buffering without a limit.
 * @param response - fetch response.
 * @returns the parsed JSON value.
 */
export declare function readBoundedJson(response: Response, provider?: ProviderId): Promise<unknown>;
/**
 * Turn a non-OK provider response into a safe error.
 * @param response - fetch response.
 * @param provider - provider id for the error.
 * @returns never; throws.
 */
export declare function providerFailure(response: Response, provider: ProviderId): Promise<never>;
/** Whether a download URL is safe to fetch without credentials. */
export declare function isSafeDownloadUrl(value: string): boolean;
/**
 * Download one provider image without forwarding credentials.
 * @param url - provider-returned image URL.
 * @param maxBytes - image ceiling.
 * @param signal - cancellation signal.
 * @returns validated bytes and MIME.
 */
export declare function downloadImage(url: string, maxBytes: number, signal: AbortSignal, provider: ProviderId): Promise<GeneratedImage>;
/** Compose a deadline that cancels when either the caller or the timeout fires. */
export declare function deadlineSignal(signal: AbortSignal, timeoutMs: number): AbortSignal;
/** Sleep while honoring a deadline. */
export declare function sleep(ms: number, signal: AbortSignal, provider?: ProviderId): Promise<void>;
