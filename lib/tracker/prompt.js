import { trackerSectionCeiling } from './summary.js';
/** Longest one ledger field may be, in characters. */
export const TRACKER_FIELD_MAX_CHARS = 4_000;
/** Most characters one ledger may carry entries for. */
export const TRACKER_CHARACTER_MAX = 40;
/**
 * Render the story so far as the transcript a run reads.
 *
 * Lines are emitted in story order with their speaker, which is what lets the
 * model attribute a change to the character it happened to. Only the newest
 * `maxChars` characters are kept: a long session must still fit one request,
 * and the recent scene is what the ledger's "current moment" describes.
 * @param stage - staged lines, oldest first.
 * @param maxChars - character budget; older lines are dropped first.
 * @returns the transcript and how many characters it carries.
 */
export function renderTranscript(stage, maxChars) {
    const lines = [];
    let total = 0;
    for (let index = stage.length - 1; index >= 0; index -= 1) {
        const entry = stage[index];
        if (entry === undefined || entry.scope !== 'observable')
            continue;
        const text = entry.kind === 'narration'
            ? `[旁白] ${entry.text}`
            : `[${entry.speakerName ?? entry.speaker ?? '角色'}] ${entry.text}`;
        // Always keep the newest line, even when it alone exceeds the budget: an
        // empty transcript would tell the model nothing about the current scene.
        if (lines.length > 0 && total + text.length > maxChars)
            break;
        total += text.length;
        lines.push(text);
    }
    lines.reverse();
    return { text: lines.join('\n'), chars: total };
}
/**
 * Build the system prompt one tracking run sends.
 *
 * Every run reads the whole story from the beginning, so the ledger always
 * describes the current story as a whole rather than a slice of it. The
 * instructions separate the four things a reader needs from a long story:
 * where the world stands, where the player stands, what each character has come
 * to know or want, and what is still unresolved. It explicitly forbids
 * inventing progress, because the ledger is read as fact.
 *
 * Length budgets are stated per section, and the same numbers are enforced by
 * the host after parsing: the prompt asks, the host guarantees.
 * @param input - cast, current world state, and the length budgets.
 * @returns the system prompt text.
 */
export function buildTrackerSystem(input) {
    const cast = input.cards.length === 0
        ? '（没有角色卡）'
        : input.cards.map(card => `- ${card.name}${card.description.trim().length === 0 ? '' : `：${firstLine(card.description)}`}`).join('\n');
    const hidden = input.world.hidden.length === 0
        ? '（无）'
        : input.world.hidden.map(item => `- ${item}`).join('\n');
    return [
        '你是这场角色扮演的剧情记录员。你不参与演出，只负责把已经发生的剧情整理成一份进展摘要，供之后回顾。',
        '',
        '# 在场角色',
        cast,
        '',
        '# 导演记录的隐藏剧情（玩家与角色都不知道）',
        hidden,
        '',
        '# 你要写什么',
        `1. world：这个世界现在处于什么状态。写地点、时间、当前正在发生的事、已经确立但还没解决的关键线索。**不超过 ${input.lengths.world.suggested} 字**。只写已经发生的，不要推测后续。`,
        `2. user：玩家（${PLAYER_LABEL}）现在处于什么状态。写玩家已经表明的身份、已经做过并被旁人看到的事、已经给出的承诺或立场、以及角色们现在怎么看玩家。**不超过 ${input.lengths.user.suggested} 字**。不要替玩家编造没做过的决定。`,
        `3. characters：每个真正参与了剧情的角色一条。写这个角色**已经确立的处境、立场、掌握的信息、和玩家之间的关系变化**，不要复述他说过的台词，也不要写他的心理活动。没有变化的角色不要列。**每条不超过 ${input.lengths.character.suggested} 字**。`,
        '',
        '# 硬性要求',
        '1. 只写故事里真实发生过的事。没有依据的内容一律不写，不要补全，不要推测。',
        '2. 你拿到的是从开场到现在的完整剧情。写的是**当前状态**，不是剧情经过：同一件事只写它最后落到了什么结果，不要按时间顺序复述一遍。',
        '3. 每一段都要具体到可以据此回想是哪一幕，但不要超过上面给的篇幅。',
        '4. 中文。',
        '',
        '# 输出格式',
        '只输出一个 JSON 对象，第一个字符是 {，最后一个字符是 }。不要代码围栏，不要任何解释。',
        '{"world":"世界当前状态","user":{"progress":"玩家当前状态"},"characters":[{"name":"角色名","progress":"这个角色的进展"}]}',
        'characters 里的 name 必须来自上面的角色名单。',
    ].join('\n');
}
/** Name the ledger uses for the player, who has no card. */
export const PLAYER_LABEL = '玩家';
/** First non-empty line of a card description, trimmed for a roster line. */
function firstLine(text) {
    const line = text.split('\n').map(part => part.trim()).find(part => part.length > 0) ?? '';
    return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}
/**
 * Build the user message one tracking run sends.
 * @param transcript - the whole story so far, oldest first.
 * @param turn - newest beat the transcript reaches.
 * @returns the message text.
 */
export function buildTrackerMessage(transcript, turn) {
    if (transcript.length === 0) {
        return `（第 ${turn} 轮之前的剧情还没有写入舞台，请输出空摘要。）\n\n{"world":"","user":{"progress":""},"characters":[]}`;
    }
    return [
        `# 剧情全文（从开场到第 ${turn} 轮）`,
        transcript,
        '',
        '按上面的要求输出这一版进展摘要。',
    ].join('\n');
}
/**
 * Parse one tracking reply into a ledger.
 *
 * A reply that carries no usable ledger yields `undefined` rather than an empty
 * one: the caller then keeps the previous state, so the next run retries the
 * same range instead of silently skipping it.
 *
 * Each section is cut to its configured ceiling. The prompt already asks for
 * those lengths, so the cut only fires when the model overshoots; keeping it
 * here means a long ledger cannot push the next run's prompt past the context
 * window, which is the failure mode that compounds.
 * @param text - raw model output.
 * @param cards - cast, used to resolve a character name back to its card id.
 * @param lengths - per-category budgets; omitted keeps the legacy flat ceiling.
 * @returns the ledger, or `undefined` when nothing usable parsed.
 */
export function parseTrackerReply(text, cards, lengths) {
    const json = extractJsonObject(text);
    if (json === undefined)
        return undefined;
    const worldMax = lengths === undefined ? TRACKER_FIELD_MAX_CHARS : trackerSectionCeiling(lengths.world.suggested);
    const userMax = lengths === undefined ? TRACKER_FIELD_MAX_CHARS : trackerSectionCeiling(lengths.user.suggested);
    const characterMax = lengths === undefined ? TRACKER_FIELD_MAX_CHARS : trackerSectionCeiling(lengths.character.suggested);
    const world = typeof json.world === 'string' ? clamp(json.world.trim(), worldMax) : '';
    const userText = typeof json.user === 'object' && json.user !== null && !Array.isArray(json.user)
        ? json.user.progress
        : undefined;
    const userProgress = typeof userText === 'string' ? clamp(userText.trim(), userMax) : '';
    const user = userProgress.length === 0 ? undefined : { progress: userProgress };
    const byName = new Map(cards.map(card => [card.name, card]));
    const characters = [];
    const seen = new Set();
    for (const item of Array.isArray(json.characters) ? json.characters : []) {
        if (characters.length >= TRACKER_CHARACTER_MAX)
            break;
        if (typeof item !== 'object' || item === null || Array.isArray(item))
            continue;
        const record = item;
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        const progress = typeof record.progress === 'string' ? record.progress.trim() : '';
        if (name.length === 0 || progress.length === 0)
            continue;
        if (seen.has(name))
            continue;
        seen.add(name);
        const card = byName.get(name);
        characters.push({
            name,
            progress: clamp(progress, characterMax),
            ...(card === undefined ? {} : { id: card.id }),
        });
    }
    // A ledger with no world state, no player entry, and no character entry says
    // nothing; storing it would mark the range as tracked.
    if (world.length === 0 && user === undefined && characters.length === 0)
        return undefined;
    return { world, characters, ...(user === undefined ? {} : { user }) };
}
/** Cut one field to the ledger's per-field ceiling. */
function clamp(text, max) {
    return text.length <= max ? text : `${text.slice(0, max)}…`;
}
/**
 * Extract the first balanced JSON object from a reply.
 * @param text - candidate text.
 * @returns the parsed object, or `undefined` when none parses.
 */
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
