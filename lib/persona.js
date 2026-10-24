/**
 * Player personas.
 *
 * A persona is who the player is in a tavern: name, appearance, background, and
 * how they speak. It belongs to the workspace, not to a chat, so every chat in
 * one tavern shares the same player identity.
 *
 * The store keeps a library with exactly one active persona. Prompt assembly
 * reads the active one and fills the `user-persona` block with it, so switching
 * personas changes the next request without touching the prompt layout.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATE_DIRECTORY } from './stage.js';
/** Persona file name inside the tavern state directory. */
export const PERSONA_FILE = 'persona.json';
/** Persona schema version this build reads and writes. */
export const PERSONA_SCHEMA = 1;
/** Largest accepted persona file. */
export const PERSONA_FILE_MAX_BYTES = 256 * 1024;
/** Most personas one workspace may keep. */
export const PERSONA_MAX = 64;
/** A persona file or entry is structurally invalid. */
export class PersonaInvalidError extends Error {
    path;
    constructor(message, path) {
        super(message);
        this.path = path;
        this.name = 'PersonaInvalidError';
    }
}
/** @param workspaceDir - tavern workspace root. @returns the persona file path. */
export function personaPath(workspaceDir) {
    return join(workspaceDir, STATE_DIRECTORY, PERSONA_FILE);
}
/** @returns an empty persona library. */
export function emptyPersonaFile() {
    return { schema: PERSONA_SCHEMA, personas: [] };
}
/** Longest accepted single field. */
const FIELD_MAX = 16_000;
/**
 * Build one persona from caller input.
 * @param input - caller fields.
 * @param timestamps - creation and update instants.
 * @param id - stable identity; generated when absent.
 * @returns the validated persona.
 * @throws PersonaInvalidError when a field is malformed or the name is empty.
 */
export function buildPersona(input, timestamps, id) {
    const name = text(input.name, '名称').trim();
    if (name.length === 0)
        throw new PersonaInvalidError('玩家人设需要名称');
    return {
        id: id ?? randomUUID(),
        name: name.slice(0, 80),
        description: text(input.description, '外观').slice(0, FIELD_MAX),
        personality: text(input.personality, '性格').slice(0, FIELD_MAX),
        background: text(input.background, '背景').slice(0, FIELD_MAX),
        speakingStyle: text(input.speakingStyle, '说话方式').slice(0, FIELD_MAX),
        characterSheet: text(input.characterSheet, '角色设定').slice(0, FIELD_MAX),
        tags: tagList(input.tags),
        createdAt: timestamps.createdAt,
        updatedAt: timestamps.updatedAt,
    };
}
/**
 * Parse a stored persona file.
 * @param body - file content.
 * @param path - file path for diagnostics.
 * @returns the parsed file.
 * @throws PersonaInvalidError when the document is unusable.
 */
export function parsePersonaFile(body, path) {
    if (body.length > PERSONA_FILE_MAX_BYTES)
        throw new PersonaInvalidError('人设文件过大', path);
    let value;
    try {
        value = JSON.parse(body);
    }
    catch {
        throw new PersonaInvalidError('人设文件不是合法 JSON', path);
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new PersonaInvalidError('人设文件必须是 JSON 对象', path);
    }
    const record = value;
    const schema = typeof record.schema === 'number' ? record.schema : PERSONA_SCHEMA;
    if (schema > PERSONA_SCHEMA) {
        throw new PersonaInvalidError(`人设 schema ${schema} 高于支持版本`, path);
    }
    const raw = Array.isArray(record.personas) ? record.personas : [];
    const personas = raw.slice(0, PERSONA_MAX).map(item => parsePersona(item, path));
    const activeId = typeof record.activeId === 'string' && personas.some(persona => persona.id === record.activeId)
        ? record.activeId
        : personas[0]?.id;
    return {
        schema: PERSONA_SCHEMA,
        personas,
        ...(activeId === undefined ? {} : { activeId }),
        ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
    };
}
/**
 * Read one workspace's persona library.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored library, or an empty one when absent.
 */
export async function readPersonaFile(workspaceDir) {
    let body;
    try {
        body = await readFile(personaPath(workspaceDir), 'utf8');
    }
    catch (error) {
        if (isMissing(error))
            return emptyPersonaFile();
        throw error;
    }
    return parsePersonaFile(body, personaPath(workspaceDir));
}
/**
 * Resolve the persona the prompts should use.
 * @param workspaceDir - tavern workspace root.
 * @returns the active persona, or `undefined` when the library is empty.
 */
export async function readActivePersona(workspaceDir) {
    const file = await readPersonaFile(workspaceDir);
    if (file.activeId === undefined)
        return undefined;
    return file.personas.find(persona => persona.id === file.activeId) ?? file.personas[0];
}
/**
 * Persist one workspace's persona library atomically.
 * @param workspaceDir - tavern workspace root.
 * @param file - complete library.
 * @returns the stored library with a fresh `updatedAt`.
 */
export async function writePersonaFile(workspaceDir, file) {
    if (file.personas.length > PERSONA_MAX) {
        throw new PersonaInvalidError(`最多保留 ${PERSONA_MAX} 个人设`);
    }
    const stored = {
        schema: PERSONA_SCHEMA,
        personas: file.personas,
        ...(file.activeId === undefined ? {} : { activeId: file.activeId }),
        updatedAt: new Date().toISOString(),
    };
    const body = `${JSON.stringify(stored, null, 2)}\n`;
    if (body.length > PERSONA_FILE_MAX_BYTES)
        throw new PersonaInvalidError('人设文件过大');
    const directory = join(workspaceDir, STATE_DIRECTORY);
    await mkdir(directory, { recursive: true });
    const target = personaPath(workspaceDir);
    const temporary = `${target}.tmp-${randomUUID()}`;
    await writeFile(temporary, body, 'utf8');
    try {
        await rename(temporary, target);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
    return stored;
}
/**
 * Render the active persona as the `user-persona` block text.
 *
 * Empty fields are dropped rather than emitted as labelled blanks, so a sparse
 * persona still reads as prose instead of a form.
 * @param persona - active persona.
 * @returns the block text; empty when the persona carries no content.
 */
export function renderPersona(persona) {
    const lines = [`玩家扮演「${persona.name}」。`];
    const parts = [
        ['外观', persona.description],
        ['性格', persona.personality],
        ['背景', persona.background],
        ['说话方式', persona.speakingStyle],
        ['角色设定', persona.characterSheet],
    ];
    for (const [label, value] of parts) {
        const trimmed = value.trim();
        if (trimmed.length > 0)
            lines.push(`${label}：${trimmed}`);
    }
    return lines.join('\n');
}
/** Validate one stored persona. */
function parsePersona(item, path) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new PersonaInvalidError('人设条目必须是对象', path);
    }
    const record = item;
    const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID();
    const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();
    return buildPersona(record, {
        createdAt,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : createdAt,
    }, id);
}
function text(value, field) {
    if (value === undefined || value === null)
        return '';
    if (typeof value !== 'string')
        throw new PersonaInvalidError(`${field} 必须是字符串`);
    return value;
}
function tagList(value) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value))
        throw new PersonaInvalidError('标签必须是字符串数组');
    return value
        .filter((item) => typeof item === 'string')
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .slice(0, 32);
}
function isMissing(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return false;
    const code = error.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}
