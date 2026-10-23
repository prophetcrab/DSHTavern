/**
 * System prompt assembly order.
 *
 * The tavern prompt orchestrator exposes a fixed catalogue of system-prompt
 * blocks and lets the user drag them into the assembly order. Order and the
 * enabled flag persist per workspace under `prompts/prompt.json`; block
 * catalogues and defaults stay in code so the file only stores the delta.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Layout file schema version this build reads and writes.
 *
 * Version 2 added the `lore-tail`, `character-stage`, and `character-duty`
 * character blocks. A version-1 file lists only the original catalogue, so
 * reading one fills the new blocks in at their catalogue positions; a version-2
 * file is not readable by a version-1 build, which rejects unknown ids.
 */
export const PROMPT_LAYOUT_SCHEMA = 2

/** Workspace directory owning prompt files. */
export const PROMPT_DIRECTORY = 'prompts'

/** Layout file name inside {@link PROMPT_DIRECTORY}. */
export const PROMPT_LAYOUT_FILE = 'prompt.json'

/** Director-prompt layout file name inside {@link PROMPT_DIRECTORY}. */
export const DIRECTOR_LAYOUT_FILE = 'director.json'

/** Largest layout file accepted; it also stores edited prompt text. */
export const PROMPT_LAYOUT_MAX_BYTES = 512 * 1024

/** Largest editable content per block. */
export const PROMPT_BLOCK_CONTENT_MAX_BYTES = 64 * 1024

/**
 * Which system prompt a block belongs to.
 *
 * `director` blocks compose the game-master prompt, whose runtime inputs are the
 * world state and the cast roster. `character` blocks compose one character's
 * prompt from its own card. The two catalogues are independent: a block in one
 * never appears in the other's layout.
 */
export type PromptScope = 'director' | 'character'

/** Where a system-prompt block's content comes from. */
export type PromptBlockSource =
  | 'template'
  | 'character'
  | 'worldbook'
  | 'persona'
  | 'chat'
  | 'dsh'
  | 'director'
  | 'state'

/** One system-prompt block in the catalogue. */
export interface PromptBlockDefinition {
  /** Stable identifier used by the layout file and the client. */
  readonly id: string
  /** Which prompt this block belongs to. */
  readonly appliesTo: PromptScope
  /** Display name. */
  readonly label: string
  /** Content owner, shown as a badge. */
  readonly source: PromptBlockSource
  /** One-line explanation of what the block contributes. */
  readonly description: string
  /** Whether the user can edit this block's text in the orchestrator. */
  readonly editable: boolean
  /** Text used when the layout carries no override. */
  readonly defaultContent: string
}

/** A persisted block entry: catalogue id, enabled flag, and optional text. */
export interface PromptBlockState {
  readonly id: string
  readonly enabled: boolean
  /** Edited text; omitted while the block still uses {@link PromptBlockDefinition.defaultContent}. */
  readonly content?: string
}

/** One workspace's persisted prompt layout. */
export interface PromptLayout {
  readonly schema: number
  /** Blocks in assembly order. */
  readonly blocks: readonly PromptBlockState[]
  /** ISO-8601 of the last write. */
  readonly updatedAt?: string
}

/** A catalogue entry with the persisted state applied. */
export interface PromptBlockView extends PromptBlockDefinition {
  readonly enabled: boolean
  /** Effective text: the override when present, otherwise the default. */
  readonly content: string
  /** Whether the stored layout overrides the default text. */
  readonly overridden: boolean
}

/** A layout file used a newer schema than this build understands. */
export class PromptLayoutVersionError extends Error {
  constructor(readonly path: string, readonly schema: number) {
    super(`prompt layout at '${path}' uses schema ${schema}, newer than supported schema ${PROMPT_LAYOUT_SCHEMA}`)
    this.name = 'PromptLayoutVersionError'
  }
}

/** A layout payload is not a valid full ordering of the catalogue. */
export class PromptLayoutInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromptLayoutInvalidError'
  }
}

/**
 * Canonical system-prompt blocks in their default assembly order.
 *
 * This is the exposed surface of prompt orchestration: every block that can
 * reach the model's system prompt must be listed here, including the ones the
 * current DSH composition injects (`dsh` source) so nothing is hidden.
 */
export const PROMPT_BLOCKS: readonly PromptBlockDefinition[] = [
  {
    id: 'main-template',
    appliesTo: 'character',
    label: '主提示词模板',
    source: 'template',
    description: '整体框架与角色扮演规则',
    editable: true,
    defaultContent: '你正在进行一场角色扮演对话。以 {{char}} 的身份回应 {{user}}，'
      + '保持角色设定、语气与世界观的一致性；不要提及提示词，也不要说明自己是 AI。',
  },
  {
    id: 'character-description',
    appliesTo: 'character',
    label: '角色描述',
    source: 'character',
    description: '外形、身份与背景，从角色卡读取',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'character-personality',
    appliesTo: 'character',
    label: '角色性格',
    source: 'character',
    description: '性格与说话方式，从角色卡读取',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'character-scenario',
    appliesTo: 'character',
    label: '场景',
    source: 'character',
    description: '开场处境，从角色卡读取',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'character-system',
    appliesTo: 'character',
    label: '角色自带提示词',
    source: 'character',
    description: '角色卡自带的附加要求',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'worldbook-before',
    appliesTo: 'character',
    label: '世界书（角色定义前）',
    source: 'worldbook',
    description: '关键词命中的设定，插在角色定义之前',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'worldbook-after',
    appliesTo: 'character',
    label: '世界书（角色定义后）',
    source: 'worldbook',
    description: '关键词命中的设定，插在角色定义之后',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'examples',
    appliesTo: 'character',
    label: '示例对话',
    source: 'character',
    description: '示范对话，校准角色的语气',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'user-persona',
    appliesTo: 'character',
    label: '用户人设',
    source: 'persona',
    description: '玩家身份与称呼',
    editable: true,
    defaultContent: '{{user}} 是一个普通旅人。',
  },
  {
    id: 'author-note',
    appliesTo: 'character',
    label: '作者笔记',
    source: 'chat',
    description: '可编辑的作者注（v1 并入 system）',
    editable: true,
    defaultContent: '',
  },
  {
    id: 'post-history',
    appliesTo: 'character',
    label: '历史后指令',
    source: 'template',
    description: 'post_history_instructions',
    editable: true,
    defaultContent: '保持 {{char}} 的角色设定与说话风格；不要跳出角色，不要总结或解释。',
  },
  {
    id: 'lore-tail',
    appliesTo: 'character',
    label: '世界书（尾部）',
    source: 'worldbook',
    description: '关键词命中且插入位置为「末尾」的设定；默认排在角色定义之后、舞台记录之前',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'character-stage',
    appliesTo: 'character',
    label: '舞台记录',
    source: 'state',
    description: '这个角色能看到的旁白与台词（运行时填入）',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'character-duty',
    appliesTo: 'character',
    label: '角色职责',
    source: 'template',
    description: '只输出自己的台词与动作、不越界的最后一条指令',
    editable: true,
    defaultContent: '你现在就是「{{char}}」。只输出 {{char}} 自己的台词和这个角色自己的动作与神态。\n'
      + '不要旁白他人，不要替玩家说话，不要描写其他角色的内心，不要跳出角色。\n'
      + '动作与神态用星号包裹，例如：*她把伞往旁边挪了挪*。\n'
      + '动作与台词分成两段：先写动作，空一行，再写台词。不要把动作和台词写在同一行。\n'
      + '用户消息里标【玩家】的是玩家说过的话，标【刚才】的是刚说完的另一个角色，标【旁白】的是现场发生了什么。你回应的是最后那一段——马上接着现场往下演，不要回头重新回答玩家早先那句话。',
  },
  {
    id: 'dsh-runtime',
    appliesTo: 'character',
    label: 'DSH 运行时上下文',
    source: 'dsh',
    description: '执行目录等 harness 注入内容（A 路线只读）',
    editable: false,
    defaultContent: '',
  },
]

/** Stable set of catalogue ids. */
export const PROMPT_BLOCK_IDS: readonly string[] = PROMPT_BLOCKS.map(block => block.id)

/**
 * Director-prompt blocks in their default assembly order.
 *
 * The director runs a different job than a character: it narrates, paces the
 * scene, and picks who speaks. Its catalogue therefore holds no card-sourced
 * blocks; `state` blocks are filled at runtime from the world state and roster,
 * exactly as `character` blocks are filled from the active card.
 */
export const DIRECTOR_BLOCKS: readonly PromptBlockDefinition[] = [
  {
    id: 'director-role',
    appliesTo: 'director',
    label: '导演身份',
    source: 'director',
    description: '主持人的职责定位',
    editable: true,
    defaultContent: '你是这场角色扮演的主持人（GM）。你负责旁白、节奏，以及决定下一个开口的角色。',
  },
  {
    id: 'director-roster',
    appliesTo: 'director',
    label: '人物名册',
    source: 'state',
    description: '在场角色的 id、名字与一句话简介（运行时填入）',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'director-world',
    appliesTo: 'director',
    label: '世界状态',
    source: 'state',
    description: '场景、已确立的事实、尚未揭示的剧情（运行时填入，角色看不到）',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'director-lore',
    appliesTo: 'director',
    label: '导演世界书',
    source: 'worldbook',
    description: '命中关键词且仅导演可见的世界书条目（运行时填入）',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'director-stage',
    appliesTo: 'director',
    label: '舞台记录',
    source: 'state',
    description: '到目前为止的旁白与台词（运行时填入）',
    editable: false,
    defaultContent: '',
  },
  {
    id: 'director-pacing',
    appliesTo: 'director',
    label: '节奏控制',
    source: 'director',
    description: '这一幕怎么推进、什么时候收住',
    editable: true,
    defaultContent: '玩家说完之后，玩家不会马上再开口。你可以在同一幕里连续调度：一个角色说完，'
      + '你可以再给一段旁白，再让另一个角色接话。\n'
      + '这一幕演多长由你判断：一个人答一句就收住，是完整的一幕；几个人来回交锋把话说到位，也是完整的一幕。\n'
      + '同一个人可以在一幕里再次开口——他被打断、被追问，或者刚说的话被别人堵回来，让他接着说是对的。\n'
      + '每一次调度回答的是“紧接着刚才那句话，现场发生了什么、谁最有反应”。\n'
      + '当这一幕自然收住——对峙停住、话说完、气氛沉下来、等玩家表态——就把 nextSpeaker 设为 null，这一幕结束。',
  },
  {
    id: 'director-rules',
    appliesTo: 'director',
    label: '硬性规则',
    source: 'director',
    description: '旁白边界、玩家自主权、角色自主权',
    editable: true,
    defaultContent: [
      '0. 玩家这一轮的输入就是现场事实。它写明了地点、时间、行动或在场者时，你的旁白必须与之一致，绝不另起一个场景。舞台刚开始时，第一段旁白要接着玩家的输入往下写。',
      '1. 旁白只写可以被旁观者看到或听到的内容：环境、事件、他人的反应。绝不写任何角色的内心活动。',
      '2. 绝不替玩家（user）发言、做决定、或描述玩家的动作与感受。玩家永远自己决定自己要做什么。',
      '3. 绝不决定任何角色的选择、台词、心情或动作。角色由各自的角色卡驱动，你只负责把局面摆出来。',
      '4. 你可以推进角色不知道的剧情，但必须写进 inner 字段；它不会给任何角色看到。若这段推进需要在场者可感知，用旁白给它留下可观察的痕迹。',
      '5. 旁白简短克制，一到三句，不抢戏。这是轻小说式的角色扮演，不是小说章节。',
      '6. 选谁开口由场面决定：谁最可能对这个局面有反应，就选谁。不要总是选同一个人。',
      '7. 一幕里让几个人开口，由场面决定：一个人说完就收住是完整的一幕，几个人来回交锋也是完整的一幕。什么时候收住由你判断——场面停了就输出 null，把话头交回玩家。',
    ].join('\n'),
  },
  {
    id: 'director-format',
    appliesTo: 'director',
    label: '输出格式',
    source: 'director',
    description: '导演必须输出的 JSON 结构',
    editable: true,
    defaultContent: '只输出一个 JSON 对象：第一个字符是 {，最后一个字符是 }。\n'
      + '不要代码围栏，不要任何解释，不要在 JSON 前后写任何文字。\n'
      + '{"narration":"给玩家看的旁白，可为空字符串","inner":"只有你知道的剧情推进，可为空字符串","nextSpeaker":"角色 id，或 null"}\n'
      + 'nextSpeaker 必须是名册中的 id。如果这一幕没有任何角色会开口（纯环境描写、沉默、时间流逝），输出 null。',
  },
]

/** Stable set of director catalogue ids. */
export const DIRECTOR_BLOCK_IDS: readonly string[] = DIRECTOR_BLOCKS.map(block => block.id)

/**
 * @param scope - which prompt the caller composes.
 * @returns that scope's catalogue.
 */
export function blocksFor(scope: PromptScope): readonly PromptBlockDefinition[] {
  return scope === 'director' ? DIRECTOR_BLOCKS : PROMPT_BLOCKS
}

/**
 * @param scope - which prompt the caller composes.
 * @returns that scope's catalogue ids.
 */
export function blockIdsFor(scope: PromptScope): readonly string[] {
  return scope === 'director' ? DIRECTOR_BLOCK_IDS : PROMPT_BLOCK_IDS
}

/**
 * @param scope - which prompt the layout orders; defaults to the character prompt.
 * @returns the default layout for that scope: catalogue order, every block enabled.
 */
export function defaultPromptLayout(scope: PromptScope = 'character'): PromptLayout {
  return {
    schema: PROMPT_LAYOUT_SCHEMA,
    blocks: blockIdsFor(scope).map(id => ({ id, enabled: true })),
  }
}

/**
 * @param workspaceDir - tavern workspace root.
 * @param scope - which prompt's layout file to address.
 * @returns the absolute layout file path.
 */
export function promptLayoutPath(workspaceDir: string, scope: PromptScope = 'character'): string {
  return join(workspaceDir, PROMPT_DIRECTORY, scope === 'director' ? DIRECTOR_LAYOUT_FILE : PROMPT_LAYOUT_FILE)
}

/**
 * Apply the persisted enabled flags to a catalogue.
 * @param layout - persisted layout.
 * @param scope - which catalogue to resolve against.
 * @returns catalogue entries in layout order.
 */
export function promptBlockViews(layout: PromptLayout, scope: PromptScope = 'character'): PromptBlockView[] {
  const known = new Map(blocksFor(scope).map(block => [block.id, block]))
  const views: PromptBlockView[] = []
  for (const block of layout.blocks) {
    const definition = known.get(block.id)
    if (definition === undefined) continue
    views.push({
      ...definition,
      enabled: block.enabled,
      content: block.content ?? definition.defaultContent,
      overridden: block.content !== undefined,
    })
  }
  return views
}

/** Placeholder values used when rendering the system prompt. */
export interface PromptRenderVariables {
  /** Character name substituted for `{{char}}`. */
  readonly char?: string
  /** User name substituted for `{{user}}`. */
  readonly user?: string
}

/**
 * Render the enabled, non-empty blocks into the model-facing system prompt.
 *
 * SillyTavern-style `{{char}}` / `{{user}}` placeholders are substituted here,
 * because DSH's own prompt interpolation rejects unknown variables.
 * @param views - effective block views in assembly order.
 * @param variables - names substituted for the placeholders.
 * @returns the joined prompt text; empty when no block contributes.
 */
export function renderPromptText(
  views: readonly PromptBlockView[],
  variables: PromptRenderVariables = {},
): string {
  const char = variables.char ?? '角色'
  const user = variables.user ?? '你'
  return views
    .filter(view => view.enabled)
    .map(view => view.content.trim())
    .filter(text => text.length > 0)
    .map(text => text.replace(/\{\{char\}\}/gi, char).replace(/\{\{user\}\}/gi, user))
    .join('\n\n')
}

/**
 * Fill blocks a stored layout predates, keeping the order the user chose.
 *
 * A stored layout is a full ordering of the catalogue it was written against.
 * When the catalogue grows, the new ids have no slot; inserting each one where
 * it sits in the catalogue default keeps the author's relative order intact
 * and gives the new blocks their enabled default.
 * @param stored - validated blocks from the file, in their stored order.
 * @param scope - catalogue the blocks belong to.
 * @returns a full ordering of the current catalogue.
 */
export function mergeCatalogueBlocks(
  stored: readonly PromptBlockState[],
  scope: PromptScope = 'character',
): PromptBlockState[] {
  const catalogue = blockIdsFor(scope)
  const rank = new Map(catalogue.map((id, index) => [id, index]))
  const merged = stored.map(block => ({ ...block }))
  for (const id of catalogue) {
    if (merged.some(block => block.id === id)) continue
    const position = rank.get(id) ?? 0
    // Insert before the first stored block that follows it in the catalogue, so
    // the author's order survives and the new block lands where the default
    // catalogue puts it.
    const insertAt = merged.findIndex(block => (rank.get(block.id) ?? 0) > position)
    merged.splice(insertAt === -1 ? merged.length : insertAt, 0, { id, enabled: true })
  }
  return merged
}

/**
 * Validate a full, duplicate-free ordering of the catalogue.
 * @param value - candidate block list, however malformed.
 * @param scope - which catalogue the list must be a full ordering of.
 * @returns normalised blocks in the given order.
 * @throws PromptLayoutInvalidError when the list misses, repeats, or invents blocks.
 */
export function normalizePromptBlocks(value: unknown, scope: PromptScope = 'character'): PromptBlockState[] {
  if (!Array.isArray(value)) {
    throw new PromptLayoutInvalidError('prompt blocks must be an array')
  }
  const catalogue = blockIdsFor(scope)
  const known = new Set(catalogue)
  const seen = new Set<string>()
  const blocks: PromptBlockState[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new PromptLayoutInvalidError('every prompt block must be an object')
    }
    const record = entry as Record<string, unknown>
    const id = record.id
    if (typeof id !== 'string' || id.length === 0) {
      throw new PromptLayoutInvalidError('every prompt block needs a string id')
    }
    if (!known.has(id)) throw new PromptLayoutInvalidError(`unknown prompt block '${id}'`)
    if (seen.has(id)) throw new PromptLayoutInvalidError(`duplicate prompt block '${id}'`)
    seen.add(id)
    const enabled = record.enabled
    if (typeof enabled !== 'boolean') {
      throw new PromptLayoutInvalidError(`prompt block '${id}' needs a boolean enabled flag`)
    }
    const content = record.content
    if (content !== undefined && typeof content !== 'string') {
      throw new PromptLayoutInvalidError(`prompt block '${id}' content must be a string`)
    }
    if (typeof content === 'string' && Buffer.byteLength(content, 'utf8') > PROMPT_BLOCK_CONTENT_MAX_BYTES) {
      throw new PromptLayoutInvalidError(`prompt block '${id}' content is too large`)
    }
    blocks.push({ id, enabled, ...(content === undefined ? {} : { content }) })
  }
  const missing = catalogue.filter(id => !seen.has(id))
  if (missing.length > 0) {
    throw new PromptLayoutInvalidError(`prompt layout is missing blocks: ${missing.join(', ')}`)
  }
  return blocks
}

/**
 * Whether a workspace has at least one imported character card.
 * @param workspaceDir - tavern workspace root.
 * @returns `true` when `<workspace>/characters/` holds a `.charc` card.
 */
export async function hasCharacterCards(workspaceDir: string): Promise<boolean> {
  try {
    const entries = await readdir(join(workspaceDir, 'characters'), { withFileTypes: true })
    return entries.some(entry => entry.isFile() && /\.charc$/i.test(entry.name))
  } catch {
    return false
  }
}

/**
 * Map a drag among visible blocks onto the full stored ordering.
 *
 * The character-sourced blocks are hidden until a character card exists, so
 * the list the user drags is a subset; this keeps the hidden blocks in place
 * while moving the visible ones.
 * @param blocks - the full block ordering.
 * @param visible - the subset currently rendered, in display order.
 * @param from - dragged index within `visible`.
 * @param to - target index within `visible`.
 * @returns a full ordering with the visible subset reordered.
 */
export function reorderVisibleBlocks<T extends { readonly id: string }>(
  blocks: readonly T[],
  visible: readonly T[],
  from: number,
  to: number,
): T[] {
  if (from === to || from < 0 || to < 0 || from >= visible.length || to >= visible.length) {
    return [...blocks]
  }
  const visibleIds = new Set(visible.map(block => block.id))
  const indices = blocks.flatMap((block, index) => visibleIds.has(block.id) ? [index] : [])
  const source = indices[from]
  const target = indices[to]
  if (source === undefined || target === undefined) return [...blocks]
  const next = [...blocks]
  const [item] = next.splice(source, 1)
  if (item === undefined) return next
  next.splice(target, 0, item)
  return next
}

/**
 * Read one workspace's layout, falling back to the default when absent.
 * @param workspaceDir - tavern workspace root.
 * @returns the persisted or default layout.
 * @throws PromptLayoutInvalidError when the file is corrupt.
 * @throws PromptLayoutVersionError when the file is newer than this build.
 */
export async function readPromptLayout(workspaceDir: string, scope: PromptScope = 'character'): Promise<PromptLayout> {
  const path = promptLayoutPath(workspaceDir, scope)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isMissing(error)) return defaultPromptLayout(scope)
    throw error
  }
  return parsePromptLayoutText(text, path, scope)
}

/**
 * Synchronous variant used by the prompt text provider, which DSH calls while
 * assembling a request (before any async pre-step hook can run).
 * @param workspaceDir - tavern workspace root.
 * @returns the persisted or default layout.
 */
export function readPromptLayoutSync(workspaceDir: string, scope: PromptScope = 'character'): PromptLayout {
  const path = promptLayoutPath(workspaceDir, scope)
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if (isMissing(error)) return defaultPromptLayout(scope)
    throw error
  }
  return parsePromptLayoutText(text, path, scope)
}

/**
 * Validate one layout document.
 * @param text - raw file content.
 * @param path - file path used in diagnostics.
 * @returns the validated layout.
 */
export function parsePromptLayoutText(text: string, path: string, scope: PromptScope = 'character'): PromptLayout {
  if (text.length > PROMPT_LAYOUT_MAX_BYTES) {
    throw new PromptLayoutInvalidError(`prompt layout at '${path}' is too large`)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new PromptLayoutInvalidError(`prompt layout at '${path}' is not valid JSON`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PromptLayoutInvalidError(`prompt layout at '${path}' must be a JSON object`)
  }
  const record = value as Record<string, unknown>
  // An absent version is the oldest one: only this plugin writes the field, so
  // a file without it is a hand-edit or a layout from before versioning, and
  // both should gain newly added blocks instead of being rejected as incomplete.
  const schema = typeof record.schema === 'number' ? record.schema : 1
  if (schema > PROMPT_LAYOUT_SCHEMA) throw new PromptLayoutVersionError(path, schema)
  const blocks = schema < PROMPT_LAYOUT_SCHEMA
    ? mergeCatalogueBlocks(normalizeLegacyBlocks(record.blocks, scope), scope)
    : normalizePromptBlocks(record.blocks, scope)
  return {
    schema: PROMPT_LAYOUT_SCHEMA,
    blocks,
    ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
  }
}

/**
 * Validate a layout written by an earlier schema.
 *
 * An older file is a full ordering of the catalogue it was written against, so
 * it can only be checked for shape and duplication; the missing blocks are
 * filled in by {@link mergeCatalogueBlocks}.
 * @param value - candidate block list, however malformed.
 * @param scope - which catalogue the list belongs to.
 * @returns the stored entries, in order.
 * @throws PromptLayoutInvalidError when the list repeats or invents blocks.
 */
function normalizeLegacyBlocks(value: unknown, scope: PromptScope): PromptBlockState[] {
  if (!Array.isArray(value)) {
    throw new PromptLayoutInvalidError('prompt blocks must be an array')
  }
  const known = new Set(blockIdsFor(scope))
  const seen = new Set<string>()
  const blocks: PromptBlockState[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new PromptLayoutInvalidError('every prompt block must be an object')
    }
    const record = entry as Record<string, unknown>
    const id = record.id
    if (typeof id !== 'string' || !known.has(id)) {
      throw new PromptLayoutInvalidError(`unknown prompt block '${String(id)}'`)
    }
    if (seen.has(id)) throw new PromptLayoutInvalidError(`duplicate prompt block '${id}'`)
    seen.add(id)
    const content = record.content
    if (content !== undefined && typeof content !== 'string') {
      throw new PromptLayoutInvalidError(`prompt block '${id}' content must be a string`)
    }
    blocks.push({
      id,
      enabled: record.enabled !== false,
      ...(typeof content === 'string' ? { content } : {}),
    })
  }
  return blocks
}

/**
 * Persist one workspace's layout atomically (temporary file then rename).
 * @param workspaceDir - tavern workspace root.
 * @param blocks - a full ordering; validated before writing.
 * @returns the stored layout.
 */
export async function writePromptLayout(
  workspaceDir: string,
  blocks: unknown,
  scope: PromptScope = 'character',
): Promise<PromptLayout> {
  const normalized = normalizePromptBlocks(blocks, scope)
  const catalogue = blocksFor(scope)
  // Keep the file small: a block only stores text when it differs from the
  // catalogue default, so toggling or reordering never bakes defaults in.
  const stored: PromptBlockState[] = normalized.map(block => {
    const definition = catalogue.find(item => item.id === block.id)
    if (block.content === undefined || definition === undefined || block.content === definition.defaultContent) {
      return { id: block.id, enabled: block.enabled }
    }
    return { id: block.id, enabled: block.enabled, content: block.content }
  })
  const directory = join(workspaceDir, PROMPT_DIRECTORY)
  await mkdir(directory, { recursive: true })
  const layout: PromptLayout = {
    schema: PROMPT_LAYOUT_SCHEMA,
    blocks: stored,
    updatedAt: new Date().toISOString(),
  }
  const target = promptLayoutPath(workspaceDir, scope)
  const temporary = `${target}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(layout, null, 2)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  return layout
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
