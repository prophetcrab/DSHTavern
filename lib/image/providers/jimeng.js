/**
 * Volcengine Jimeng 4.0 adapter.
 *
 * Jimeng is a two-step task API: submit returns a task id, then a polling call
 * reports a status and finally image URLs. URLs expire quickly, so this adapter
 * downloads them before returning; the rest of the plugin only ever sees bytes.
 */
import { inspectImage } from '../store.js';
import { ImageProviderError, clampPrompt, mergeNegative } from './types.js';
import { deadlineSignal, downloadImage, providerFailure, readBoundedJson, sleep } from './http.js';
import { signVolcRequest } from './volc-signer.js';
/** Aspect ratios Jimeng accepts. */
export const JIMENG_ASPECTS = ['1:1', '3:2', '2:3', '16:9'];
/** Capability table shown by the client. */
export const JIMENG_CAPABILITIES = {
    negative: false,
    seed: true,
    aspects: [...JIMENG_ASPECTS],
    referenceImages: false,
    async: true,
    maxCount: 1,
    promptMaxChars: 800,
};
/** API version the two task actions use. */
export const JIMENG_API_VERSION = '2022-08-31';
/** How often the adapter polls a submitted task. */
export const JIMENG_POLL_MS = 2_000;
/** Map a neutral aspect to Jimeng width/height. */
export function jimengSize(aspect) {
    if (aspect === '1:1')
        return { width: 1024, height: 1024 };
    if (aspect === '3:2')
        return { width: 1536, height: 1024 };
    if (aspect === '2:3')
        return { width: 1024, height: 1536 };
    if (aspect === '16:9')
        return { width: 1792, height: 1008 };
    throw new ImageProviderError(`即梦不支持 ${aspect}`, 'jimeng', 400);
}
/** Build one action URL from the configured endpoint. */
export function jimengActionUrl(endpoint, action) {
    const url = new URL(endpoint);
    url.searchParams.set('Action', action);
    url.searchParams.set('Version', JIMENG_API_VERSION);
    return url;
}
/** Treat a value as a record when possible. */
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
/** Find the task payload in the possible response envelopes. */
function payloadOf(json) {
    const root = asRecord(json);
    if (root === undefined)
        return undefined;
    return asRecord(root.data) ?? asRecord(root.result) ?? root;
}
/** Throw a provider error when a 200 response still carries Volcengine's error envelope. */
function throwResponseError(json) {
    const root = asRecord(json);
    const metadata = asRecord(root?.ResponseMetadata);
    const error = asRecord(metadata?.Error);
    if (error !== undefined) {
        const message = typeof error.Message === 'string' ? error.Message : '即梦返回错误';
        const code = typeof error.Code === 'string' ? `（${error.Code}）` : '';
        throw new ImageProviderError(`${message}${code}`, 'jimeng', 502);
    }
}
/** Send one signed POST and parse its JSON body. */
async function signedPost(config, credentials, action, body, signal) {
    const url = jimengActionUrl(config.endpoint, action);
    const text = JSON.stringify(body);
    const headers = signVolcRequest({
        method: 'POST',
        url,
        body: text,
        accessKey: credentials.accessKey,
        secretKey: credentials.secretKey,
        region: config.region,
        service: 'cv',
    });
    const response = await fetch(url.toString(), {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { ...headers, accept: 'application/json' },
        body: text,
    });
    if (!response.ok)
        await providerFailure(response, 'jimeng');
    const json = await readBoundedJson(response, 'jimeng');
    throwResponseError(json);
    return json;
}
/** Find the task id in a submit response. */
function taskIdOf(json) {
    const payload = payloadOf(json);
    const value = payload?.task_id ?? payload?.taskId ?? asRecord(payload?.result)?.task_id;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
/** Find the status in a poll response. */
function statusOf(json) {
    const payload = payloadOf(json);
    const value = payload?.status ?? payload?.task_status ?? payload?.state ?? asRecord(payload?.result)?.status;
    return typeof value === 'string' ? value.toLowerCase() : '';
}
/** Collect image URLs from the possible result fields. */
function imageUrlsOf(json) {
    const payload = payloadOf(json);
    if (payload === undefined)
        return [];
    const nested = asRecord(payload.result);
    const candidates = [payload.image_urls, payload.image_url, nested?.image_urls, nested?.image_url];
    const urls = [];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0)
            urls.push(candidate);
        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                if (typeof item === 'string' && item.length > 0)
                    urls.push(item);
            }
        }
    }
    return urls;
}
/** Collect inline base64 images from the possible result fields. */
function base64Of(json) {
    const payload = payloadOf(json);
    if (payload === undefined)
        return [];
    const nested = asRecord(payload.result);
    const candidates = [payload.binary_data_base64, payload.image_base64, nested?.binary_data_base64, nested?.image_base64];
    const values = [];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0)
            values.push(candidate);
        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                if (typeof item === 'string' && item.length > 0)
                    values.push(item);
            }
        }
    }
    return values;
}
/** Find a provider error message in a task payload. */
function taskFailureMessage(json) {
    const payload = payloadOf(json);
    const message = payload?.message ?? payload?.error_message ?? asRecord(payload?.error)?.message;
    return typeof message === 'string' && message.length > 0 ? message : '即梦任务失败';
}
/** Jimeng adapter. */
export const jimengProvider = {
    id: 'jimeng',
    label: '即梦 4.0',
    capabilities: JIMENG_CAPABILITIES,
    async generate(input) {
        const { config, credentials, request } = input;
        const accessKey = credentials.accessKey;
        const secretKey = credentials.secretKey;
        if (accessKey === undefined || accessKey.length === 0 || secretKey === undefined || secretKey.length === 0) {
            throw new ImageProviderError('缺少即梦 Access Key / Secret Key', 'jimeng', 400);
        }
        const deadline = deadlineSignal(input.signal, input.timeoutMs);
        const prompt = clampPrompt(mergeNegative(request.prompt, request.negative), JIMENG_CAPABILITIES.promptMaxChars);
        const { width, height } = jimengSize(request.aspect);
        try {
            const submitted = await signedPost(config, { accessKey, secretKey }, 'CVSync2AsyncSubmitTask', {
                req_key: config.reqKey,
                prompt,
                seed: request.seed ?? -1,
                width,
                height,
                force_single: true,
                use_pre_llm: config.promptExpansion,
            }, deadline);
            const taskId = taskIdOf(submitted);
            if (taskId === undefined)
                throw new ImageProviderError('即梦没有返回 task_id', 'jimeng', 502);
            let final;
            while (true) {
                await sleep(JIMENG_POLL_MS, deadline, 'jimeng');
                const polled = await signedPost(config, { accessKey, secretKey }, 'CVSync2AsyncGetResult', {
                    req_key: config.reqKey,
                    task_id: taskId,
                }, deadline);
                const status = statusOf(polled);
                if (status === 'done' || status === 'success' || status === 'succeeded') {
                    final = polled;
                    break;
                }
                if (status === 'not_found' || status === 'expired') {
                    throw new ImageProviderError(`即梦任务 ${status}`, 'jimeng', status === 'expired' ? 504 : 404);
                }
                if (status === 'failed' || status === 'error') {
                    throw new ImageProviderError(taskFailureMessage(polled), 'jimeng', 502);
                }
                // `in_queue` / `generating` and unknown intermediate states keep polling
                // until the deadline; the provider owns the actual state vocabulary.
            }
            const urls = imageUrlsOf(final);
            if (urls.length > 0) {
                const image = await downloadImage(urls[0], input.maxImageBytes, deadline, 'jimeng');
                return {
                    images: [image],
                    provider: 'jimeng',
                    model: config.reqKey,
                    ...(request.seed === undefined ? {} : { seed: request.seed }),
                };
            }
            const inline = base64Of(final);
            if (inline.length > 0) {
                const bytes = Buffer.from(inline[0], 'base64');
                const inspected = inspectImage(bytes, input.maxImageBytes);
                return {
                    images: [{ bytes: new Uint8Array(bytes), mime: inspected.mime }],
                    provider: 'jimeng',
                    model: config.reqKey,
                    ...(request.seed === undefined ? {} : { seed: request.seed }),
                };
            }
            throw new ImageProviderError('即梦任务完成但没有返回图片', 'jimeng', 502);
        }
        catch (error) {
            if (error instanceof ImageProviderError)
                throw error;
            if (input.signal.aborted)
                throw new ImageProviderError('即梦调用已取消', 'jimeng', 499);
            if (deadline.aborted)
                throw new ImageProviderError('即梦生成超时', 'jimeng', 504);
            throw new ImageProviderError(`即梦调用失败：${error instanceof Error ? error.message : String(error)}`, 'jimeng', 502);
        }
    },
};
