/**
 * OpenAI Images adapter (also used by OpenAI-compatible relays).
 *
 * The request is synchronous: one POST returns base64 bytes, or a URL this
 * adapter downloads without forwarding the API key. The provider has no
 * separate negative-prompt field, so a negative clause is merged into the
 * prompt as a best-effort instruction.
 */
import { inspectImage } from '../store.js';
import { ImageProviderError, mergeNegative } from './types.js';
import { deadlineSignal, downloadImage, providerFailure, readBoundedJson } from './http.js';
/** Aspect ratios GPT Image accepts. */
export const OPENAI_ASPECTS = ['1:1', '3:2', '2:3'];
/** Capability table shown by the client. */
export const OPENAI_CAPABILITIES = {
    negative: false,
    seed: false,
    aspects: [...OPENAI_ASPECTS],
    referenceImages: false,
    async: false,
    maxCount: 1,
};
/** Map a neutral aspect to a GPT Image size. */
export function openAiSize(aspect) {
    if (aspect === '1:1')
        return '1024x1024';
    if (aspect === '3:2')
        return '1536x1024';
    if (aspect === '2:3')
        return '1024x1536';
    throw new ImageProviderError(`GPT Image 不支持 ${aspect}`, 'openai-images', 400);
}
/**
 * Resolve the generations endpoint from a base URL.
 *
 * Accepts a bare host, a `/v1` root, or the full `${...}/images/generations`
 * path so a relay configured either way works without a second setting.
 */
export function openAiImagesEndpoint(baseUrl) {
    const trimmed = baseUrl.trim().replace(/\/+$/, '');
    if (trimmed.length === 0)
        throw new ImageProviderError('请先填写 GPT Image base URL', 'openai-images', 400);
    if (/\/images\/generations$/i.test(trimmed))
        return trimmed;
    if (/\/v1$/i.test(trimmed))
        return `${trimmed}/images/generations`;
    return `${trimmed}/v1/images/generations`;
}
/** Read a string field from a JSON object. */
function stringAt(value) {
    return typeof value === 'string' ? value : undefined;
}
/** Extract the first result object from an OpenAI Images response. */
function firstImage(json) {
    if (typeof json !== 'object' || json === null)
        return undefined;
    const data = json.data;
    if (!Array.isArray(data) || data.length === 0)
        return undefined;
    const first = data[0];
    return typeof first === 'object' && first !== null ? first : undefined;
}
/** GPT Image adapter. */
export const openAiImagesProvider = {
    id: 'openai-images',
    label: 'GPT Image',
    capabilities: OPENAI_CAPABILITIES,
    async generate(input) {
        const { config, credentials, request } = input;
        const apiKey = credentials.apiKey;
        if (apiKey === undefined || apiKey.length === 0) {
            throw new ImageProviderError('缺少 GPT Image API Key', 'openai-images', 400);
        }
        if (config.model.trim().length === 0) {
            throw new ImageProviderError('请先填写 GPT Image 模型', 'openai-images', 400);
        }
        const signal = deadlineSignal(input.signal, input.timeoutMs);
        const baseBody = {
            model: config.model,
            prompt: mergeNegative(request.prompt, request.negative),
            n: 1,
            size: openAiSize(request.aspect),
            ...(config.quality.length === 0 ? {} : { quality: config.quality }),
        };
        const post = (body) => fetch(openAiImagesEndpoint(config.baseUrl), {
            method: 'POST',
            redirect: 'error',
            signal,
            headers: {
                authorization: `Bearer ${apiKey}`,
                'content-type': 'application/json',
                accept: 'application/json',
            },
            body: JSON.stringify(body),
        });
        // gpt-image-1 always answers with base64, while some relays reject the
        // response_format field outright. Ask for b64 first and retry once without
        // it on a 400; a provider that only returns URLs still works through the
        // constrained download path below.
        let response = await post({ ...baseBody, response_format: 'b64_json' });
        if (!response.ok && response.status === 400)
            response = await post(baseBody);
        if (!response.ok)
            await providerFailure(response, 'openai-images');
        const json = await readBoundedJson(response);
        const first = firstImage(json);
        if (first === undefined)
            throw new ImageProviderError('GPT Image 没有返回图片', 'openai-images', 502);
        const revisedPrompt = stringAt(first.revised_prompt);
        const b64 = stringAt(first.b64_json);
        if (b64 !== undefined && b64.length > 0) {
            const payload = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
            const bytes = Buffer.from(payload, 'base64');
            const inspected = inspectImage(bytes, input.maxImageBytes);
            return {
                images: [{ bytes: new Uint8Array(bytes), mime: inspected.mime }],
                provider: 'openai-images',
                model: config.model,
                ...(revisedPrompt === undefined ? {} : { revisedPrompt }),
            };
        }
        const url = stringAt(first.url);
        if (url !== undefined && url.length > 0) {
            const image = await downloadImage(url, input.maxImageBytes, signal, 'openai-images');
            return {
                images: [image],
                provider: 'openai-images',
                model: config.model,
                ...(revisedPrompt === undefined ? {} : { revisedPrompt }),
            };
        }
        throw new ImageProviderError('GPT Image 响应里既没有 b64_json 也没有 url', 'openai-images', 502);
    },
};
