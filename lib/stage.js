/**
 * Tavern stage and world state.
 *
 * The stage is the reader-visible record of a role-play: every narration line
 * and every character line, in order. Every participant — the director and each
 * character — reads the same stage, so "shared context" means a shared stage,
 * never a shared brain.
 *
 * The world state is the director's private ledger: facts, unresolved plot, and
 * anything the characters do not yet know. It is never sent to a character.
 *
 * Files live beside the marker under `<workspace>/.dshtavern/`:
 * `stage.jsonl` (append-only) and `world.json` (rewritten atomically).
 */
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
/** Directory holding tavern runtime state, relative to the workspace root. */
export const STATE_DIRECTORY = '.dshtavern';
/** Append-only stage log. */
export const STAGE_FILE = 'stage.jsonl';
/** Director-owned world snapshot. */
export const WORLD_FILE = 'world.json';
/** @param workspaceDir - tavern workspace root. @returns its state directory. */
export function stateDirectory(workspaceDir) {
    return join(workspaceDir, STATE_DIRECTORY);
}
/**
 * Directory owning one session's stage and world.
 *
 * A stage belongs to a chat, not to a workspace: two chats in the same tavern
 * are different stories and must not share a transcript. `session` narrows the
 * files to that one chat; omitting it addresses the workspace-level directory,
 * which holds only tavern-wide state such as the last recorded request.
 * @param workspaceDir - tavern workspace root.
 * @param session - owning session id, when addressing a chat.
 * @returns the directory for that scope.
 */
export function storyDirectory(workspaceDir, session) {
    const base = stateDirectory(workspaceDir);
    return session === undefined ? base : join(base, 'stories', safeSegment(session));
}
/** @param workspaceDir - tavern workspace root. @param session - chat identity. @returns the stage file path. */
export function stagePath(workspaceDir, session) {
    return join(storyDirectory(workspaceDir, session), STAGE_FILE);
}
/** @param workspaceDir - tavern workspace root. @param session - chat identity. @returns the world file path. */
export function worldPath(workspaceDir, session) {
    return join(storyDirectory(workspaceDir, session), WORLD_FILE);
}
/** Keep a session id usable as one directory segment. */
function safeSegment(session) {
    return session.replace(/[^A-Za-z0-9_-]/g, '_');
}
/** @returns an empty world for a scene that has not started. */
export function emptyWorld() {
    return { scene: '', facts: [], hidden: [] };
}
/**
 * Parse one stage line.
 * @param line - raw JSONL line.
 * @returns the entry, or `undefined` when the line is not a usable entry.
 */
export function parseStageEntry(line) {
    let value;
    try {
        value = JSON.parse(line);
    }
    catch {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const record = value;
    if (typeof record.seq !== 'number' || !Number.isInteger(record.seq))
        return undefined;
    if (typeof record.text !== 'string' || record.text.length === 0)
        return undefined;
    if (record.kind !== 'narration' && record.kind !== 'speech')
        return undefined;
    const scope = record.scope === 'omniscient' ? 'omniscient' : 'observable';
    const speaker = typeof record.speaker === 'string' ? record.speaker : undefined;
    const speakerName = typeof record.speakerName === 'string' ? record.speakerName : undefined;
    return {
        seq: record.seq,
        at: typeof record.at === 'string' ? record.at : new Date(0).toISOString(),
        kind: record.kind,
        ...(speaker === undefined ? {} : { speaker }),
        ...(speakerName === undefined ? {} : { speakerName }),
        text: record.text,
        scope,
    };
}
/**
 * Read the whole stage.
 * @param workspaceDir - tavern workspace root.
 * @returns staged lines in order; a missing file reads as an empty stage.
 */
export async function readStage(workspaceDir, session) {
    let text;
    try {
        text = await readFile(stagePath(workspaceDir, session), 'utf8');
    }
    catch (error) {
        if (isMissing(error))
            return [];
        throw error;
    }
    const entries = [];
    for (const line of text.split('\n')) {
        if (line.trim().length === 0)
            continue;
        const entry = parseStageEntry(line);
        if (entry !== undefined)
            entries.push(entry);
    }
    return entries;
}
/**
 * Append lines to the stage, assigning sequence numbers after the current tail.
 * @param workspaceDir - tavern workspace root.
 * @param lines - lines to append, without `seq`.
 * @returns the appended entries with their assigned sequence numbers.
 */
export async function appendStage(workspaceDir, lines, session) {
    if (lines.length === 0)
        return [];
    const existing = await readStage(workspaceDir, session);
    let next = existing.reduce((max, entry) => Math.max(max, entry.seq), 0) + 1;
    const at = new Date().toISOString();
    const appended = [];
    for (const line of lines) {
        appended.push({ seq: next, at, ...line });
        next += 1;
    }
    await mkdir(storyDirectory(workspaceDir, session), { recursive: true });
    const text = appended.map(entry => `${JSON.stringify(entry)}\n`).join('');
    await appendFile(stagePath(workspaceDir, session), text, 'utf8');
    return appended;
}
/**
 * Replace the whole stage with a new line list.
 *
 * Regeneration replays the newest beat, so its discarded narration and speech
 * must leave the stage before the replay reads it; otherwise the new beat reads
 * its own discarded draft as established history and continues from it. The
 * write happens only after the replay settles, so a failed replay leaves the
 * story exactly as it was rather than deleting the beat it could not replace.
 * Sequence numbers are reassigned from the new head because nothing outside
 * the stage stores them.
 * @param workspaceDir - tavern workspace root.
 * @param lines - complete replacement content, in story order.
 * @param session - owning session id, when addressing a chat.
 * @returns the written entries.
 */
export async function writeStage(workspaceDir, lines, session) {
    const at = new Date().toISOString();
    // Fields are picked explicitly: the caller may pass entries that already
    // carry `seq`/`at` (a replayed stage), and a spread would let those stale
    // values win over the renumbering this function promises.
    const entries = lines.map((line, index) => ({
        seq: index + 1,
        at,
        kind: line.kind,
        text: line.text,
        scope: line.scope,
        ...(line.speaker === undefined ? {} : { speaker: line.speaker }),
        ...(line.speakerName === undefined ? {} : { speakerName: line.speakerName }),
    }));
    const directory = storyDirectory(workspaceDir, session);
    await mkdir(directory, { recursive: true });
    const target = stagePath(workspaceDir, session);
    const temporary = `${target}.tmp-${randomUUID()}`;
    const text = entries.map(entry => `${JSON.stringify(entry)}\n`).join('');
    await writeFile(temporary, text, 'utf8');
    try {
        await rename(temporary, target);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
    return entries;
}
/**
 * Parse a stored world snapshot.
 *
 * Shared with beat replay, which restores the snapshot a regenerated beat
 * started from; both readers must agree on what a partial or damaged file
 * means, so the rule lives here once.
 * @param value - parsed JSON value.
 * @returns the world; an empty one for anything unusable.
 */
export function parseWorld(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return emptyWorld();
    const record = value;
    return {
        scene: typeof record.scene === 'string' ? record.scene : '',
        facts: stringList(record.facts),
        hidden: stringList(record.hidden),
        ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
    };
}
/**
 * Read the director's world snapshot.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored world, or an empty one before the first write.
 */
export async function readWorld(workspaceDir, session) {
    let text;
    try {
        text = await readFile(worldPath(workspaceDir, session), 'utf8');
    }
    catch (error) {
        if (isMissing(error))
            return emptyWorld();
        throw error;
    }
    try {
        return parseWorld(JSON.parse(text));
    }
    catch {
        return emptyWorld();
    }
}
/**
 * Write the world snapshot atomically (temporary file then rename).
 * @param workspaceDir - tavern workspace root.
 * @param world - snapshot to persist; `updatedAt` is stamped here.
 * @returns the stored snapshot.
 */
export async function writeWorld(workspaceDir, world, session) {
    const stored = { ...world, updatedAt: new Date().toISOString() };
    const directory = storyDirectory(workspaceDir, session);
    await mkdir(directory, { recursive: true });
    const target = worldPath(workspaceDir, session);
    const temporary = `${target}.tmp-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
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
 * Render the stage as the transcript both the director and characters read.
 * @param entries - staged lines.
 * @param options - optional speaker filter applied to speech lines.
 * @returns one line per entry, prefixed by who produced it.
 */
export function renderStage(entries, options = {}) {
    const allowed = options.onlySpeakers === undefined ? undefined : new Set(options.onlySpeakers);
    const lines = [];
    for (const entry of entries) {
        if (entry.scope !== 'observable')
            continue;
        if (entry.kind === 'narration') {
            lines.push(`[旁白] ${entry.text}`);
            continue;
        }
        if (allowed !== undefined && entry.speaker !== undefined && !allowed.has(entry.speaker))
            continue;
        lines.push(`[${entry.speakerName ?? entry.speaker ?? '角色'}] ${entry.text}`);
    }
    return lines.join('\n');
}
function stringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string');
}
function isMissing(error) {
    if (typeof error !== 'object' || error === null || !('code' in error))
        return false;
    const code = error.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}
