/**
 * Tracking prompt and reply parsing.
 *
 * A run asks a model to re-read the story a chat has produced and restate it as
 * a progress ledger. The transcript is the raw material, the previous ledger is
 * the baseline, and the answer is one world entry plus one entry per character:
 * what changed for them, not what they said.
 *
 * The reply is JSON so the panel can render entries without parsing prose. A
 * run that cannot produce usable JSON writes nothing — a wrong ledger is worse
 * than a missing one, because later runs build on it.
 */
import type { CharacterCard } from '../character-card.js'
import type { StageEntry } from '../stage.js'
import type { WorldState } from '../stage.js'
import type { CharacterProgress, TrackerSummary } from './summary.js'

/** Longest one ledger field may be, in characters. */
export const TRACKER_FIELD_MAX_CHARS = 4_000

/** Most characters one ledger may carry entries for. */
export const TRACKER_CHARACTER_MAX = 40

/** One ledger as the model returned it. */
export interface ParsedLedger {
  readonly world: string
  readonly characters: readonly CharacterProgress[]
}

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
export function renderTranscript(
  stage: readonly StageEntry[],
  maxChars: number,
): { text: string; chars: number } {
  const lines: string[] = []
  let total = 0
  for (let index = stage.length - 1; index >= 0; index -= 1) {
    const entry = stage[index]
    if (entry === undefined || entry.scope !== 'observable') continue
    const text = entry.kind === 'narration'
      ? `[旁白] ${entry.text}`
      : `[${entry.speakerName ?? entry.speaker ?? '角色'}] ${entry.text}`
    // Always keep the newest line, even when it alone exceeds the budget: an
    // empty transcript would tell the model nothing about the current scene.
    if (lines.length > 0 && total + text.length > maxChars) break
    total += text.length
    lines.push(text)
  }
  lines.reverse()
  return { text: lines.join('\n'), chars: total }
}

/**
 * Build the system prompt one tracking run sends.
 *
 * The instructions separate the three things a reader needs from a long story:
 * where the world stands, what each character has come to know or want, and
 * what is still unresolved. It explicitly forbids inventing progress, because
 * the ledger is read as fact by later runs.
 * @param input - cast, current world state, and the previous ledger.
 * @returns the system prompt text.
 */
export function buildTrackerSystem(input: {
  readonly cards: readonly CharacterCard[]
  readonly world: WorldState
  readonly previous?: TrackerSummary
}): string {
  const cast = input.cards.length === 0
    ? '（没有角色卡）'
    : input.cards.map(card => `- ${card.name}${card.description.trim().length === 0 ? '' : `：${firstLine(card.description)}`}`).join('\n')
  const baseline = input.previous === undefined
    ? '（这是第一次追踪，没有上一版摘要。）'
    : [
      `覆盖到第 ${input.previous.turn} 轮的摘要：`,
      `世界：${input.previous.world}`,
      ...input.previous.characters.map(entry => `${entry.name}：${entry.progress}`),
    ].join('\n')
  const hidden = input.world.hidden.length === 0
    ? '（无）'
    : input.world.hidden.map(item => `- ${item}`).join('\n')
  return [
    '你是这场角色扮演的剧情记录员。你不参与演出，只负责把已经发生的剧情整理成一份进展摘要，供之后回顾。',
    '',
    '# 在场角色',
    cast,
    '',
    '# 导演记录的隐藏剧情（玩家与角色都不知道）',
    hidden,
    '',
    '# 上一版摘要',
    baseline,
    '',
    '# 你要写什么',
    '1. world：这个世界现在处于什么状态。写地点、时间、当前正在发生的事、已经确立但还没解决的关键线索。三到六句，只写已经发生的，不要推测后续。',
    '2. characters：每个真正参与了剧情的角色一条。写这个角色**已经确立的处境、立场、掌握的信息、和玩家之间的关系变化**，不要复述他说过的台词，也不要写他的心理活动。没有变化的角色不要列。',
    '',
    '# 硬性要求',
    '1. 只写故事里真实发生过的事。没有依据的内容一律不写，不要补全，不要推测。',
    '2. 有上一版摘要时，在它的基础上**更新**：已经写过的进展保留，新发生的补上，被推翻的改掉。不要重复罗列同一件事。',
    '3. 每条控制在两到四句，具体到可以据此回想是哪一幕。',
    '4. 中文。',
    '',
    '# 输出格式',
    '只输出一个 JSON 对象，第一个字符是 {，最后一个字符是 }。不要代码围栏，不要任何解释。',
    '{"world":"世界当前状态","characters":[{"name":"角色名","progress":"这个角色的进展"}]}',
    'characters 里的 name 必须来自上面的角色名单。',
  ].join('\n')
}

/** First non-empty line of a card description, trimmed for a roster line. */
function firstLine(text: string): string {
  const line = text.split('\n').map(part => part.trim()).find(part => part.length > 0) ?? ''
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

/**
 * Build the user message one tracking run sends.
 * @param transcript - story so far, oldest first.
 * @param turn - newest beat the transcript reaches.
 * @returns the message text.
 */
export function buildTrackerMessage(transcript: string, turn: number): string {
  if (transcript.length === 0) {
    return `（第 ${turn} 轮之前的剧情还没有写入舞台，请输出空摘要。）\n\n{"world":"","characters":[]}`
  }
  return [
    `# 到目前为止的剧情（写到第 ${turn} 轮）`,
    transcript,
    '',
    '按上面的要求输出这一版进展摘要。',
  ].join('\n')
}

/**
 * Parse one tracking reply into a ledger.
 *
 * A reply that carries no usable ledger yields `undefined` rather than an empty
 * one: the caller then keeps the previous state, so the next run retries the
 * same range instead of silently skipping it.
 * @param text - raw model output.
 * @param cards - cast, used to resolve a character name back to its card id.
 * @returns the ledger, or `undefined` when nothing usable parsed.
 */
export function parseTrackerReply(text: string, cards: readonly CharacterCard[]): ParsedLedger | undefined {
  const json = extractJsonObject(text)
  if (json === undefined) return undefined
  const world = typeof json.world === 'string' ? clamp(json.world.trim(), TRACKER_FIELD_MAX_CHARS) : ''
  const byName = new Map(cards.map(card => [card.name, card]))
  const characters: CharacterProgress[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(json.characters) ? json.characters : []) {
    if (characters.length >= TRACKER_CHARACTER_MAX) break
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const progress = typeof record.progress === 'string' ? record.progress.trim() : ''
    if (name.length === 0 || progress.length === 0) continue
    if (seen.has(name)) continue
    seen.add(name)
    const card = byName.get(name)
    characters.push({
      name,
      progress: clamp(progress, TRACKER_FIELD_MAX_CHARS),
      ...(card === undefined ? {} : { id: card.id }),
    })
  }
  // A ledger with neither a world state nor any character entry says nothing;
  // storing it would mark the range as tracked.
  if (world.length === 0 && characters.length === 0) return undefined
  return { world, characters }
}

/** Cut one field to the ledger's per-field ceiling. */
function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/**
 * Extract the first balanced JSON object from a reply.
 * @param text - candidate text.
 * @returns the parsed object, or `undefined` when none parses.
 */
function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{')
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
