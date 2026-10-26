import { listBeats } from '../regenerate.js';
import { storyDirectory } from '../stage.js';
import { presetFor, styleText } from './config.js';
import { clampPrompt, mergeNegative } from './providers/types.js';
/** A prompt could not be built from the requested target. */
export class ImagePromptError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ImagePromptError';
    }
}
/** Most scene text one draft forwards. */
export const SCENE_CONTEXT_MAX = 4_000;
/** Most appearance text one character contributes. */
export const CHARACTER_APPEARANCE_MAX = 600;
/** @param text - free text. @returns its first non-empty paragraph, trimmed. */
export function firstParagraph(text) {
    for (const paragraph of text.split(/\n\s*\n/u)) {
        const trimmed = paragraph.trim();
        if (trimmed.length > 0)
            return trimmed;
    }
    return '';
}
/** @param card - character card. @returns the appearance used by image prompts. */
export function cardAppearance(card) {
    const explicit = card.appearance.trim();
    if (explicit.length > 0)
        return explicit.slice(0, CHARACTER_APPEARANCE_MAX);
    const fallback = firstParagraph(card.description) || firstParagraph(card.personality);
    return (fallback || '（无外观描述）').slice(0, CHARACTER_APPEARANCE_MAX);
}
/** Replace `{{name}}` placeholders, case-insensitively and tolerating spaces. */
export function renderImageTemplate(template, values) {
    return template.replace(/\{\{\s*([A-Za-z_-]+)\s*\}\}/g, (match, key) => {
        const value = values[key.toLowerCase()];
        return value === undefined ? match : value;
    }).trim();
}
/** Keep a context section bounded without cutting in the middle of a surrogate pair. */
function clampContext(text, max) {
    if (text.length <= max)
        return text;
    return text.slice(0, max);
}
/**
 * Find the beat one image targets.
 * @param workspaceDir - tavern workspace root.
 * @param sessionId - chat identity.
 * @param turn - 0/undefined for the newest beat, otherwise an exact turn.
 * @returns the stored beat, or `undefined`.
 */
export async function findBeat(workspaceDir, sessionId, turn) {
    const beats = await listBeats(storyDirectory(workspaceDir, sessionId));
    if (beats.length === 0)
        return undefined;
    if (turn === undefined || turn <= 0)
        return beats[0];
    return beats.find(beat => beat.record.turn === turn);
}
/**
 * Build the scene context and draft for one beat.
 * @param beat - stored beat.
 * @param cards - workspace cards.
 * @param config - image settings.
 * @returns the preview.
 * @throws ImagePromptError when the beat has no readable turn number.
 */
export function scenePreview(beat, cards, config) {
    const record = beat.record;
    if (record.turn === undefined) {
        throw new ImagePromptError('这一轮没有可用的回合记录');
    }
    const pieces = [];
    if (record.worldBefore?.scene !== undefined && record.worldBefore.scene.trim().length > 0) {
        pieces.push(`场景：${record.worldBefore.scene.trim()}`);
    }
    if (record.playerInput.trim().length > 0)
        pieces.push(`玩家：${record.playerInput.trim()}`);
    const turns = record.turns ?? [];
    if (turns.length > 0) {
        for (const turn of turns) {
            const narration = turn.decision.narration.trim();
            if (narration.length > 0)
                pieces.push(`旁白：${narration}`);
            const speech = turn.speech?.trim() ?? '';
            if (speech.length > 0) {
                const name = turn.effectiveSpeaker?.name ?? '角色';
                pieces.push(`${name}：${speech}`);
            }
        }
    }
    else {
        if (record.decision.narration.trim().length > 0)
            pieces.push(`旁白：${record.decision.narration.trim()}`);
        if (record.speech !== undefined && record.speech.trim().length > 0)
            pieces.push(`角色：${record.speech.trim()}`);
    }
    const scene = clampContext(pieces.join('\n'), SCENE_CONTEXT_MAX);
    const ids = new Set();
    for (const turn of turns) {
        if (turn.effectiveSpeaker !== undefined)
            ids.add(turn.effectiveSpeaker.id);
    }
    const characters = [...ids]
        .map(id => cards.find(card => card.id === id))
        .filter((card) => card !== undefined)
        .map(card => ({ id: card.id, name: card.name, appearance: cardAppearance(card) }));
    const preset = presetFor('scene', config);
    const draft = renderImageTemplate(preset.template, {
        scene,
        characters: characters.length === 0
            ? '（本回合没有角色开口）'
            : characters.map(character => `${character.name}：${character.appearance}`).join('；'),
        style: styleText(preset),
        negative: preset.negative,
        user: '玩家',
    });
    return {
        mode: 'scene',
        turn: record.turn,
        scene,
        characters,
        draft,
        negative: preset.negative,
        aspect: preset.aspect,
        style: preset.style,
        preset,
    };
}
/**
 * Build the portrait context and draft for one card.
 * @param card - character card.
 * @param config - image settings.
 * @returns the preview.
 */
export function portraitPreview(card, config) {
    const appearance = cardAppearance(card);
    const preset = presetFor('portrait', config);
    const personality = firstParagraph(card.personality);
    const scenario = firstParagraph(card.scenario);
    const draft = renderImageTemplate(preset.template, {
        name: card.name,
        appearance,
        personality: personality || '（未填写）',
        scenario: scenario || '（未填写）',
        style: styleText(preset),
        negative: preset.negative,
        user: '玩家',
    });
    return {
        mode: 'portrait',
        cardId: card.id,
        cardName: card.name,
        appearance,
        personality,
        scenario,
        draft,
        negative: preset.negative,
        aspect: preset.aspect,
        style: preset.style,
        preset,
    };
}
/** The system prompt one LLM refinement call receives. */
export function buildRefineSystem(input) {
    const mode = input.mode === 'portrait' ? '角色立绘' : '场景插画';
    const limits = [
        input.capabilities.promptMaxChars === undefined
            ? '没有明确的字数上限，但仍应简洁'
            : `提示词最多 ${input.capabilities.promptMaxChars} 字`,
        input.capabilities.negative
            ? 'provider 支持独立负向词，可把需要避免的内容放进 negative'
            : 'provider 没有独立负向词，需要避免的内容要自然并入 prompt',
        `比例：${input.preset.aspect}`,
    ];
    return [
        `你是酒馆的美术指导，负责把用户草稿细化为一条${mode}生图提示词。`,
        `目标 provider：${input.providerLabel}。`,
        ...limits.map(line => `- ${line}`),
        '规则：',
        '- 保留角色身份、外观、场景与风格，不要新增剧情、不要揭示观众尚未看到的信息。',
        '- 不要写文字、水印、签名；不要替角色安排新的动作或台词。',
        '- 只输出一个 JSON 对象，第一个字符是 {，最后一个字符是 }。',
        '- JSON 结构：{"prompt":"最终提示词","negative":"需要避免的内容，可为空字符串"}。',
        '- 不要在 JSON 外写解释、Markdown 代码块或前后缀。',
    ].join('\n');
}
/** The user message one refinement call receives. */
export function buildRefineMessage(input) {
    return [
        '# 当前场景/角色资料',
        input.context.trim(),
        '',
        '# 用户草稿',
        input.draft.trim(),
        '',
        '# 风格',
        styleText(input.preset) || '（未指定）',
        '',
        '# 需要避免',
        input.preset.negative.trim() || '（未指定）',
        '',
        '请只输出 JSON。',
    ].join('\n');
}
/**
 * Parse a refinement reply.
 *
 * A model that ignores the JSON contract still produced useful text, so the
 * raw answer becomes the prompt rather than failing the call. The result is
 * clamped to the provider's published limit; the user sees the final text and
 * can edit it before approval.
 * @param text - model output.
 * @param promptMaxChars - provider limit, when known.
 * @returns the refined prompt.
 * @throws ImagePromptError when the reply is empty.
 */
export function parseRefineReply(text, promptMaxChars) {
    const trimmed = text.trim();
    if (trimmed.length === 0)
        throw new ImagePromptError('细化模型没有返回内容');
    const json = extractJsonObject(trimmed);
    if (json !== undefined && typeof json.prompt === 'string' && json.prompt.trim().length > 0) {
        const negative = typeof json.negative === 'string' ? json.negative.trim() : '';
        return {
            prompt: clampPrompt(json.prompt.trim(), promptMaxChars),
            ...(negative.length === 0 ? {} : { negative }),
            parsed: true,
        };
    }
    return { prompt: clampPrompt(trimmed, promptMaxChars), parsed: false };
}
/** Extract the first balanced JSON object from a reply. */
function extractJsonObject(text) {
    const start = text.indexOf('{');
    if (start === -1)
        return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (char === '\\')
                escaped = true;
            else if (char === '"')
                inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{')
            depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                try {
                    const value = JSON.parse(text.slice(start, index + 1));
                    return typeof value === 'object' && value !== null && !Array.isArray(value)
                        ? value
                        : undefined;
                }
                catch {
                    return undefined;
                }
            }
        }
    }
    return undefined;
}
/** Merge a negative prompt for a provider without a separate field. */
export function promptWithNegative(prompt, negative) {
    return mergeNegative(prompt, negative);
}
