/**
 * Per-workspace agent orchestration settings.
 *
 * Prompt orchestration decides what an agent reads; these settings decide how a
 * beat runs: how many characters may speak, how much history and lore each call
 * sees, whether speakers rotate, who answers when the director's pick cannot be
 * resolved, and which model each role uses.
 *
 * Defaults mirror the constants the orchestrator shipped with, so a workspace
 * without `agent.json` behaves exactly as it did before this panel existed.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_SPEECHES_PER_BEAT, PLAYER_INPUT_MAX, STAGE_WINDOW } from './orchestrator.js';
import { STATE_DIRECTORY } from './stage.js';
import { WORLDBOOK_ACTIVE_CHARS_MAX, WORLDBOOK_ACTIVE_MAX, WORLDBOOK_SCAN_LINES } from './worldbook.js';
/** File name inside the tavern state directory. */
export const AGENT_CONFIG_FILE = 'agent.json';
/** Schema version this build reads and writes. */
export const AGENT_CONFIG_SCHEMA = 1;
/**
 * Approximate tokens per Chinese character.
 *
 * DeepSeek's tokenizer spends about 0.6 token per Chinese character, so a
 * character budget is divided by this to get the enforced `maxTokens`. The
 * figure is an approximation on purpose: the panel speaks in characters because
 * that is what an author counts, and the provider's cap is in tokens.
 */
export const TOKENS_PER_CHAR = 0.6;
/**
 * Convert a character budget to the token cap handed to the provider.
 * @param chars - budget in characters.
 * @returns the token cap, at least 1.
 */
export function tokensForChars(chars) {
    return Math.max(1, Math.round(chars * TOKENS_PER_CHAR));
}
/** Inclusive bounds enforced on every field. */
export const AGENT_CONFIG_LIMITS = {
    maxSpeechesPerBeat: { min: 1, max: 6 },
    // Ceilings sized for a 1M-token context window (~1.67M Chinese characters):
    // the largest preset together spends well under half of it, leaving room for
    // the system prompt, the card, and the reply.
    stageWindow: { min: 4, max: 2000 },
    stageMaxChars: { min: 1000, max: 400_000 },
    loreScanLines: { min: 4, max: 2000 },
    loreMaxEntries: { min: 1, max: 200 },
    loreMaxChars: { min: 200, max: 400_000 },
    playerInputMax: { min: 200, max: 120_000 },
    maxReplyChars: { min: 20, max: 8000 },
    reasoningReserveTokens: { min: 0, max: 16_000 },
};
/**
 * Context budget presets, from the shipped defaults to a 1M-context setting.
 *
 * `extreme` sums to roughly 420k tokens of history and lore at typical line
 * lengths, so it stays inside a 1M window alongside the system prompt and the
 * reply while using far more of it than the old ceilings allowed.
 */
export const CONTEXT_PRESETS = {
    compact: {
        label: '精简',
        stageWindow: 40, loreScanLines: 20, loreMaxEntries: 8, loreMaxChars: 6000, playerInputMax: 8000,
    },
    standard: {
        label: '标准',
        stageWindow: 200, loreScanLines: 60, loreMaxEntries: 24, loreMaxChars: 40_000, playerInputMax: 20_000,
    },
    roomy: {
        label: '充裕',
        stageWindow: 800, loreScanLines: 200, loreMaxEntries: 80, loreMaxChars: 160_000, playerInputMax: 60_000,
    },
    extreme: {
        label: '极限',
        stageWindow: 2000, loreScanLines: 500, loreMaxEntries: 200, loreMaxChars: 400_000, playerInputMax: 120_000,
    },
};
/** Which preset, if any, matches a budget; `undefined` when it is a custom mix. */
export function contextPresetOf(config) {
    for (const [id, preset] of Object.entries(CONTEXT_PRESETS)) {
        const matches = preset.stageWindow === config.stageWindow
            && preset.loreScanLines === config.loreScanLines
            && preset.loreMaxEntries === config.loreMaxEntries
            && preset.loreMaxChars === config.loreMaxChars
            && preset.playerInputMax === config.playerInputMax;
        if (matches)
            return id;
    }
    return undefined;
}
/**
 * Default reasoning headroom added to a reply cap.
 *
 * Observed on a reasoning model at the highest effort: a 240-token cap came
 * back as 240 output tokens with zero visible text, because thinking consumed
 * the whole allowance. 512 leaves room for a typical reasoning pass and still
 * lets the character budget mean what it says.
 */
export const DEFAULT_REASONING_RESERVE = 512;
/** A stored config is structurally invalid. */
export class AgentConfigInvalidError extends Error {
    path;
    constructor(message, path) {
        super(message);
        this.path = path;
        this.name = 'AgentConfigInvalidError';
    }
}
/** @param workspaceDir - tavern workspace root. @returns the config file path. */
export function agentConfigPath(workspaceDir) {
    return join(workspaceDir, STATE_DIRECTORY, AGENT_CONFIG_FILE);
}
/** @returns the config every workspace starts from. */
export function defaultAgentConfig() {
    return {
        schema: AGENT_CONFIG_SCHEMA,
        maxSpeechesPerBeat: MAX_SPEECHES_PER_BEAT,
        stageWindow: STAGE_WINDOW,
        loreScanLines: WORLDBOOK_SCAN_LINES,
        loreMaxEntries: WORLDBOOK_ACTIVE_MAX,
        loreMaxChars: WORLDBOOK_ACTIVE_CHARS_MAX,
        playerInputMax: PLAYER_INPUT_MAX,
        rotateSpeakers: true,
        honorPlayerMention: true,
        unknownSpeaker: 'none',
    };
}
function integerIn(value, field, min, max, fallback) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new AgentConfigInvalidError(`${field} 必须是 ${min}–${max} 的整数`);
    }
    return value;
}
function booleanOr(value, field, fallback) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'boolean')
        throw new AgentConfigInvalidError(`${field} 必须是布尔值`);
    return value;
}
function modelChoice(value, field) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new AgentConfigInvalidError(`${field} 必须是对象`);
    }
    const record = value;
    const provider = typeof record.provider === 'string' ? record.provider.trim() : '';
    const model = typeof record.model === 'string' ? record.model.trim() : '';
    // A half-filled choice would silently fall back mid-beat; reject it instead.
    if (provider.length === 0 && model.length === 0)
        return undefined;
    if (provider.length === 0 || model.length === 0) {
        throw new AgentConfigInvalidError(`${field} 需要同时填写 provider 与 model`);
    }
    const effort = typeof record.reasoningEffort === 'string' ? record.reasoningEffort.trim() : '';
    return {
        provider,
        model,
        ...(effort.length === 0 ? {} : { reasoningEffort: effort }),
    };
}
function optionalIntegerIn(value, field, min, max) {
    if (value === undefined || value === null)
        return undefined;
    return integerIn(value, field, min, max, min);
}
/** Validate the per-character reply-budget map. */
function replyBudgetMap(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new AgentConfigInvalidError('角色回复长度必须是「角色卡 id → 字数」的对象');
    }
    const { min, max } = AGENT_CONFIG_LIMITS.maxReplyChars;
    const entries = [];
    for (const [id, raw] of Object.entries(value)) {
        if (id.trim().length === 0)
            continue;
        entries.push([id, integerIn(raw, `角色 ${id} 的回复长度`, min, max, min)]);
    }
    return entries.length === 0 ? undefined : Object.fromEntries(entries);
}
/**
 * Validate one config payload, filling absent fields from the defaults.
 * @param value - candidate config, however malformed.
 * @returns the normalised config.
 * @throws AgentConfigInvalidError when a present field is invalid.
 */
export function normalizeAgentConfig(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new AgentConfigInvalidError('Agent 编排配置必须是对象');
    }
    const record = value;
    if (typeof record.schema === 'number' && record.schema > AGENT_CONFIG_SCHEMA) {
        throw new AgentConfigInvalidError(`Agent 编排配置 schema ${String(record.schema)} 高于支持版本`);
    }
    const defaults = defaultAgentConfig();
    const unknownSpeaker = record.unknownSpeaker;
    if (unknownSpeaker !== undefined && unknownSpeaker !== 'none' && unknownSpeaker !== 'first') {
        throw new AgentConfigInvalidError('说话人无法解析时只能是 none 或 first');
    }
    const directorModel = modelChoice(record.directorModel, '导演模型');
    const characterModel = modelChoice(record.characterModel, '角色模型');
    const { min: replyMin, max: replyMax } = AGENT_CONFIG_LIMITS.maxReplyChars;
    const maxReplyChars = optionalIntegerIn(record.maxReplyChars, '统一回复长度', replyMin, replyMax);
    const directorMaxReplyChars = optionalIntegerIn(record.directorMaxReplyChars, '导演回复长度', replyMin, replyMax);
    const characterMaxReplyChars = replyBudgetMap(record.characterMaxReplyChars);
    const reasoningReserveTokens = optionalIntegerIn(record.reasoningReserveTokens, '推理预留 token', AGENT_CONFIG_LIMITS.reasoningReserveTokens.min, AGENT_CONFIG_LIMITS.reasoningReserveTokens.max);
    const stageMaxChars = optionalIntegerIn(record.stageMaxChars, '角色可见舞台字数上限', AGENT_CONFIG_LIMITS.stageMaxChars.min, AGENT_CONFIG_LIMITS.stageMaxChars.max);
    return {
        schema: AGENT_CONFIG_SCHEMA,
        maxSpeechesPerBeat: integerIn(record.maxSpeechesPerBeat, '每幕最多发言角色数', AGENT_CONFIG_LIMITS.maxSpeechesPerBeat.min, AGENT_CONFIG_LIMITS.maxSpeechesPerBeat.max, defaults.maxSpeechesPerBeat),
        stageWindow: integerIn(record.stageWindow, '角色可见舞台行数', AGENT_CONFIG_LIMITS.stageWindow.min, AGENT_CONFIG_LIMITS.stageWindow.max, defaults.stageWindow),
        loreScanLines: integerIn(record.loreScanLines, '世界书扫描行数', AGENT_CONFIG_LIMITS.loreScanLines.min, AGENT_CONFIG_LIMITS.loreScanLines.max, defaults.loreScanLines),
        loreMaxEntries: integerIn(record.loreMaxEntries, '世界书最多条数', AGENT_CONFIG_LIMITS.loreMaxEntries.min, AGENT_CONFIG_LIMITS.loreMaxEntries.max, defaults.loreMaxEntries),
        loreMaxChars: integerIn(record.loreMaxChars, '世界书最多字数', AGENT_CONFIG_LIMITS.loreMaxChars.min, AGENT_CONFIG_LIMITS.loreMaxChars.max, defaults.loreMaxChars),
        playerInputMax: integerIn(record.playerInputMax, '玩家输入上限', AGENT_CONFIG_LIMITS.playerInputMax.min, AGENT_CONFIG_LIMITS.playerInputMax.max, defaults.playerInputMax),
        rotateSpeakers: booleanOr(record.rotateSpeakers, '轮换发言', defaults.rotateSpeakers),
        honorPlayerMention: booleanOr(record.honorPlayerMention, '玩家点名优先', defaults.honorPlayerMention),
        unknownSpeaker: unknownSpeaker === 'first' ? 'first' : 'none',
        ...(maxReplyChars === undefined ? {} : { maxReplyChars }),
        ...(directorMaxReplyChars === undefined ? {} : { directorMaxReplyChars }),
        ...(characterMaxReplyChars === undefined ? {} : { characterMaxReplyChars }),
        ...(reasoningReserveTokens === undefined ? {} : { reasoningReserveTokens }),
        ...(stageMaxChars === undefined ? {} : { stageMaxChars }),
        ...(directorModel === undefined ? {} : { directorModel }),
        ...(characterModel === undefined ? {} : { characterModel }),
    };
}
/**
 * Reply budget one role actually gets.
 *
 * The per-role override wins, then the shared budget, and an absent result
 * means the adapter's own model limit applies.
 * @param config - workspace settings.
 * @param role - which call is being measured.
 * @param cardId - character card id, for a character call.
 * @returns the budget in characters, or `undefined` for no cap.
 */
export function replyBudgetChars(config, role, cardId) {
    if (role === 'director')
        return config.directorMaxReplyChars ?? config.maxReplyChars;
    return (cardId === undefined ? undefined : config.characterMaxReplyChars?.[cardId]) ?? config.maxReplyChars;
}
/**
 * Provider token cap for one reply budget, including reasoning headroom.
 *
 * `max_tokens` bounds thinking and answer together; without the reserve a
 * reasoning model spends the whole cap thinking and returns no text.
 * @param chars - reply budget in characters.
 * @param reserveTokens - reasoning headroom from the config.
 * @returns the cap to send as `maxTokens`.
 */
export function replyCapTokens(chars, reserveTokens) {
    return tokensForChars(chars) + (reserveTokens ?? DEFAULT_REASONING_RESERVE);
}
/**
 * Read one workspace's config.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored config, or the defaults when absent.
 * @throws AgentConfigInvalidError when the file is unusable.
 */
export async function readAgentConfig(workspaceDir) {
    let text;
    try {
        text = await readFile(agentConfigPath(workspaceDir), 'utf8');
    }
    catch (error) {
        if (isMissing(error))
            return defaultAgentConfig();
        throw error;
    }
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new AgentConfigInvalidError('Agent 编排配置不是合法 JSON', agentConfigPath(workspaceDir));
    }
    try {
        return normalizeAgentConfig(value);
    }
    catch (error) {
        if (error instanceof AgentConfigInvalidError && error.path === undefined) {
            throw new AgentConfigInvalidError(error.message, agentConfigPath(workspaceDir));
        }
        throw error;
    }
}
/**
 * Persist one workspace's config atomically (temporary file then rename).
 * @param workspaceDir - tavern workspace root.
 * @param value - full config payload, validated before writing.
 * @returns the stored config.
 */
export async function writeAgentConfig(workspaceDir, value) {
    const config = normalizeAgentConfig(value);
    const directory = join(workspaceDir, STATE_DIRECTORY);
    await mkdir(directory, { recursive: true });
    const target = agentConfigPath(workspaceDir);
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
function isMissing(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return false;
    const code = error.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}
