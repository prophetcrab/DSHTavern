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
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MAX_SPEECHES_PER_BEAT, PLAYER_INPUT_MAX, STAGE_WINDOW } from './orchestrator.js'
import { STATE_DIRECTORY } from './stage.js'
import { WORLDBOOK_ACTIVE_CHARS_MAX, WORLDBOOK_ACTIVE_MAX, WORLDBOOK_SCAN_LINES } from './worldbook.js'

/** File name inside the tavern state directory. */
export const AGENT_CONFIG_FILE = 'agent.json'

/** Schema version this build reads and writes. */
export const AGENT_CONFIG_SCHEMA = 1

/** One role's model selection; both fields are required together. */
export interface AgentModelChoice {
  /** Registered provider route. */
  readonly provider: string
  /** Model id the route accepts. */
  readonly model: string
  /** Adapter-owned reasoning-effort id; omitted follows the session. */
  readonly reasoningEffort?: string
}

/** What the director's unresolvable speaker reference falls back to. */
export type UnknownSpeakerPolicy = 'none' | 'first'

/**
 * Approximate tokens per Chinese character.
 *
 * DeepSeek's tokenizer spends about 0.6 token per Chinese character, so a
 * character budget is divided by this to get the enforced `maxTokens`. The
 * figure is an approximation on purpose: the panel speaks in characters because
 * that is what an author counts, and the provider's cap is in tokens.
 */
export const TOKENS_PER_CHAR = 0.6

/**
 * Convert a character budget to the token cap handed to the provider.
 * @param chars - budget in characters.
 * @returns the token cap, at least 1.
 */
export function tokensForChars(chars: number): number {
  return Math.max(1, Math.round(chars * TOKENS_PER_CHAR))
}

/** One workspace's agent orchestration settings. */
export interface TavernAgentConfig {
  readonly schema: number
  /** Character speeches one player turn may produce. */
  readonly maxSpeechesPerBeat: number
  /** Staged lines every prompt carries. */
  readonly stageWindow: number
  /**
   * Character cap on the staged transcript every prompt carries.
   *
   * Absent means only {@link stageWindow} bounds it. A line budget alone stops
   * being predictable once it is large enough for long narration lines to add
   * up, so a 1M-context workspace can cap characters instead of guessing how
   * many lines fit.
   */
  readonly stageMaxChars?: number
  /** Recent stage lines the worldbook scan covers. */
  readonly loreScanLines: number
  /** Worldbook entries one request may inject. */
  readonly loreMaxEntries: number
  /** Worldbook characters one request may inject. */
  readonly loreMaxChars: number
  /** Player utterance length forwarded to the model. */
  readonly playerInputMax: number
  /** Tell the director to alternate speakers. */
  readonly rotateSpeakers: boolean
  /**
   * Route to the character the player names, ahead of the director's pick.
   *
   * On by default: the client pre-fills the composer with a speaker's name when
   * the player clicks it in a transcript bubble, and that affordance is only
   * honest if naming someone actually addresses them.
   */
  readonly honorPlayerMention: boolean
  /** Fallback when the director names someone who is not in the cast. */
  readonly unknownSpeaker: UnknownSpeakerPolicy
  /**
   * Reply budget in characters for every call that has no override.
   *
   * Absent means the adapter's own default: the orchestrator sends no
   * `maxTokens`, so the provider applies its model limit.
   */
  readonly maxReplyChars?: number
  /** Director reply budget in characters; overrides {@link maxReplyChars}. */
  readonly directorMaxReplyChars?: number
  /** Per-character reply budgets, keyed by card id; overrides {@link maxReplyChars}. */
  readonly characterMaxReplyChars?: Readonly<Record<string, number>>
  /**
   * Tokens added to a reply cap to leave room for the model's reasoning.
   *
   * The provider's `max_tokens` bounds thinking and answer together, so a cap
   * that only covers the wanted characters leaves a reasoning model with no
   * room to answer at all. Defaults to {@link DEFAULT_REASONING_RESERVE}.
   */
  readonly reasoningReserveTokens?: number
  /** Director model; omitted follows the session's model. */
  readonly directorModel?: AgentModelChoice
  /** Character model; omitted follows the session's model. */
  readonly characterModel?: AgentModelChoice
}

/**
 * Inclusive bounds enforced on every field.
 *
 * Both official models declare a 1,048,576-token window, and DeepSeek's
 * tokenizer spends about 0.6 token per Chinese character, so the whole window
 * holds roughly 1.7M characters. The ceilings below let the largest preset use
 * most of that while leaving room for the system prompt, the card, and the reply.
 */
export const AGENT_CONFIG_LIMITS = {
  maxSpeechesPerBeat: { min: 1, max: 6 },
  stageWindow: { min: 4, max: 20_000 },
  stageMaxChars: { min: 1000, max: 1_200_000 },
  loreScanLines: { min: 4, max: 20_000 },
  loreMaxEntries: { min: 1, max: 200 },
  loreMaxChars: { min: 200, max: 600_000 },
  playerInputMax: { min: 200, max: 400_000 },
  maxReplyChars: { min: 20, max: 8000 },
  reasoningReserveTokens: { min: 0, max: 16_000 },
} as const

/** One context-budget preset: the five budget fields plus an optional character cap. */
export interface ContextPreset {
  readonly label: string
  readonly stageWindow: number
  readonly stageMaxChars?: number
  readonly loreScanLines: number
  readonly loreMaxEntries: number
  readonly loreMaxChars: number
  readonly playerInputMax: number
}

/**
 * Context budget presets, from the shipped defaults to one sized for the full
 * 1M-token window.
 *
 * `full` spends roughly 480k tokens on the stage and 180k on lore at typical
 * line lengths — about two thirds of a 1M window — leaving the balance for the
 * system prompt, the card, and the reply. It carries character caps because a
 * line budget alone stops being predictable once it is this large: a few long
 * narration lines could otherwise reach the window on their own.
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
    stageWindow: 2000, stageMaxChars: 400_000,
    loreScanLines: 500, loreMaxEntries: 200, loreMaxChars: 400_000, playerInputMax: 120_000,
  },
  full: {
    label: '满窗口',
    stageWindow: 8000, stageMaxChars: 800_000,
    loreScanLines: 3000, loreMaxEntries: 200, loreMaxChars: 300_000, playerInputMax: 200_000,
  },
} as const satisfies Record<string, ContextPreset>

/** The optional character cap a preset carries; absent for the small presets. */
function presetStageMaxChars(preset: (typeof CONTEXT_PRESETS)[keyof typeof CONTEXT_PRESETS]): number | undefined {
  return 'stageMaxChars' in preset ? preset.stageMaxChars : undefined
}

/** Which preset, if any, matches a budget; `undefined` when it is a custom mix. */
export function contextPresetOf(config: TavernAgentConfig): keyof typeof CONTEXT_PRESETS | undefined {
  for (const [id, preset] of Object.entries(CONTEXT_PRESETS)) {
    const matches = preset.stageWindow === config.stageWindow
      && presetStageMaxChars(preset) === (config.stageMaxChars ?? undefined)
      && preset.loreScanLines === config.loreScanLines
      && preset.loreMaxEntries === config.loreMaxEntries
      && preset.loreMaxChars === config.loreMaxChars
      && preset.playerInputMax === config.playerInputMax
    if (matches) return id as keyof typeof CONTEXT_PRESETS
  }
  return undefined
}

/**
 * Default reasoning headroom added to a reply cap.
 *
 * Observed on a reasoning model at the highest effort: a 240-token cap came
 * back as 240 output tokens with zero visible text, because thinking consumed
 * the whole allowance. 512 leaves room for a typical reasoning pass and still
 * lets the character budget mean what it says.
 */
export const DEFAULT_REASONING_RESERVE = 512

/** A stored config is structurally invalid. */
export class AgentConfigInvalidError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message)
    this.name = 'AgentConfigInvalidError'
  }
}

/** @param workspaceDir - tavern workspace root. @returns the config file path. */
export function agentConfigPath(workspaceDir: string): string {
  return join(workspaceDir, STATE_DIRECTORY, AGENT_CONFIG_FILE)
}

/** @returns the config every workspace starts from. */
export function defaultAgentConfig(): TavernAgentConfig {
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
  }
}

function integerIn(value: unknown, field: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new AgentConfigInvalidError(`${field} 必须是 ${min}–${max} 的整数`)
  }
  return value
}

function booleanOr(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') throw new AgentConfigInvalidError(`${field} 必须是布尔值`)
  return value
}

function modelChoice(value: unknown, field: string): AgentModelChoice | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentConfigInvalidError(`${field} 必须是对象`)
  }
  const record = value as Record<string, unknown>
  const provider = typeof record.provider === 'string' ? record.provider.trim() : ''
  const model = typeof record.model === 'string' ? record.model.trim() : ''
  // A half-filled choice would silently fall back mid-beat; reject it instead.
  if (provider.length === 0 && model.length === 0) return undefined
  if (provider.length === 0 || model.length === 0) {
    throw new AgentConfigInvalidError(`${field} 需要同时填写 provider 与 model`)
  }
  const effort = typeof record.reasoningEffort === 'string' ? record.reasoningEffort.trim() : ''
  return {
    provider,
    model,
    ...(effort.length === 0 ? {} : { reasoningEffort: effort }),
  }
}

function optionalIntegerIn(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined
  return integerIn(value, field, min, max, min)
}

/** Validate the per-character reply-budget map. */
function replyBudgetMap(value: unknown): Readonly<Record<string, number>> | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentConfigInvalidError('角色回复长度必须是「角色卡 id → 字数」的对象')
  }
  const { min, max } = AGENT_CONFIG_LIMITS.maxReplyChars
  const entries: [string, number][] = []
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (id.trim().length === 0) continue
    entries.push([id, integerIn(raw, `角色 ${id} 的回复长度`, min, max, min)])
  }
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

/**
 * Validate one config payload, filling absent fields from the defaults.
 * @param value - candidate config, however malformed.
 * @returns the normalised config.
 * @throws AgentConfigInvalidError when a present field is invalid.
 */
export function normalizeAgentConfig(value: unknown): TavernAgentConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AgentConfigInvalidError('Agent 编排配置必须是对象')
  }
  const record = value as Record<string, unknown>
  if (typeof record.schema === 'number' && record.schema > AGENT_CONFIG_SCHEMA) {
    throw new AgentConfigInvalidError(`Agent 编排配置 schema ${String(record.schema)} 高于支持版本`)
  }
  const defaults = defaultAgentConfig()
  const unknownSpeaker = record.unknownSpeaker
  if (unknownSpeaker !== undefined && unknownSpeaker !== 'none' && unknownSpeaker !== 'first') {
    throw new AgentConfigInvalidError('说话人无法解析时只能是 none 或 first')
  }
  const directorModel = modelChoice(record.directorModel, '导演模型')
  const characterModel = modelChoice(record.characterModel, '角色模型')
  const { min: replyMin, max: replyMax } = AGENT_CONFIG_LIMITS.maxReplyChars
  const maxReplyChars = optionalIntegerIn(record.maxReplyChars, '统一回复长度', replyMin, replyMax)
  const directorMaxReplyChars = optionalIntegerIn(record.directorMaxReplyChars, '导演回复长度', replyMin, replyMax)
  const characterMaxReplyChars = replyBudgetMap(record.characterMaxReplyChars)
  const reasoningReserveTokens = optionalIntegerIn(record.reasoningReserveTokens, '推理预留 token',
    AGENT_CONFIG_LIMITS.reasoningReserveTokens.min, AGENT_CONFIG_LIMITS.reasoningReserveTokens.max)
  const stageMaxChars = optionalIntegerIn(record.stageMaxChars, '角色可见舞台字数上限',
    AGENT_CONFIG_LIMITS.stageMaxChars.min, AGENT_CONFIG_LIMITS.stageMaxChars.max)
  return {
    schema: AGENT_CONFIG_SCHEMA,
    maxSpeechesPerBeat: integerIn(record.maxSpeechesPerBeat, '每幕最多发言角色数',
      AGENT_CONFIG_LIMITS.maxSpeechesPerBeat.min, AGENT_CONFIG_LIMITS.maxSpeechesPerBeat.max,
      defaults.maxSpeechesPerBeat),
    stageWindow: integerIn(record.stageWindow, '角色可见舞台行数',
      AGENT_CONFIG_LIMITS.stageWindow.min, AGENT_CONFIG_LIMITS.stageWindow.max, defaults.stageWindow),
    loreScanLines: integerIn(record.loreScanLines, '世界书扫描行数',
      AGENT_CONFIG_LIMITS.loreScanLines.min, AGENT_CONFIG_LIMITS.loreScanLines.max, defaults.loreScanLines),
    loreMaxEntries: integerIn(record.loreMaxEntries, '世界书最多条数',
      AGENT_CONFIG_LIMITS.loreMaxEntries.min, AGENT_CONFIG_LIMITS.loreMaxEntries.max, defaults.loreMaxEntries),
    loreMaxChars: integerIn(record.loreMaxChars, '世界书最多字数',
      AGENT_CONFIG_LIMITS.loreMaxChars.min, AGENT_CONFIG_LIMITS.loreMaxChars.max, defaults.loreMaxChars),
    playerInputMax: integerIn(record.playerInputMax, '玩家输入上限',
      AGENT_CONFIG_LIMITS.playerInputMax.min, AGENT_CONFIG_LIMITS.playerInputMax.max, defaults.playerInputMax),
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
  }
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
export function replyBudgetChars(
  config: TavernAgentConfig,
  role: 'director' | 'character',
  cardId?: string,
): number | undefined {
  if (role === 'director') return config.directorMaxReplyChars ?? config.maxReplyChars
  return (cardId === undefined ? undefined : config.characterMaxReplyChars?.[cardId]) ?? config.maxReplyChars
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
export function replyCapTokens(chars: number, reserveTokens: number | undefined): number {
  return tokensForChars(chars) + (reserveTokens ?? DEFAULT_REASONING_RESERVE)
}

/**
 * Read one workspace's config.
 * @param workspaceDir - tavern workspace root.
 * @returns the stored config, or the defaults when absent.
 * @throws AgentConfigInvalidError when the file is unusable.
 */
export async function readAgentConfig(workspaceDir: string): Promise<TavernAgentConfig> {
  let text: string
  try {
    text = await readFile(agentConfigPath(workspaceDir), 'utf8')
  } catch (error) {
    if (isMissing(error)) return defaultAgentConfig()
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new AgentConfigInvalidError('Agent 编排配置不是合法 JSON', agentConfigPath(workspaceDir))
  }
  try {
    return normalizeAgentConfig(value)
  } catch (error) {
    if (error instanceof AgentConfigInvalidError && error.path === undefined) {
      throw new AgentConfigInvalidError(error.message, agentConfigPath(workspaceDir))
    }
    throw error
  }
}

/**
 * Persist one workspace's config atomically (temporary file then rename).
 * @param workspaceDir - tavern workspace root.
 * @param value - full config payload, validated before writing.
 * @returns the stored config.
 */
export async function writeAgentConfig(workspaceDir: string, value: unknown): Promise<TavernAgentConfig> {
  const config = normalizeAgentConfig(value)
  const directory = join(workspaceDir, STATE_DIRECTORY)
  await mkdir(directory, { recursive: true })
  const target = agentConfigPath(workspaceDir)
  const temporary = `${target}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  return config
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
