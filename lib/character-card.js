/**
 * Native DSH-Tavern character cards.
 *
 * One card per character, stored as `<workspace>/characters/<id>.charc`
 * (UTF-8 JSON with a `.charc` extension so tavern data is distinguishable from
 * generic JSON). The card is the static definition; runtime state belongs to a
 * chat, not to this file.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
/** Card schema version this build reads and writes. */
export const CHARACTER_SCHEMA = 1;
/** Discriminator stored in every card. */
export const CHARACTER_KIND = 'dshtavern.character';
/** File extension for one character card. */
export const CHARACTER_EXTENSION = '.charc';
/** Directory holding character cards, relative to the workspace root. */
export const CHARACTERS_DIRECTORY = 'characters';
/** Largest accepted card file. */
export const CHARACTER_CARD_MAX_BYTES = 256 * 1024;
/** A stored card is corrupt or violates the schema. */
export class CharacterCardInvalidError extends Error {
    path;
    constructor(message, path) {
        super(message);
        this.path = path;
        this.name = 'CharacterCardInvalidError';
    }
}
/** @param workspaceDir - tavern workspace root. @returns its characters directory. */
export function charactersDirectory(workspaceDir) {
    return join(workspaceDir, CHARACTERS_DIRECTORY);
}
/** @param workspaceDir - tavern workspace root. @param id - card id. @returns the absolute card path. */
export function characterCardPath(workspaceDir, id) {
    return join(charactersDirectory(workspaceDir), `${id}${CHARACTER_EXTENSION}`);
}
/**
 * Whether an id is safe to use as a card file name.
 * @param id - candidate id.
 * @returns true for ids this build may read or write.
 */
export function isCharacterId(id) {
    return /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/.test(id);
}
function optionalText(value, field, max) {
    if (value === undefined || value === null)
        return '';
    if (typeof value !== 'string')
        throw new CharacterCardInvalidError(`${field} 必须是字符串`);
    if (value.length > max)
        throw new CharacterCardInvalidError(`${field} 超过 ${max} 字符`);
    return value;
}
function requiredName(value) {
    const name = optionalText(value, '名称', 80).trim();
    if (name.length === 0)
        throw new CharacterCardInvalidError('角色卡需要名称');
    return name;
}
function parseTags(value) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value))
        throw new CharacterCardInvalidError('tags 必须是字符串数组');
    return value
        .filter((tag) => typeof tag === 'string')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
        .slice(0, 32);
}
function parseGreetings(value) {
    if (value === undefined || value === null)
        return { first: '', alternates: [] };
    if (typeof value !== 'object' || Array.isArray(value))
        throw new CharacterCardInvalidError('greetings 必须是对象');
    const record = value;
    const first = optionalText(record.first, '开场白', 16_000);
    const alternates = Array.isArray(record.alternates)
        ? record.alternates
            .filter((entry) => typeof entry === 'string')
            .map(entry => entry.trim())
            .filter(entry => entry.length > 0)
            .slice(0, 16)
        : [];
    return { first, alternates };
}
function parseEntries(value) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value))
        throw new CharacterCardInvalidError('entries 必须是数组');
    return value.slice(0, 256).map((raw, index) => {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            throw new CharacterCardInvalidError(`entries[${index}] 必须是对象`);
        }
        const record = raw;
        const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID();
        const position = record.position === 'after' ? 'after' : 'before';
        return {
            id,
            name: optionalText(record.name, `entries[${index}].name`, 120),
            content: optionalText(record.content, `entries[${index}].content`, 16_000),
            keys: Array.isArray(record.keys)
                ? record.keys.filter((key) => typeof key === 'string').map(key => key.trim()).filter(Boolean).slice(0, 32)
                : [],
            position,
            constant: record.constant === true,
            enabled: record.enabled !== false,
        };
    });
}
/**
 * Build a normalized card from caller input.
 * @param id - stable card id.
 * @param input - caller fields.
 * @param timestamps - creation/update instants.
 * @returns the validated card.
 */
export function buildCharacterCard(id, input, timestamps) {
    return {
        schema: CHARACTER_SCHEMA,
        kind: CHARACTER_KIND,
        id,
        name: requiredName(input.name),
        description: optionalText(input.description, '描述', 64_000),
        personality: optionalText(input.personality, '性格', 64_000),
        scenario: optionalText(input.scenario, '场景', 64_000),
        systemPrompt: optionalText(input.systemPrompt, '系统提示词', 64_000),
        exampleDialogues: optionalText(input.exampleDialogues, '示例对话', 128_000),
        greetings: parseGreetings(input.greetings),
        tags: parseTags(input.tags),
        entries: parseEntries(input.entries),
        createdAt: timestamps.createdAt,
        updatedAt: timestamps.updatedAt,
    };
}
/**
 * Parse one stored card.
 * @param text - file content.
 * @param path - file path for diagnostics.
 * @returns the validated card.
 */
export function parseCharacterCard(text, path) {
    if (text.length > CHARACTER_CARD_MAX_BYTES) {
        throw new CharacterCardInvalidError('角色卡文件过大', path);
    }
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new CharacterCardInvalidError('角色卡不是合法 JSON', path);
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new CharacterCardInvalidError('角色卡必须是 JSON 对象', path);
    }
    const record = value;
    if (record.kind !== CHARACTER_KIND)
        throw new CharacterCardInvalidError('不是酒馆角色卡', path);
    if (typeof record.id !== 'string' || !isCharacterId(record.id)) {
        throw new CharacterCardInvalidError('角色卡 id 非法', path);
    }
    if (typeof record.schema === 'number' && record.schema > CHARACTER_SCHEMA) {
        throw new CharacterCardInvalidError(`角色卡 schema ${String(record.schema)} 高于支持版本`, path);
    }
    const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();
    return buildCharacterCard(record.id, record, {
        createdAt,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : createdAt,
    });
}
/**
 * Parse an imported card as a new card owned by the target workspace.
 *
 * An exported `.charc` carries its original id and timestamps; importing keeps
 * the content but mints a fresh id, so importing into the workspace a card came
 * from creates a copy instead of colliding with or overwriting the original.
 * @param text - file content.
 * @param path - file path for diagnostics.
 * @returns the card to store.
 */
export function parseCharacterCardImport(text, path) {
    if (text.length > CHARACTER_CARD_MAX_BYTES) {
        throw new CharacterCardInvalidError('角色卡文件过大', path);
    }
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new CharacterCardInvalidError('角色卡不是合法 JSON', path);
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new CharacterCardInvalidError('角色卡必须是 JSON 对象', path);
    }
    const record = value;
    if (record.kind !== undefined && record.kind !== CHARACTER_KIND) {
        throw new CharacterCardInvalidError(`不是酒馆角色卡（kind=${String(record.kind)}）`, path);
    }
    if (typeof record.schema === 'number' && record.schema > CHARACTER_SCHEMA) {
        throw new CharacterCardInvalidError(`角色卡 schema ${String(record.schema)} 高于支持版本`, path);
    }
    const now = new Date().toISOString();
    return buildCharacterCard(randomUUID(), record, { createdAt: now, updatedAt: now });
}
/**
 * Render one card as a portable `.charc` document.
 *
 * Byte-for-byte the format {@link writeCard} stores, so an exported file can be
 * re-imported without a conversion step.
 * @param card - stored card.
 * @returns the JSON text to download.
 */
export function exportCharacterCardText(card) {
    return `${JSON.stringify(card, null, 2)}\n`;
}
/**
 * List every card in one workspace.
 * @param workspaceDir - tavern workspace root.
 * @returns readable cards (newest first) and unreadable files.
 */
export async function listCharacterCards(workspaceDir) {
    const directory = charactersDirectory(workspaceDir);
    let names;
    try {
        names = await readdir(directory);
    }
    catch (error) {
        if (isMissing(error))
            return { cards: [], problems: [] };
        throw error;
    }
    const cards = [];
    const problems = [];
    for (const name of names) {
        if (!name.endsWith(CHARACTER_EXTENSION))
            continue;
        const id = name.slice(0, -CHARACTER_EXTENSION.length);
        if (!isCharacterId(id)) {
            problems.push({ file: name, error: '文件名不是合法的角色卡 id' });
            continue;
        }
        const path = join(directory, name);
        try {
            cards.push(parseCharacterCard(await readFile(path, 'utf8'), path));
        }
        catch (error) {
            problems.push({ file: name, error: error instanceof Error ? error.message : String(error) });
        }
    }
    cards.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return { cards, problems };
}
/**
 * Read one workspace's cards synchronously.
 *
 * The prompt text provider runs while DSH assembles a request, before any async
 * hook can run, so it cannot await the directory scan. Unreadable files are
 * skipped exactly as in {@link listCharacterCards}.
 * @param workspaceDir - tavern workspace root.
 * @returns readable cards, newest first.
 */
export function listCharacterCardsSync(workspaceDir) {
    const directory = charactersDirectory(workspaceDir);
    let names;
    try {
        names = readdirSync(directory);
    }
    catch {
        return [];
    }
    const cards = [];
    for (const name of names) {
        if (!name.endsWith(CHARACTER_EXTENSION))
            continue;
        const id = name.slice(0, -CHARACTER_EXTENSION.length);
        if (!isCharacterId(id))
            continue;
        const path = join(directory, name);
        try {
            cards.push(parseCharacterCard(readFileSync(path, 'utf8'), path));
        }
        catch {
            // An unreadable card is not a prompt source; the listing path reports it.
        }
    }
    cards.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return cards;
}
/**
 * Read one card.
 * @param workspaceDir - tavern workspace root.
 * @param id - card id.
 * @returns the card, or undefined when absent.
 */
export async function readCharacterCard(workspaceDir, id) {
    if (!isCharacterId(id))
        throw new CharacterCardInvalidError('角色卡 id 非法');
    try {
        return parseCharacterCard(await readFile(characterCardPath(workspaceDir, id), 'utf8'), characterCardPath(workspaceDir, id));
    }
    catch (error) {
        if (isMissing(error))
            return undefined;
        throw error;
    }
}
async function writeCard(workspaceDir, card) {
    const directory = charactersDirectory(workspaceDir);
    await mkdir(directory, { recursive: true });
    const text = `${JSON.stringify(card, null, 2)}\n`;
    if (text.length > CHARACTER_CARD_MAX_BYTES)
        throw new CharacterCardInvalidError('角色卡文件过大');
    const target = characterCardPath(workspaceDir, card.id);
    const temporary = `${target}.tmp-${randomUUID()}`;
    await writeFile(temporary, text, 'utf8');
    try {
        await rename(temporary, target);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}
/**
 * Persist one already-validated card.
 * @param workspaceDir - tavern workspace root.
 * @param card - card to store; its id names the file.
 */
export async function writeCharacterCard(workspaceDir, card) {
    await writeCard(workspaceDir, card);
}
/**
 * Create one card in a workspace.
 * @param workspaceDir - tavern workspace root.
 * @param input - card fields.
 * @returns the stored card.
 */
export async function createCharacterCard(workspaceDir, input) {
    const now = new Date().toISOString();
    const card = buildCharacterCard(randomUUID(), input, { createdAt: now, updatedAt: now });
    await writeCard(workspaceDir, card);
    return card;
}
/**
 * Save one existing card.
 * @param workspaceDir - tavern workspace root.
 * @param id - card id.
 * @param input - replacement card fields.
 * @returns the stored card.
 * @throws CharacterCardInvalidError when the card does not exist.
 */
export async function saveCharacterCard(workspaceDir, id, input) {
    const existing = await readCharacterCard(workspaceDir, id);
    if (existing === undefined)
        throw new CharacterCardInvalidError('角色卡不存在');
    const card = buildCharacterCard(id, input, {
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
    });
    await writeCard(workspaceDir, card);
    return card;
}
/**
 * Delete one card.
 * @param workspaceDir - tavern workspace root.
 * @param id - card id.
 * @returns whether a card file was removed.
 */
export async function deleteCharacterCard(workspaceDir, id) {
    if (!isCharacterId(id))
        throw new CharacterCardInvalidError('角色卡 id 非法');
    try {
        await unlink(characterCardPath(workspaceDir, id));
        return true;
    }
    catch (error) {
        if (isMissing(error))
            return false;
        throw error;
    }
}
function isMissing(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return false;
    const code = error.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}
