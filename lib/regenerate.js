/**
 * Regeneration bookkeeping for tavern beats.
 *
 * The DSH transcript is append-only: the client renders each assistant reply
 * where it was committed and offers no way to retract one. A tavern beat is
 * therefore regenerated the way a player expects — the story's own state
 * (`stage.jsonl` and `world.json`) is rewound to the point before the beat, the
 * beat runs again, and the new reply is appended as the next turn. The model
 * only ever reads the story state, so the discarded draft genuinely stops
 * influencing the scene.
 *
 * This module owns the two durable facts that makes that readable afterwards:
 * which beat file is newest (so regeneration always targets the latest beat),
 * and which turns were superseded (so the transcript can label them instead of
 * presenting two live replies).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
/** Source kind identifying the opening trigger in derived history. */
export const OPENING_SOURCE_KIND = 'tavern-opening';
/** Body of the opening trigger; never shown to the player as speech. */
export const OPENING_PROMPT = '（开场）';
/** Source kind identifying the regeneration trigger in derived history. */
export const REGENERATE_SOURCE_KIND = 'tavern-regenerate';
/** Body of the regeneration trigger; never shown to the player as speech. */
export const REGENERATE_PROMPT = '（重新生成上一幕）';
/** Text returned when a regeneration has no replayable beat to work from. */
export const REGENERATE_UNAVAILABLE = '这一幕没有可重放的记录，无法重新生成。';
/**
 * How long a queued regeneration blocks another one.
 *
 * The trigger's turn has not opened when the request is accepted, so the story
 * shows no new beat yet; this window is what makes a double click one request.
 */
export const REGENERATION_QUEUE_WINDOW_MS = 120_000;
/** Subdirectory holding one JSON file per beat. */
export const BEATS_DIRECTORY = 'beats';
/** File recording which turns regeneration superseded. */
export const REGENERATIONS_FILE = 'regenerations.json';
/** Regeneration file schema written by this build. */
export const REGENERATIONS_SCHEMA = 1;
/**
 * Parse one stored beat record.
 *
 * Beats are written for inspection and only regeneration reads them back, so a
 * damaged or older file is skipped rather than treated as fatal; the caller
 * then falls back to the previous beat, and a truly unreadable story refuses
 * regeneration with a clear message.
 * @param value - parsed JSON value from a beat file.
 * @returns the record, or `undefined` when it cannot drive a replay.
 */
export function parseBeatRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const record = value;
    if (typeof record.at !== 'string')
        return undefined;
    if (typeof record.playerInput !== 'string')
        return undefined;
    const decision = record.decision;
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision))
        return undefined;
    const turns = Array.isArray(record.turns)
        ? record.turns.filter((turn) => typeof turn === 'object' && turn !== null && !Array.isArray(turn))
        : [];
    return {
        at: record.at,
        playerInput: record.playerInput,
        directorSystem: typeof record.directorSystem === 'string' ? record.directorSystem : '',
        directorReply: typeof record.directorReply === 'string' ? record.directorReply : '',
        decision: decision,
        ...(typeof record.characterSystem === 'string' ? { characterSystem: record.characterSystem } : {}),
        ...(typeof record.speech === 'string' ? { speech: record.speech } : {}),
        ...(turns.length === 0 ? {} : { turns }),
        ...(isIndex(record.turn) ? { turn: record.turn } : {}),
        ...(isIndex(record.stageCountBefore) ? { stageCountBefore: record.stageCountBefore } : {}),
        ...(isWorld(record.worldBefore) ? { worldBefore: record.worldBefore } : {}),
        ...(typeof record.regeneratedFrom === 'string' ? { regeneratedFrom: record.regeneratedFrom } : {}),
    };
}
/** Whether a value is a non-negative safe integer. */
function isIndex(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
/** Whether a value carries the three world-state fields regeneration restores. */
function isWorld(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const world = value;
    return typeof world.scene === 'string'
        && Array.isArray(world.facts) && world.facts.every(item => typeof item === 'string')
        && Array.isArray(world.hidden) && world.hidden.every(item => typeof item === 'string');
}
/**
 * Count the stage lines one beat staged.
 *
 * Used only for beats written before `stageCountBefore` existed. It counts the
 * narration and speech the record itself describes, which is exactly what the
 * beat appended after the opening lines it did not record.
 * @param record - stored beat.
 * @returns how many stage lines the beat produced.
 */
export function stagedLineCount(record) {
    const turns = record.turns ?? [];
    if (turns.length === 0) {
        return (record.decision.narration.trim().length > 0 ? 1 : 0)
            + (record.speech !== undefined && record.speech.trim().length > 0 ? 1 : 0);
    }
    let count = 0;
    for (const turn of turns) {
        if (turn.decision.narration.trim().length > 0)
            count += 1;
        if (turn.speech !== undefined && turn.speech.trim().length > 0)
            count += 1;
    }
    return count;
}
/**
 * Resolve where the stage must be cut to replay one beat.
 * @param record - stored beat being regenerated.
 * @param stageLength - current number of staged lines.
 * @returns the number of leading lines to keep.
 */
export function truncationPoint(record, stageLength) {
    const base = record.stageCountBefore ?? stageLength - stagedLineCount(record);
    return Math.min(Math.max(0, base), stageLength);
}
/**
 * Read the beat files newest first.
 * @param directory - story directory.
 * @returns parsed beats, newest first; unreadable files are skipped.
 */
export async function listBeats(directory) {
    const beatsDirectory = join(directory, BEATS_DIRECTORY);
    let names;
    try {
        names = (await readdir(beatsDirectory)).filter(name => name.endsWith('.json'));
    }
    catch {
        return [];
    }
    names.sort((left, right) => right.localeCompare(left));
    const beats = [];
    for (const name of names) {
        const file = join(beatsDirectory, name);
        try {
            const record = parseBeatRecord(JSON.parse(await readFile(file, 'utf8')));
            if (record !== undefined)
                beats.push({ file, record });
        }
        catch {
            // A half-written or hand-edited beat cannot drive a replay; the next
            // older beat remains available instead of failing the whole story.
        }
    }
    return beats;
}
/**
 * Read one story's regeneration history.
 * @param directory - story directory.
 * @returns the stored records; an absent or unreadable file reads as none.
 */
export async function readRegenerations(directory) {
    let text;
    try {
        text = await readFile(join(directory, REGENERATIONS_FILE), 'utf8');
    }
    catch {
        return [];
    }
    try {
        const value = JSON.parse(text);
        if (typeof value !== 'object' || value === null || Array.isArray(value))
            return [];
        const records = value.regenerations;
        if (!Array.isArray(records))
            return [];
        const usable = [];
        for (const item of records) {
            if (typeof item !== 'object' || item === null || Array.isArray(item))
                continue;
            const record = item;
            if (!isIndex(record.turn) || !isIndex(record.replacement) || typeof record.at !== 'string')
                continue;
            usable.push({ turn: record.turn, replacement: record.replacement, at: record.at });
        }
        return usable;
    }
    catch {
        return [];
    }
}
/**
 * Record one regeneration atomically.
 * @param directory - story directory.
 * @param record - superseded turn and its replacement.
 * @returns the complete history after the append.
 */
export async function appendRegeneration(directory, record) {
    const existing = await readRegenerations(directory);
    const regenerations = [...existing, record];
    const stored = { schema: REGENERATIONS_SCHEMA, regenerations };
    await mkdir(directory, { recursive: true });
    const target = join(directory, REGENERATIONS_FILE);
    const temporary = `${target}.tmp-${randomUUID()}`;
    await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
    try {
        await rename(temporary, target);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
    return regenerations;
}
