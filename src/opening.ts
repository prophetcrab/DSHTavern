/**
 * Opening script for a fresh tavern story.
 *
 * A tavern chat used to open on the card's static fields: a scenario line and a
 * greeting. That is not what a role-play opening needs — it needs the scene
 * established, the cast placed, and the player given something to react to,
 * before the player says anything.
 *
 * `buildOpeningPrompt` asks a model for exactly that: a short opening script
 * written from the workspace's cast and lore, staged as the story's first
 * entries. It runs once, when the chat is still empty, and the result is stored
 * so a reload never regenerates it.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CharacterCard } from './character-card.js'
import type { WorldbookEntry } from './worldbook.js'
import { activateEntries, renderLore } from './worldbook.js'

/** One opening script segment, in the order the player reads it. */
export interface OpeningSegment {
  /** `narration` is the scene; `speech` is a character's first line. */
  readonly kind: 'narration' | 'speech'
  /** Card id for a speech segment, so the stage can name the speaker. */
  readonly cardId?: string
  /** Speaker display name for a speech segment. */
  readonly speakerName?: string
  /** Text of the segment. */
  readonly text: string
}

/** One resolved opening script. */
export interface OpeningScript {
  /** Segments in reading order; never empty when stored. */
  readonly segments: readonly OpeningSegment[]
  /** Card the script centres on, when the model named one. */
  readonly focusCardId?: string
  /** ISO-8601 of generation, for the record. */
  readonly generatedAt?: string
  /** ISO-8601 of the moment the script was written into the session transcript. */
  readonly appendedAt?: string
  /** Provider/model the script was generated with, stamped on its transcript turn. */
  readonly generatedBy?: { readonly provider: string; readonly model: string }
  /**
   * Exact system prompt the generation call sent.
   *
   * Kept beside the script because the opening turn runs later than the
   * generation and must log what was actually sent, not a prompt rebuilt from
   * whatever the cards say by then.
   */
  readonly system?: string
  /** Exact user message the generation call sent. */
  readonly message?: string
}

/** Schema version of the stored script. */
export const OPENING_SCHEMA = 1

/** File name inside a story directory. */
export const OPENING_FILE = 'opening.json'

/** Longest opening script accepted, in segments. */
export const OPENING_SEGMENTS_MAX = 8

/** Build the system prompt that writes an opening script. */
export function buildOpeningSystem(input: {
  readonly cards: readonly CharacterCard[]
  /** Workspace lore; constant and matching entries are injected. */
  readonly worldbook?: readonly WorldbookEntry[]
}): string {
  const roster = input.cards.map((card) => {
    const brief = card.description.split('\n').map(line => line.trim()).find(line => line.length > 0)
    const scene = card.scenario.trim()
    const parts = [
      `- id: ${card.id}`,
      `  名: ${card.name}`,
      `  简介: ${brief?.slice(0, 80) ?? '（无）'}`,
      ...(scene.length === 0 ? [] : [`  所在场景: ${scene}`]),
    ]
    return parts.join('\n')
  }).join('\n')

  const lore = activateEntries({
    entries: input.worldbook ?? [],
    scanText: '',
    recentLines: [],
    audience: 'character',
  })
  const loreText = renderLore([...lore.before, ...lore.after, ...lore.tail])

  return [
    '你是这场角色扮演的开场编剧。玩家还没有开口，你要先把这一场戏立起来。',
    '',
    '# 在场角色',
    roster.length === 0 ? '（没有角色卡）' : roster,
    ...loreText.length === 0 ? [] : ['', '# 世界设定', loreText],
    '',
    '# 你要写什么',
    '写这一段开场：先给一到两段旁白，把地点、时间、天气、在场的人摆清楚，让玩家知道自己站在哪里、正在发生什么；',
    '然后让一到两位角色开口，说出他们此刻最自然会说的第一句话，把话头交给玩家。',
    '',
    '# 硬性要求',
    '1. 旁白只写可以被旁观者看到或听到的内容：环境、事件、他人的反应。绝不写任何角色的内心活动。',
    '2. 绝不替玩家发言、行动、感受或做决定。玩家此刻什么都还没做。',
    '3. 不要让角色直接向玩家提问一串问题；开场是铺陈，不是审问。',
    '4. 角色只说自己会说的话，不要旁白别人，不要替别人反应。',
    '5. 动作与神态用星号包裹，例如：*她把票根理齐*。',
    '6. 中文，克制的短句，重感官细节。总共 4 到 6 段，不要写成小说章节。',
    '',
    '# 输出格式',
    '只输出一个 JSON 对象，不要代码围栏，不要任何解释：',
    '{"segments":[{"kind":"narration","text":"旁白"},{"kind":"speech","cardId":"名册里的 id","text":"角色的话"}]}',
    'speech 段的 cardId 必须来自上面的名单。',
  ].join('\n')
}

/**
 * Parse one opening reply into segments.
 *
 * Tolerates a fenced or prefixed reply by extracting the outermost JSON object,
 * the same tolerance the director parser applies. A reply with no usable
 * segments yields an empty script so the caller can fall back rather than stage
 * malformed text.
 * @param text - raw model output.
 * @param cards - cast used to resolve a speaker name back to its card.
 * @returns the parsed script; `segments` is empty when nothing usable parsed.
 */
export function parseOpeningReply(text: string, cards: readonly CharacterCard[]): OpeningScript {
  const json = extractJsonObject(text)
  if (json === undefined) return { segments: [] }
  const raw = json.segments
  if (!Array.isArray(raw)) return { segments: [] }
  const byId = new Map(cards.map(card => [card.id, card]))
  const byName = new Map(cards.map(card => [card.name, card]))
  const segments: OpeningSegment[] = []
  for (const item of raw.slice(0, OPENING_SEGMENTS_MAX)) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const kind = record.kind === 'speech' ? 'speech' : record.kind === 'narration' ? 'narration' : undefined
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (kind === undefined || text.length === 0) continue
    if (kind === 'narration') {
      segments.push({ kind, text })
      continue
    }
    // A speech segment must name someone in the cast; an unknown id would stage
    // a line with no speaker and lose the voice the player is meant to hear.
    const wanted = typeof record.cardId === 'string' ? record.cardId.trim() : ''
    const card = byId.get(wanted) ?? byName.get(wanted)
    if (card === undefined) continue
    segments.push({ kind, cardId: card.id, speakerName: card.name, text })
  }
  const focus = segments.find(segment => segment.kind === 'speech')
  return {
    segments,
    ...(focus?.cardId === undefined ? {} : { focusCardId: focus.cardId }),
  }
}

/** Extract the first balanced JSON object from a reply. */
function extractJsonObject(text: string): Record<string, unknown> | undefined {  const start = text.indexOf('{')
  if (start === -1) return undefined
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          const value: unknown = JSON.parse(text.slice(start, index + 1))
          return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? value as Record<string, unknown>
            : undefined
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

/**
 * Read one story's stored opening script.
 * @param directory - story directory.
 * @returns the stored script, or `undefined` when none was written or it is unusable.
 */
export async function readOpeningScript(directory: string): Promise<OpeningScript | undefined> {
  let text: string
  try {
    text = await readFile(join(directory, OPENING_FILE), 'utf8')
  } catch {
    return undefined
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const rawSegments = Array.isArray(record.segments) ? record.segments : []
  const segments: OpeningSegment[] = []
  for (const item of rawSegments.slice(0, OPENING_SEGMENTS_MAX)) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const segment = item as Record<string, unknown>
    const kind = segment.kind === 'speech' ? 'speech' : segment.kind === 'narration' ? 'narration' : undefined
    const segmentText = typeof segment.text === 'string' ? segment.text : ''
    if (kind === undefined || segmentText.trim().length === 0) continue
    segments.push({
      kind,
      text: segmentText,
      ...(typeof segment.cardId === 'string' ? { cardId: segment.cardId } : {}),
      ...(typeof segment.speakerName === 'string' ? { speakerName: segment.speakerName } : {}),
    })
  }
  if (segments.length === 0) return undefined
  const generatedBy = parseGeneratedBy(record.generatedBy)
  return {
    segments,
    ...(typeof record.focusCardId === 'string' ? { focusCardId: record.focusCardId } : {}),
    ...(typeof record.generatedAt === 'string' ? { generatedAt: record.generatedAt } : {}),
    ...(typeof record.appendedAt === 'string' ? { appendedAt: record.appendedAt } : {}),
    ...(generatedBy === undefined ? {} : { generatedBy }),
    ...(typeof record.system === 'string' ? { system: record.system } : {}),
    ...(typeof record.message === 'string' ? { message: record.message } : {}),
  }
}

/**
 * Validate the provider/model recorded for a stored script.
 *
 * Both halves are required: the transcript turn stamps this label, and a
 * half-filled pair would report a route that never existed.
 * @param value - decoded field.
 * @returns the pair, or `undefined` when either half is missing.
 */
function parseGeneratedBy(value: unknown): { provider: string; model: string } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const provider = typeof record.provider === 'string' ? record.provider : ''
  const model = typeof record.model === 'string' ? record.model : ''
  if (provider.length === 0 || model.length === 0) return undefined
  return { provider, model }
}

/**
 * Persist one story's opening script atomically.
 * @param directory - story directory.
 * @param script - script to store.
 */
export async function writeOpeningScript(directory: string, script: OpeningScript): Promise<void> {
  const stored: OpeningScript & { schema: number } = {
    schema: OPENING_SCHEMA,
    segments: script.segments,
    ...(script.focusCardId === undefined ? {} : { focusCardId: script.focusCardId }),
    ...(script.appendedAt === undefined ? {} : { appendedAt: script.appendedAt }),
    ...(script.generatedBy === undefined ? {} : { generatedBy: script.generatedBy }),
    ...(script.system === undefined ? {} : { system: script.system }),
    ...(script.message === undefined ? {} : { message: script.message }),
    generatedAt: script.generatedAt ?? new Date().toISOString(),
  }
  await mkdir(directory, { recursive: true })
  const target = join(directory, OPENING_FILE)
  const temporary = `${target}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
