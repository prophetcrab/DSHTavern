/**
 * Durable record of the prompts one tavern beat sent.
 *
 * The orchestrator replaces the agent loop's model call, so the director and
 * character requests never pass through the loop's `system/message` path: the
 * session log only ever holds the workspace prompt, which does not change
 * between turns. That left the prompts that actually decide each reply
 * invisible in Trajectory.
 *
 * This module owns the plugin record's payload — its schema, its bounds, and
 * how it renders — with no host imports, so the browser half can share it.
 * `beat-log-host.ts` projects a beat's stored prompts into this shape.
 */
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Every prompt one tavern beat sent, in call order. */
    'plugin:dshtavern/beat': TavernBeatLog
  }
}

/** Plugin record type written after each beat. */
export const BEAT_RECORD_TYPE = 'plugin:dshtavern/beat'

/**
 * Longest text one logged prompt field may carry.
 *
 * The extreme context preset can legitimately build a director prompt of a few
 * hundred thousand characters. Logging that verbatim would multiply a session's
 * size worse than the story itself, and the full text is already in the beat
 * file beside the stage. This bound keeps a normal beat exact (2–3k characters)
 * and marks a pathological one as truncated instead of silently storing it
 * partly.
 */
export const BEAT_LOG_FIELD_MAX_CHARS = 64 * 1024

/** One model call's prompt and answer. */
export interface TavernBeatLogCall {
  /** Role this call served: the opening writer, the director, or one character. */
  readonly role: 'opening' | 'director' | 'character'
  /** Card identity, for a character call. */
  readonly cardId?: string
  /** Speaker name, for a character call. */
  readonly name?: string
  /** Provider/model the call used. */
  readonly model: string
  /** System prompt sent. */
  readonly system: string
  /** User message sent. */
  readonly message: string
  /** Text the call returned. */
  readonly reply: string
  /** Whether any field above was cut to {@link BEAT_LOG_FIELD_MAX_CHARS}. */
  readonly truncated?: true
}

/** One beat's prompts, as written to the session log. */
export interface TavernBeatLog {
  /** ISO-8601 instant the beat finished. */
  readonly at: string
  /** Turn the beat ran as, when the loop had opened one. */
  readonly turn?: number
  /** Player utterance the beat answered; empty for an opening turn. */
  readonly playerInput: string
  /** Calls in execution order. */
  readonly calls: readonly TavernBeatLogCall[]
  /** Beat this one replayed, when it was a regeneration. */
  readonly regeneratedFrom?: string
  /** Hidden plot advancement the director wrote in this beat's first call. */
  readonly inner?: string
  /** Whether any field was cut to the logging bound. */
  readonly truncated?: true
}

/** One call as the orchestrator made it, before bounding. */
export interface BeatLogCallInput {
  readonly role: 'opening' | 'director' | 'character'
  readonly cardId?: string
  readonly name?: string
  readonly model: string
  readonly system: string
  readonly message: string
  readonly reply: string
}

/** Everything one beat knows at logging time, before bounding. */
export interface BeatLogInput {
  readonly at: string
  readonly turn?: number
  readonly playerInput: string
  readonly calls: readonly BeatLogCallInput[]
  readonly regeneratedFrom?: string
  readonly inner?: string
}

/** Cut one field to the logging bound. */
function bounded(text: string): { text: string; truncated: boolean } {
  return text.length <= BEAT_LOG_FIELD_MAX_CHARS
    ? { text, truncated: false }
    : { text: text.slice(0, BEAT_LOG_FIELD_MAX_CHARS), truncated: true }
}

/**
 * Assemble one beat's record, bounding every prompt-sized field.
 * @param input - the beat's calls and identity.
 * @returns the record to append.
 */
export function buildBeatLog(input: BeatLogInput): TavernBeatLog {
  let truncated = false
  const calls: TavernBeatLogCall[] = input.calls.map((call) => {
    const system = bounded(call.system)
    const message = bounded(call.message)
    const reply = bounded(call.reply)
    if (system.truncated || message.truncated || reply.truncated) truncated = true
    return {
      role: call.role,
      ...(call.cardId === undefined ? {} : { cardId: call.cardId }),
      ...(call.name === undefined ? {} : { name: call.name }),
      model: call.model,
      system: system.text,
      message: message.text,
      reply: reply.text,
    }
  })
  const inner = input.inner === undefined ? undefined : bounded(input.inner)
  if (inner?.truncated === true) truncated = true
  return {
    at: input.at,
    ...(input.turn === undefined ? {} : { turn: input.turn }),
    playerInput: bounded(input.playerInput).text,
    calls,
    ...(input.regeneratedFrom === undefined ? {} : { regeneratedFrom: input.regeneratedFrom }),
    ...(inner === undefined ? {} : { inner: inner.text }),
    ...(truncated ? { truncated: true as const } : {}),
  }
}

/** Read a string field, or `undefined` when it is not a string. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Read a non-negative safe integer. */
function index(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/**
 * Parse one stored beat record.
 *
 * The payload comes back from disk, so every field is checked; a malformed
 * record is dropped rather than rendered as a half-empty row.
 * @param value - decoded JSON value.
 * @returns the record, or `undefined` when it cannot be trusted.
 */
export function parseBeatLog(value: unknown): TavernBeatLog | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const at = text(record.at)
  if (at === undefined) return undefined
  const rawCalls = Array.isArray(record.calls) ? record.calls : []
  const calls: TavernBeatLogCall[] = []
  for (const item of rawCalls) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const call = item as Record<string, unknown>
    if (call.role !== 'opening' && call.role !== 'director' && call.role !== 'character') continue
    const model = text(call.model)
    const system = text(call.system)
    const message = text(call.message)
    const reply = text(call.reply)
    if (model === undefined || system === undefined || message === undefined || reply === undefined) continue
    const cardId = text(call.cardId)
    const name = text(call.name)
    calls.push({
      role: call.role,
      model,
      system,
      message,
      reply,
      ...(cardId === undefined ? {} : { cardId }),
      ...(name === undefined ? {} : { name }),
      ...(call.truncated === true ? { truncated: true as const } : {}),
    })
  }
  if (calls.length === 0) return undefined
  const turn = index(record.turn)
  const regeneratedFrom = text(record.regeneratedFrom)
  const inner = text(record.inner)
  return {
    at,
    playerInput: text(record.playerInput) ?? '',
    calls,
    ...(turn === undefined ? {} : { turn }),
    ...(regeneratedFrom === undefined ? {} : { regeneratedFrom }),
    ...(inner === undefined ? {} : { inner }),
    ...(record.truncated === true ? { truncated: true as const } : {}),
  }
}

/**
 * One-line account of a beat, for the collapsed row.
 * @param log - stored beat record.
 * @returns a short label naming the turn and who spoke.
 */
export function summarizeBeatLog(log: TavernBeatLog): string {
  const where = log.turn === undefined ? '' : `第 ${log.turn} 轮 · `
  if (log.calls.some(call => call.role === 'opening')) return `${where}开场脚本`
  const speakers = log.calls.filter(call => call.role === 'character')
    .map(call => call.name ?? call.cardId ?? '角色')
  const who = speakers.length === 0 ? '无角色开口' : speakers.join('、')
  return `${where}导演 + ${who}`
}

/**
 * Render one beat's prompts as a readable document.
 *
 * Order matters: the director decides what happens, so its calls are shown
 * first, then each character call in the order it ran.
 * @param log - stored beat record.
 * @returns Markdown-style text for the record's detail pane.
 */
export function renderBeatLogText(log: TavernBeatLog): string {
  const sections: string[] = [
    `${summarizeBeatLog(log)}${log.regeneratedFrom === undefined ? '' : '（重新生成）'}`,
    `时间：${log.at}`,
    `玩家输入：${log.playerInput.length === 0 ? '（无）' : log.playerInput}`,
  ]
  if (log.truncated === true) {
    sections.push('（部分字段超过日志上限，已截断；完整内容见本幕的 beat 文件）')
  }
  let step = 0
  for (const call of log.calls) {
    step += 1
    const title = call.role === 'opening'
      ? `开场编剧 · 调用 ${step}`
      : call.role === 'director'
        ? `导演 · 调用 ${step}`
        : `角色 · ${call.name ?? call.cardId ?? '未知'} · 调用 ${step}`
    sections.push(
      '',
      `## ${title}`,
      `模型：${call.model}`,
      ...call.truncated === true ? ['（本调用有字段被截断）'] : [],
      '',
      '### system',
      call.system,
      '',
      '### user',
      call.message,
      '',
      '### 回复',
      call.reply,
    )
  }
  // The director's private ledger goes last: the row preview shows the head of
  // this text, and the beat's identity is more useful there than plot notes.
  if (log.inner !== undefined && log.inner.length > 0) sections.push('', '## 导演私记', log.inner)
  return sections.join('\n')
}
