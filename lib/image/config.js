/**
 * Per-workspace image generation settings.
 *
 * One document holds the selected provider, that provider's non-secret knobs,
 * the two prompt presets, and the optional refinement model. Secrets live in
 * the DSH credential store, never here: a tavern directory is user-visible and
 * may be copied or committed.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATE_DIRECTORY } from '../stage.js';
/** File name inside the tavern state directory. */
export const IMAGE_CONFIG_FILE = 'image.json';
/** Schema version this build reads and writes. */
export const IMAGE_CONFIG_SCHEMA = 1;
/** Providers this build can actually call. */
export const IMAGE_PROVIDERS = ['openai-images', 'jimeng'];
/** Every aspect the neutral layer knows. */
export const IMAGE_ASPECTS = ['1:1', '3:2', '2:3', '16:9'];
/** Built-in style presets. */
export const IMAGE_STYLES = ['anime', 'cinematic', 'painterly', 'dark-fantasy', 'custom'];
/** Style suffixes appended to a neutral prompt. */
export const STYLE_TEXT = {
    anime: '日系动画风格，干净的线条，柔和的光影',
    cinematic: '电影感构图，写实光影，广角镜头',
    painterly: '厚涂绘画质感，柔和笔触，层次丰富',
    'dark-fantasy': '黑暗奇幻风格，低饱和，戏剧性光影',
};
/** Bounds every numeric field is validated against. */
export const IMAGE_CONFIG_LIMITS = {
    timeoutMs: { min: 10_000, max: 300_000 },
    maxImageBytes: { min: 1_048_576, max: 52_428_800 },
    templateChars: { min: 0, max: 8_000 },
    negativeChars: { min: 0, max: 2_000 },
    customStyleChars: { min: 0, max: 2_000 },
    promptChars: { min: 1, max: 8_000 },
};
/** Smallest accepted image. */
export const IMAGE_MIN_BYTES = 1024;
/** A stored image config is structurally invalid. */
export class ImageConfigInvalidError extends Error {
    path;
    constructor(message, path) {
        super(message);
        this.path = path;
        this.name = 'ImageConfigInvalidError';
    }
}
/** Default OpenAI Images block. */
export function defaultOpenAiConfig() {
    return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', quality: '' };
}
/** Default Jimeng block. */
export function defaultJimengConfig() {
    return {
        endpoint: 'https://visual.volcengineapi.com',
        region: 'cn-north-1',
        reqKey: 'jimeng_t2i_v40',
        promptExpansion: false,
    };
}
/** Default scene preset. */
export function defaultScenePreset() {
    return {
        aspect: '3:2',
        style: 'anime',
        customStyle: '',
        template: '{{style}}插画。场景：{{scene}}。出场角色：{{characters}}。不要出现：{{negative}}。',
        negative: '文字、水印、签名、多余肢体、畸形手指',
    };
}
/** Default portrait preset. */
export function defaultPortraitPreset() {
    return {
        aspect: '2:3',
        style: 'anime',
        customStyle: '',
        template: '{{style}}角色立绘。角色：{{name}}。外观：{{appearance}}。气质：{{personality}}。背景：{{scenario}}。不要出现：{{negative}}。',
        negative: '文字、水印、签名、多余肢体、畸形手指',
    };
}
/** @returns a fresh copy of the shipped defaults. */
export function defaultImageConfig() {
    return {
        schema: IMAGE_CONFIG_SCHEMA,
        enabled: false,
        provider: 'openai-images',
        providers: {
            'openai-images': defaultOpenAiConfig(),
            jimeng: defaultJimengConfig(),
        },
        scene: defaultScenePreset(),
        portrait: defaultPortraitPreset(),
        timeoutMs: 180_000,
        maxImageBytes: 26_214_400,
    };
}
/** @param workspaceDir - tavern workspace root. @returns the config path. */
export function imageConfigPath(workspaceDir) {
    return join(workspaceDir, STATE_DIRECTORY, IMAGE_CONFIG_FILE);
}
/** Read a string field with a default and a ceiling. */
function textField(value, field, fallback, max) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'string')
        throw new ImageConfigInvalidError(`${field} 必须是字符串`);
    if (value.length > max)
        throw new ImageConfigInvalidError(`${field} 超过 ${max} 字`);
    return value;
}
/** Read a boolean field with a default. */
function booleanField(value, field, fallback) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'boolean')
        throw new ImageConfigInvalidError(`${field} 必须是布尔值`);
    return value;
}
/** Read an integer inside inclusive bounds. */
function integerField(value, field, fallback, min, max) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new ImageConfigInvalidError(`${field} 必须是 ${min}–${max} 之间的整数`);
    }
    return value;
}
/** Whether a URL's host is loopback, private, or a local name. */
export function isLocalHost(hostname) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
        return true;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd'))
        return true;
    if (/^127\./.test(host) || host === '0.0.0.0')
        return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host))
        return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host))
        return true;
    return false;
}
/**
 * Validate an HTTP(S) endpoint.
 *
 * Plain HTTP is accepted only for loopback/private hosts (local ComfyUI or a
 * LAN relay); a public endpoint must use TLS, so a misconfigured base URL can
 * never send a key over cleartext.
 */
export function httpUrl(value, field, fallback, allowEmpty) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'string')
        throw new ImageConfigInvalidError(`${field} 必须是字符串`);
    const text = value.trim();
    if (text.length === 0) {
        if (allowEmpty)
            return '';
        throw new ImageConfigInvalidError(`${field} 不能为空`);
    }
    if (text.length > 2048)
        throw new ImageConfigInvalidError(`${field} 过长`);
    let url;
    try {
        url = new URL(text);
    }
    catch {
        throw new ImageConfigInvalidError(`${field} 不是合法 URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ImageConfigInvalidError(`${field} 只能是 http 或 https`);
    }
    if (url.username.length > 0 || url.password.length > 0) {
        throw new ImageConfigInvalidError(`${field} 不能包含用户名或密码`);
    }
    if (url.protocol === 'http:' && !isLocalHost(url.hostname)) {
        throw new ImageConfigInvalidError(`${field} 使用 http 时必须是本机或内网地址`);
    }
    return text.replace(/\/+$/, '');
}
/** Read a model choice or `undefined`. */
function modelChoice(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ImageConfigInvalidError('细化模型必须是对象');
    }
    const record = value;
    const provider = textField(record.provider, '细化模型的 provider', '', 200).trim();
    const model = textField(record.model, '细化模型的 model', '', 200).trim();
    if (provider.length === 0 || model.length === 0) {
        throw new ImageConfigInvalidError('细化模型需要同时填写 provider 与 model');
    }
    const effort = textField(record.reasoningEffort, '细化模型的推理等级', '', 80).trim();
    return { provider, model, ...(effort.length === 0 ? {} : { reasoningEffort: effort }) };
}
/** Read one provider block. */
function providerConfigs(value) {
    const fallback = defaultImageConfig().providers;
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ImageConfigInvalidError('providers 必须是对象');
    }
    const record = value;
    const openai = record['openai-images'];
    const jimeng = record.jimeng;
    const openaiRecord = typeof openai === 'object' && openai !== null && !Array.isArray(openai)
        ? openai
        : {};
    const jimengRecord = typeof jimeng === 'object' && jimeng !== null && !Array.isArray(jimeng)
        ? jimeng
        : {};
    return {
        'openai-images': {
            baseUrl: httpUrl(openaiRecord.baseUrl, 'GPT Image base URL', fallback['openai-images'].baseUrl, true),
            model: textField(openaiRecord.model, 'GPT Image 模型', fallback['openai-images'].model, 200).trim(),
            quality: textField(openaiRecord.quality, 'GPT Image quality', fallback['openai-images'].quality, 32).trim(),
        },
        jimeng: {
            endpoint: httpUrl(jimengRecord.endpoint, '即梦 endpoint', fallback.jimeng.endpoint, false),
            region: textField(jimengRecord.region, '即梦 region', fallback.jimeng.region, 40).trim() || fallback.jimeng.region,
            reqKey: textField(jimengRecord.reqKey, '即梦 req_key', fallback.jimeng.reqKey, 64).trim() || fallback.jimeng.reqKey,
            promptExpansion: booleanField(jimengRecord.promptExpansion, '即梦提示词扩写', fallback.jimeng.promptExpansion),
        },
    };
}
/** Read one prompt preset. */
function preset(value, fallback) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ImageConfigInvalidError('提示词预设必须是对象');
    }
    const record = value;
    const aspect = record.aspect;
    if (aspect !== undefined && !IMAGE_ASPECTS.includes(aspect)) {
        throw new ImageConfigInvalidError(`未知比例：${String(aspect)}`);
    }
    const style = record.style;
    if (style !== undefined && !IMAGE_STYLES.includes(style)) {
        throw new ImageConfigInvalidError(`未知风格：${String(style)}`);
    }
    return {
        aspect: aspect ?? fallback.aspect,
        style: style ?? fallback.style,
        customStyle: textField(record.customStyle, '自定义风格', fallback.customStyle, IMAGE_CONFIG_LIMITS.customStyleChars.max),
        template: textField(record.template, '提示词模板', fallback.template, IMAGE_CONFIG_LIMITS.templateChars.max),
        negative: textField(record.negative, '负向词', fallback.negative, IMAGE_CONFIG_LIMITS.negativeChars.max),
    };
}
/**
 * Validate a stored config, filling absent fields from the defaults.
 * @param value - candidate document.
 * @returns a complete config.
 * @throws ImageConfigInvalidError when a present field is invalid.
 */
export function normalizeImageConfig(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ImageConfigInvalidError('生图设置必须是对象');
    }
    const record = value;
    if (typeof record.schema === 'number' && record.schema > IMAGE_CONFIG_SCHEMA) {
        throw new ImageConfigInvalidError(`生图设置 schema ${String(record.schema)} 高于支持版本`);
    }
    const defaults = defaultImageConfig();
    const provider = record.provider;
    if (provider !== undefined && !IMAGE_PROVIDERS.includes(provider)) {
        throw new ImageConfigInvalidError(`未知 provider：${String(provider)}`);
    }
    const timeoutMs = integerField(record.timeoutMs, '超时', defaults.timeoutMs, IMAGE_CONFIG_LIMITS.timeoutMs.min, IMAGE_CONFIG_LIMITS.timeoutMs.max);
    const maxImageBytes = integerField(record.maxImageBytes, '图片上限', defaults.maxImageBytes, IMAGE_CONFIG_LIMITS.maxImageBytes.min, IMAGE_CONFIG_LIMITS.maxImageBytes.max);
    return {
        schema: IMAGE_CONFIG_SCHEMA,
        enabled: booleanField(record.enabled, 'enabled', false),
        provider: provider ?? defaults.provider,
        providers: providerConfigs(record.providers),
        ...(modelChoice(record.refineModel) === undefined ? {} : { refineModel: modelChoice(record.refineModel) }),
        scene: preset(record.scene, defaults.scene),
        portrait: preset(record.portrait, defaults.portrait),
        timeoutMs,
        maxImageBytes,
    };
}
/**
 * Read one workspace's image settings.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored config, or the defaults when absent.
 * @throws ImageConfigInvalidError when the file is unusable.
 */
export async function readImageConfig(workspaceDir) {
    let text;
    try {
        text = await readFile(imageConfigPath(workspaceDir), 'utf8');
    }
    catch (error) {
        if (isMissing(error))
            return defaultImageConfig();
        throw error;
    }
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new ImageConfigInvalidError('生图设置不是合法 JSON', imageConfigPath(workspaceDir));
    }
    try {
        return normalizeImageConfig(value);
    }
    catch (error) {
        if (error instanceof ImageConfigInvalidError && error.path === undefined) {
            throw new ImageConfigInvalidError(error.message, imageConfigPath(workspaceDir));
        }
        throw error;
    }
}
/**
 * Persist one workspace's image settings atomically.
 * @param workspaceDir - tavern workspace root.
 * @param value - full config payload, validated before writing.
 * @returns the stored config.
 */
export async function writeImageConfig(workspaceDir, value) {
    const config = normalizeImageConfig(value);
    const target = imageConfigPath(workspaceDir);
    await mkdir(join(workspaceDir, STATE_DIRECTORY), { recursive: true });
    const temporary = `${target}.tmp-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    try {
        await rename(temporary, target);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
    return config;
}
/** @param preset - scene or portrait prompt preset. @returns its style suffix. */
export function styleText(preset) {
    if (preset.style === 'custom')
        return preset.customStyle.trim();
    return STYLE_TEXT[preset.style];
}
/** @param mode - which preset to use. @param config - workspace config. @returns the preset. */
export function presetFor(mode, config) {
    return mode === 'portrait' ? config.portrait : config.scene;
}
/** @param error - filesystem error. @returns whether it means "not found". */
export function isMissing(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return false;
    const code = error.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}
