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

/** One workspace's agent orchestration settings. */
export interface TavernAgentConfig {
  readonly schema: number
  /** Character speeches one player turn may produce. */
  readonly maxSpeechesPerBeat: number
  /** Staged lines every prompt carries. */
  readonly stageWindow: number
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
  /** Route to the character the player names, ahead of the director's pick. */
  readonly honorPlayerMention: boolean
  /** Fallback when the director names someone who is not in the cast. */
  readonly unknownSpeaker: UnknownSpeakerPolicy
  /** Director model; omitted follows the session's model. */
  readonly directorModel?: AgentModelChoice
  /** Character model; omitted follows the session's model. */
  readonly characterModel?: AgentModelChoice
}

/** Inclusive bounds enforced on every field. */
export const AGENT_CONFIG_LIMITS = {
  maxSpeechesPerBeat: { min: 1, max: 6 },
  stageWindow: { min: 4, max: 200 },
  loreScanLines: { min: 4, max: 200 },
  loreMaxEntries: { min: 1, max: 20 },
  loreMaxChars: { min: 200, max: 40_000 },
  playerInputMax: { min: 200, max: 20_000 },
} as const

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
    honorPlayerMention: false,
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
    ...(directorModel === undefined ? {} : { directorModel }),
    ...(characterModel === undefined ? {} : { characterModel }),
  }
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
