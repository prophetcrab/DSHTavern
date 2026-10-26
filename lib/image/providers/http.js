/**
 * Shared HTTP helpers for image provider adapters.
 *
 * Providers are the only code that talks to a third party. These helpers keep
 * the safety rules in one place: redirects are errors, response bodies are
 * bounded, a download carries no credentials, and returned bytes must really be
 * a PNG/JPEG/WebP before they are written to a tavern.
 */
import { isLocalHost } from '../config.js';
import { inspectImage } from '../store.js';
import { ImageProviderError } from './types.js';
/** Largest provider JSON response this build reads. */
export const MAX_PROVIDER_JSON_BYTES = 32 * 1024 * 1024;
/**
 * Read a response body up to a byte ceiling.
 * @param response - fetch response.
 * @param maxBytes - largest accepted body.
 * @returns the body bytes.
 * @throws ImageProviderError when the body is larger.
 */
export async function readBoundedBytes(response, maxBytes, provider = 'openai-images') {
    const declared = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > maxBytes) {
        throw new ImageProviderError('provider 响应超过大小上限', provider, 502);
    }
    const reader = response.body?.getReader();
    if (reader === undefined)
        return new Uint8Array(await response.arrayBuffer());
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        if (value === undefined)
            continue;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new ImageProviderError('provider 响应超过大小上限', provider, 502);
        }
        chunks.push(value);
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return output;
}
/**
 * Read a response body as JSON without buffering without a limit.
 * @param response - fetch response.
 * @returns the parsed JSON value.
 */
export async function readBoundedJson(response, provider = 'openai-images') {
    const bytes = await readBoundedBytes(response, MAX_PROVIDER_JSON_BYTES, provider);
    const text = new TextDecoder().decode(bytes);
    try {
        return JSON.parse(text);
    }
    catch {
        throw new ImageProviderError(`provider 返回了非 JSON 响应（HTTP ${response.status}）`, provider, response.status);
    }
}
/** Extract a provider error message without dumping the whole body. */
function messageOf(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const record = value;
    const error = record.error;
    if (typeof error === 'object' && error !== null) {
        const message = error.message;
        if (typeof message === 'string' && message.trim().length > 0)
            return message.trim();
    }
    if (typeof record.message === 'string' && record.message.trim().length > 0)
        return record.message.trim();
    const metadata = record.ResponseMetadata;
    if (typeof metadata === 'object' && metadata !== null) {
        const nested = metadata.Error;
        if (typeof nested === 'object' && nested !== null) {
            const message = nested.Message;
            if (typeof message === 'string' && message.trim().length > 0)
                return message.trim();
        }
    }
    return undefined;
}
/**
 * Turn a non-OK provider response into a safe error.
 * @param response - fetch response.
 * @param provider - provider id for the error.
 * @returns never; throws.
 */
export async function providerFailure(response, provider) {
    let detail = '';
    try {
        const bytes = await readBoundedBytes(response, 256 * 1024, provider);
        const text = new TextDecoder().decode(bytes);
        try {
            detail = messageOf(JSON.parse(text)) ?? '';
        }
        catch {
            detail = text.slice(0, 300).trim();
        }
    }
    catch {
        // The status alone is still useful when the error body is unreadable.
    }
    const suffix = detail.length === 0 ? '' : `：${detail.slice(0, 300)}`;
    throw new ImageProviderError(`provider 请求失败（HTTP ${response.status}）${suffix}`, provider, response.status);
}
/** Whether a download URL is safe to fetch without credentials. */
export function isSafeDownloadUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return false;
    }
    if (url.username.length > 0 || url.password.length > 0)
        return false;
    if (url.protocol === 'https:')
        return true;
    return url.protocol === 'http:' && isLocalHost(url.hostname);
}
/**
 * Download one provider image without forwarding credentials.
 * @param url - provider-returned image URL.
 * @param maxBytes - image ceiling.
 * @param signal - cancellation signal.
 * @returns validated bytes and MIME.
 */
export async function downloadImage(url, maxBytes, signal, provider) {
    if (!isSafeDownloadUrl(url)) {
        throw new ImageProviderError('provider 返回了不安全的图片地址', provider, 502);
    }
    const response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        signal,
        headers: { accept: 'image/*' },
    });
    if (!response.ok)
        await providerFailure(response, provider);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) {
        throw new ImageProviderError('provider 返回的不是图片', provider, 502);
    }
    const bytes = await readBoundedBytes(response, maxBytes, provider);
    const inspected = inspectImage(bytes, maxBytes);
    return { bytes: new Uint8Array(bytes), mime: inspected.mime };
}
/** Compose a deadline that cancels when either the caller or the timeout fires. */
export function deadlineSignal(signal, timeoutMs) {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
}
/** Sleep while honoring a deadline. */
export async function sleep(ms, signal, provider = 'jimeng') {
    if (signal.aborted)
        throw new ImageProviderError('provider 调用已取消', provider, 499);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new ImageProviderError('provider 调用已取消', provider, 499));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
