/**
 * Agent orchestration panel for the tavern toolbox.
 *
 * Prompt orchestration decides what a model reads; this panel decides how a
 * beat runs: how many characters may speak, how much history and lore each call
 * carries, whether speakers rotate, who answers when the director's pick cannot
 * be resolved, and which model each role uses.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { fetchCharacterCards } from './characters.js'
import { CLASS } from './styles.js'
import { SubTabPane, SubTabs } from './sub-tabs.js'

/** Per-role model selection; both fields are present together. */
export interface AgentModelChoiceView {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** One workspace's agent orchestration settings. */
export interface AgentConfigView {
  readonly schema: number
  readonly maxSpeechesPerBeat: number
  readonly stageWindow: number
  readonly loreScanLines: number
  readonly loreMaxEntries: number
  readonly loreMaxChars: number
  readonly playerInputMax: number
  readonly rotateSpeakers: boolean
  readonly honorPlayerMention: boolean
  readonly unknownSpeaker: 'none' | 'first'
  /** Reply budget shared by every call; absent means no cap. */
  readonly maxReplyChars?: number
  /** Director reply budget; overrides the shared one. */
  readonly directorMaxReplyChars?: number
  /** Per-character reply budgets keyed by card id; overrides the shared one. */
  readonly characterMaxReplyChars?: Readonly<Record<string, number>>
  /** Character cap on the staged transcript; absent means only the line budget applies. */
  readonly stageMaxChars?: number
  /** Tokens added to the cap so the model can think without eating the whole reply. */
  readonly reasoningReserveTokens?: number
  readonly directorModel?: AgentModelChoiceView
  readonly characterModel?: AgentModelChoiceView
}

/** One provider route and its models, as served by `/tavern/models`. */
export interface ModelCatalogEntry {
  readonly provider: string
  readonly name: string
  readonly models: readonly { readonly id: string; readonly name: string }[]
}

/** The response of `/tavern/agent`. */
interface AgentConfigSnapshot {
  readonly config: AgentConfigView
  readonly defaults: AgentConfigView
  readonly status: 'stored' | 'default'
}

/** Inclusive bounds, mirrored from the host so the inputs can clamp in place. */
export const AGENT_LIMITS = {
  maxSpeechesPerBeat: { min: 1, max: 6, step: 1, unit: '个角色' },
  stageWindow: { min: 4, max: 2000, step: 10, unit: '行' },
  stageMaxChars: { min: 1000, max: 400_000, step: 1000, unit: '字' },
  loreScanLines: { min: 4, max: 2000, step: 10, unit: '行' },
  loreMaxEntries: { min: 1, max: 200, step: 1, unit: '条' },
  loreMaxChars: { min: 200, max: 400_000, step: 1000, unit: '字' },
  playerInputMax: { min: 200, max: 120_000, step: 1000, unit: '字' },
  maxReplyChars: { min: 20, max: 8000, step: 20, unit: '字' },
  reasoningReserveTokens: { min: 0, max: 16_000, step: 64, unit: 'token' },
} as const

type NumericField = keyof typeof AGENT_LIMITS

/** Numeric fields that are always present in the config (the reply budgets are optional). */
type RequiredNumericField = Exclude<NumericField, 'maxReplyChars' | 'reasoningReserveTokens' | 'stageMaxChars'>

/**
 * Context budget presets, mirrored from the host.
 *
 * The shipped defaults were sized for a small window; `full` is sized for the
 * 1,048,576-token window both official models declare, leaving room for the
 * system prompt, the card, and the reply.
 */
export const CONTEXT_PRESETS = {
  compact: { label: '精简', stageWindow: 40, loreScanLines: 20, loreMaxEntries: 8, loreMaxChars: 6000, playerInputMax: 8000 },
  standard: { label: '标准', stageWindow: 200, loreScanLines: 60, loreMaxEntries: 24, loreMaxChars: 40_000, playerInputMax: 20_000 },
  roomy: { label: '充裕', stageWindow: 800, loreScanLines: 200, loreMaxEntries: 80, loreMaxChars: 160_000, playerInputMax: 60_000 },
  extreme: {
    label: '极限', stageWindow: 2000, stageMaxChars: 400_000,
    loreScanLines: 500, loreMaxEntries: 200, loreMaxChars: 400_000, playerInputMax: 120_000,
  },
  full: {
    label: '满窗口', stageWindow: 8000, stageMaxChars: 800_000,
    loreScanLines: 3000, loreMaxEntries: 200, loreMaxChars: 300_000, playerInputMax: 200_000,
  },
} as const

type ContextPresetId = keyof typeof CONTEXT_PRESETS

/** The optional character cap a preset carries; absent for the small presets. */
function presetStageMaxChars(preset: (typeof CONTEXT_PRESETS)[ContextPresetId]): number | undefined {
  return 'stageMaxChars' in preset ? preset.stageMaxChars : undefined
}

/**
 * Which preset a config currently matches.
 * @param config - current settings.
 * @returns the preset id, or `undefined` for a custom mix.
 */
export function contextPresetOf(config: AgentConfigView): ContextPresetId | undefined {
  for (const [id, preset] of Object.entries(CONTEXT_PRESETS)) {
    const matches = preset.stageWindow === config.stageWindow
      && presetStageMaxChars(preset) === (config.stageMaxChars ?? undefined)
      && preset.loreScanLines === config.loreScanLines
      && preset.loreMaxEntries === config.loreMaxEntries
      && preset.loreMaxChars === config.loreMaxChars
      && preset.playerInputMax === config.playerInputMax
    if (matches) return id as ContextPresetId
  }
  return undefined
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`酒馆接口不可用（HTTP ${response.status}）`)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('酒馆接口返回了非对象 JSON')
  }
  const record = body as Record<string, unknown>
  if (record.ok !== true) {
    throw new Error(typeof record.error === 'string' ? record.error : `酒馆请求失败（HTTP ${response.status}）`)
  }
  return record
}

/** Read one workspace's agent settings. */
export async function fetchAgentConfig(workspaceId: string): Promise<AgentConfigSnapshot> {
  const response = await fetch(`/tavern/agent?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  return (await readJson(response)) as unknown as AgentConfigSnapshot
}

/** Persist one workspace's agent settings, or reset them to the defaults. */
export async function saveAgentConfig(
  workspaceId: string,
  body: { config: AgentConfigView } | { reset: true },
): Promise<AgentConfigSnapshot> {
  const response = await fetch('/tavern/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ workspaceId, ...body }),
  })
  return (await readJson(response)) as unknown as AgentConfigSnapshot
}

/** Read the provider/model catalog for the model pickers. */
export async function fetchModelCatalog(): Promise<readonly ModelCatalogEntry[]> {
  const response = await fetch('/tavern/models', {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await readJson(response)
  return Array.isArray(body.providers) ? body.providers as ModelCatalogEntry[] : []
}

/** Props of one numeric field row. */
interface NumberRowProps {
  readonly label: string
  readonly hint: string
  readonly field: NumericField
  readonly value: number
  readonly defaultValue: number
  readonly disabled: boolean
  readonly onChange: (value: number) => void
}

/** One labelled number input with its bounds made visible. */
function NumberRow(props: NumberRowProps): ReactElement {
  const bounds = AGENT_LIMITS[props.field]
  const changed = props.value !== props.defaultValue
  return createElement('label', { className: 'dshtavern-agent-row' },
    createElement('span', { className: 'dshtavern-agent-row-text' },
      createElement('span', { className: 'dshtavern-agent-label' },
        props.label,
        changed ? createElement('span', { className: 'dshtavern-agent-changed' }, '·已改') : null),
      createElement('span', { className: 'dshtavern-agent-hint' }, props.hint)),
    createElement('span', { className: 'dshtavern-agent-input-wrap' },
      createElement('input', {
        className: 'dshtavern-agent-input',
        type: 'number',
        min: bounds.min,
        max: bounds.max,
        step: bounds.step,
        value: String(props.value),
        disabled: props.disabled,
        onChange: (event: { target: { value: string } }) => {
          const parsed = Number(event.target.value)
          if (!Number.isFinite(parsed)) return
          props.onChange(Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed))))
        },
      }),
      createElement('span', { className: 'dshtavern-agent-unit' }, bounds.unit),
      createElement('span', { className: 'dshtavern-agent-range' }, `${bounds.min}–${bounds.max}`)))
}

/** Props of one switch row. */
interface ToggleRowProps {
  readonly label: string
  readonly hint: string
  readonly checked: boolean
  readonly disabled: boolean
  readonly onChange: (value: boolean) => void
}

/** One labelled switch. */
function ToggleRow(props: ToggleRowProps): ReactElement {
  return createElement('label', { className: 'dshtavern-agent-row dshtavern-agent-row-toggle' },
    createElement('span', { className: 'dshtavern-agent-row-text' },
      createElement('span', { className: 'dshtavern-agent-label' }, props.label),
      createElement('span', { className: 'dshtavern-agent-hint' }, props.hint)),
    createElement('span', { className: 'dshtavern-switch' },
      createElement('input', {
        type: 'checkbox',
        checked: props.checked,
        disabled: props.disabled,
        onChange: () => props.onChange(!props.checked),
      }),
      createElement('span', { className: 'dshtavern-switch-track', 'aria-hidden': true },
        createElement('span', { className: 'dshtavern-switch-thumb' }))))
}

/** Props of one role's model picker. */
interface ModelPickerProps {
  readonly label: string
  readonly hint: string
  readonly choice: AgentModelChoiceView | undefined
  readonly catalog: readonly ModelCatalogEntry[]
  readonly disabled: boolean
  readonly onChange: (choice: AgentModelChoiceView | undefined) => void
}

/**
 * Pick the provider and model one role uses.
 *
 * An unset choice means "follow the session", which is the pre-existing
 * behaviour; the picker keeps that as an explicit option rather than silently
 * pre-filling the session's current route.
 */
function ModelPicker(props: ModelPickerProps): ReactElement {
  const providers = props.catalog
  const selected = providers.find(entry => entry.provider === props.choice?.provider)
  const models = selected?.models ?? []
  return createElement('div', { className: 'dshtavern-agent-model' },
    createElement('div', { className: 'dshtavern-agent-row-text' },
      createElement('span', { className: 'dshtavern-agent-label' }, props.label),
      createElement('span', { className: 'dshtavern-agent-hint' }, props.hint)),
    createElement('div', { className: 'dshtavern-agent-model-line' },
      createElement('select', {
        className: 'dshtavern-agent-select',
        value: props.choice?.provider ?? '',
        disabled: props.disabled || providers.length === 0,
        onChange: (event: { target: { value: string } }) => {
          const provider = event.target.value
          if (provider.length === 0) {
            props.onChange(undefined)
            return
          }
          const first = providers.find(entry => entry.provider === provider)?.models[0]
          props.onChange(first === undefined
            ? undefined
            : { provider, model: first.id })
        },
      },
      createElement('option', { value: '' }, providers.length === 0 ? '（无可用供应商）' : '跟随会话'),
      providers.map(entry => createElement('option', { key: entry.provider, value: entry.provider }, entry.name))),
      createElement('select', {
        className: 'dshtavern-agent-select',
        value: props.choice?.model ?? '',
        disabled: props.disabled || props.choice === undefined || models.length === 0,
        onChange: (event: { target: { value: string } }) => {
          if (props.choice === undefined) return
          const model = event.target.value
          if (model.length === 0) {
            props.onChange(undefined)
            return
          }
          props.onChange({
            provider: props.choice.provider,
            model,
            ...(props.choice.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: props.choice.reasoningEffort }),
          })
        },
      },
      props.choice === undefined
        ? createElement('option', { value: '' }, '—')
        : models.length === 0
          ? createElement('option', { value: '' }, props.choice.model)
          : models.map(model => createElement('option', { key: model.id, value: model.id }, model.name)))),
    props.choice === undefined
      ? null
      : createElement('div', { className: 'dshtavern-agent-model-line' },
        createElement('span', { className: 'dshtavern-agent-hint' }, '推理等级'),
        createElement('input', {
          className: 'dshtavern-agent-input dshtavern-agent-effort',
          value: props.choice.reasoningEffort ?? '',
          placeholder: '留空跟随会话',
          disabled: props.disabled,
          onChange: (event: { target: { value: string } }) => {
            const effort = event.target.value.trim()
            props.onChange({
              provider: props.choice!.provider,
              model: props.choice!.model,
              ...(effort.length === 0 ? {} : { reasoningEffort: effort }),
            })
          },
        })))
}

/** Which sub-page the panel shows. */
export type AgentTab = 'beat' | 'context' | 'models' | 'reply'

/** One sub-page of the panel: a title, a one-line purpose, and its fields. */
export interface AgentTabSpec {
  readonly id: AgentTab
  readonly label: string
  readonly hint: string
  readonly fields: readonly (keyof AgentConfigView)[]
}

/**
 * The panel's sub-pages.
 *
 * Every setting belongs to exactly one page, so the strip doubles as a table of
 * contents and a reader never scrolls past settings they did not open it for.
 * `fields` drives the unsaved-edit dot on each tab.
 */
export const AGENT_TABS: readonly AgentTabSpec[] = [
  {
    id: 'beat',
    label: '这一幕',
    hint: '一次玩家输入里，谁开口、说多久',
    fields: ['maxSpeechesPerBeat', 'rotateSpeakers', 'honorPlayerMention', 'unknownSpeaker'],
  },
  {
    id: 'context',
    label: '上下文',
    hint: '每次模型调用带多少历史与设定',
    fields: ['stageWindow', 'stageMaxChars', 'loreScanLines', 'loreMaxEntries', 'loreMaxChars', 'playerInputMax'],
  },
  {
    id: 'models',
    label: '模型',
    hint: '导演与角色各用哪个模型',
    fields: ['directorModel', 'characterModel'],
  },
  {
    id: 'reply',
    label: '回复长度',
    hint: '每次回复的字数上限',
    fields: ['maxReplyChars', 'directorMaxReplyChars', 'characterMaxReplyChars', 'reasoningReserveTokens'],
  },
]

/**
 * Order-independent serialization for settings comparison.
 *
 * `characterMaxReplyChars` is a record, so plain `JSON.stringify` would report
 * an edit whenever the same entries come back in a different key order.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => canonical(item)).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return value === undefined ? 'null' : JSON.stringify(value)
}

/**
 * Whether two settings are equivalent.
 * @param left - one config.
 * @param right - the other config.
 * @returns whether every setting matches, ignoring record key order.
 */
export function agentConfigEqual(left: AgentConfigView, right: AgentConfigView): boolean {
  return canonical(left) === canonical(right)
}

/**
 * Whether one sub-page holds edits that are not persisted yet.
 * @param config - the edited config.
 * @param saved - the last persisted config.
 * @param fields - the sub-page's fields.
 * @returns whether any of those fields differ from the persisted value.
 */
export function agentTabChanged(
  config: AgentConfigView,
  saved: AgentConfigView,
  fields: readonly (keyof AgentConfigView)[],
): boolean {
  return fields.some(field => canonical(config[field]) !== canonical(saved[field]))
}

/** Props of the agent orchestration panel. */
export interface AgentPanelProps {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
}

/**
 * Edit one workspace's agent orchestration settings.
 * @param props - the workspace the toolbox opened for.
 * @returns the settings panel.
 */
export function AgentPanel(props: AgentPanelProps): ReactElement {
  const [config, setConfig] = useState<AgentConfigView | null>(null)
  /** Last persisted config; `config` differing from this means unsaved edits. */
  const [saved, setSaved] = useState<AgentConfigView | null>(null)
  const [defaults, setDefaults] = useState<AgentConfigView | null>(null)
  const [catalog, setCatalog] = useState<readonly ModelCatalogEntry[]>([])
  /** Cards in this workspace, for the per-character reply budgets. */
  const [characters, setCharacters] = useState<readonly { id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AgentTab>('beat')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [snapshot, providers, cards] = await Promise.all([
        fetchAgentConfig(props.workspaceId),
        fetchModelCatalog().catch(() => [] as readonly ModelCatalogEntry[]),
        fetchCharacterCards(props.workspaceId).catch(() => []),
      ])
      setConfig(snapshot.config)
      setSaved(snapshot.config)
      setDefaults(snapshot.defaults)
      setCatalog(providers)
      setCharacters(cards.map(card => ({ id: card.id, name: card.name })))
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [props.workspaceId])

  useEffect(() => { void load() }, [load])

  const persist = useCallback(async (next: AgentConfigView, reset = false) => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const snapshot = await saveAgentConfig(props.workspaceId, reset ? { reset: true } : { config: next })
      setConfig(snapshot.config)
      setSaved(snapshot.config)
      setDefaults(snapshot.defaults)
      setNotice(reset ? '已恢复默认' : '已保存')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
    }
  }, [props.workspaceId])

  const update = useCallback((patch: Partial<AgentConfigView>) => {
    setConfig(current => current === null ? null : { ...current, ...patch })
  }, [])

  if (loading) {
    return createElement('section', { className: 'dshtavern-agent' },
      createElement('div', { className: CLASS.hint, style: { padding: '10px 2px' } }, '读取 Agent 编排…'))
  }
  if (config === null || defaults === null || saved === null) {
    return createElement('section', { className: 'dshtavern-agent' },
      createElement('div', { className: CLASS.bannerError }, error ?? '无法读取 Agent 编排'),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        onClick: () => { void load() },
      }, '重试'))
  }

  const dirty = !agentConfigEqual(config, saved)
  const differsFromDefault = !agentConfigEqual(config, defaults)
  const disabled = saving
  // Only the always-present numeric fields go through this helper; the
  // optional reply budgets have their own row with a clearable empty state.
  const num = (field: RequiredNumericField, label: string, hint: string): ReactElement =>
    createElement(NumberRow, {
      key: field,
      field,
      label,
      hint,
      value: config[field],
      defaultValue: saved[field],
      disabled,
      onChange: value => update({ [field]: value } as Partial<AgentConfigView>),
    })
  const activePreset = contextPresetOf(config)

  const beatPane = createElement(SubTabPane, null,
    createElement('div', { className: 'dshtavern-agent-group' },
      createElement('div', { className: 'dshtavern-agent-group-note' },
        '一次玩家输入算一幕。这里决定这一幕里谁开口，以及话头什么时候交回玩家。'),
      num('maxSpeechesPerBeat', '每幕最多发言角色数',
        '一次玩家输入最多让几个角色开口；到上限就把话头交回玩家。'),
      createElement(ToggleRow, {
        label: '轮换发言',
        hint: '提示导演避免让同一个角色连着说；关掉后导演可自行决定。',
        checked: config.rotateSpeakers,
        disabled,
        onChange: value => update({ rotateSpeakers: value }),
      }),
      createElement(ToggleRow, {
        label: '玩家点名优先',
        hint: '玩家在输入里直接叫了某个角色的名字时，由该角色回应，优先于导演的选择。',
        checked: config.honorPlayerMention,
        disabled,
        onChange: value => update({ honorPlayerMention: value }),
      }),
      createElement('label', { className: 'dshtavern-agent-row' },
        createElement('span', { className: 'dshtavern-agent-row-text' },
          createElement('span', { className: 'dshtavern-agent-label' }, '说话人无法解析时'),
          createElement('span', { className: 'dshtavern-agent-hint' },
            '导演给的名字不在名册里时：直接结束这一幕，或让第一个角色接话。')),
        createElement('select', {
          className: 'dshtavern-agent-select dshtavern-agent-select-inline',
          value: config.unknownSpeaker,
          disabled,
          onChange: (event: { target: { value: string } }) =>
            update({ unknownSpeaker: event.target.value === 'first' ? 'first' : 'none' }),
        },
        createElement('option', { value: 'none' }, '结束这一幕'),
        createElement('option', { value: 'first' }, '第一个角色顶替')))))

  const contextPane = createElement(SubTabPane, null,
    createElement('div', { className: 'dshtavern-agent-group' },
      createElement('div', { className: 'dshtavern-agent-group-note' },
        '这些值决定每次模型调用带上多少历史与设定。调大更连贯，也更费 token。'),
      createElement('div', { className: 'dshtavern-agent-quick' },
        createElement('span', { className: 'dshtavern-agent-hint' }, '一键预设：'),
        (Object.entries(CONTEXT_PRESETS) as [ContextPresetId, typeof CONTEXT_PRESETS[ContextPresetId]][]).map(([id, preset]) =>
          createElement('button', {
            key: id,
            type: 'button',
            className: 'dshtavern-button dshtavern-agent-quick-button',
            'data-active': activePreset === id ? 'true' : 'false',
            disabled,
            title: `${preset.stageWindow} 行 / 扫描 ${preset.loreScanLines} 行 / 世界书 ${preset.loreMaxEntries} 条 ${preset.loreMaxChars} 字`,
            onClick: () => update({
              stageWindow: preset.stageWindow,
              stageMaxChars: presetStageMaxChars(preset),
              loreScanLines: preset.loreScanLines,
              loreMaxEntries: preset.loreMaxEntries,
              loreMaxChars: preset.loreMaxChars,
              playerInputMax: preset.playerInputMax,
            }),
          }, preset.label)),
        activePreset === undefined
          ? createElement('span', { className: 'dshtavern-agent-hint' }, '（自定义）')
          : null),
      num('stageWindow', '角色可见舞台行数', '每个角色能看到最近多少条旁白与台词。'),
      num('loreScanLines', '世界书扫描行数', '关键词匹配回溯多少条舞台记录。'),
      num('loreMaxEntries', '世界书最多条数', '单次请求最多注入多少条命中条目。'),
      num('loreMaxChars', '世界书最多字数', '单次请求注入条目内容的总字数上限。'),
      num('playerInputMax', '玩家输入上限', '超过这个长度的玩家输入会被截断。'),
      createElement('label', { className: 'dshtavern-agent-row' },
        createElement('span', { className: 'dshtavern-agent-row-text' },
          createElement('span', { className: 'dshtavern-agent-label' }, '舞台字数上限'),
          createElement('span', { className: 'dshtavern-agent-hint' },
            '可选。行数很大时用它兜住总字数，超出时从最旧的记录开始丢弃；留空只按行数裁剪。')),
        createElement('span', { className: 'dshtavern-agent-input-wrap' },
          createElement('input', {
            className: 'dshtavern-agent-input',
            type: 'number',
            min: AGENT_LIMITS.stageMaxChars.min,
            max: AGENT_LIMITS.stageMaxChars.max,
            step: AGENT_LIMITS.stageMaxChars.step,
            placeholder: '不限',
            value: config.stageMaxChars === undefined ? '' : String(config.stageMaxChars),
            disabled,
            onChange: (event: { target: { value: string } }) => {
              const raw = event.target.value.trim()
              if (raw.length === 0) {
                update({ stageMaxChars: undefined })
                return
              }
              const parsed = Number(raw)
              if (!Number.isFinite(parsed)) return
              const { min, max } = AGENT_LIMITS.stageMaxChars
              update({ stageMaxChars: Math.min(max, Math.max(min, Math.round(parsed))) })
            },
          }),
          createElement('span', { className: 'dshtavern-agent-unit' }, AGENT_LIMITS.stageMaxChars.unit)))))

  const modelsPane = createElement(SubTabPane, null,
    createElement('div', { className: 'dshtavern-agent-group' },
      createElement('div', { className: 'dshtavern-agent-group-note' },
        '留空表示跟随会话当前模型。导演与角色可用不同模型：导演负责判断，角色负责文风。'),
      createElement(ModelPicker, {
        label: '导演模型',
        hint: '导演每次都要输出 JSON 并选择说话人。',
        choice: config.directorModel,
        catalog,
        disabled,
        onChange: choice => update(choice === undefined
          ? { directorModel: undefined }
          : { directorModel: choice }),
      }),
      createElement(ModelPicker, {
        label: '角色模型',
        hint: '每个开口的角色各发起一次独立调用。',
        choice: config.characterModel,
        catalog,
        disabled,
        onChange: choice => update(choice === undefined
          ? { characterModel: undefined }
          : { characterModel: choice }),
      })))

  const replyPane = createElement(SubTabPane, null,
    createElement(ReplyBudgetGroup, {
      config,
      characters,
      disabled,
      onChange: patch => update(patch),
    }))

  const pane = activeTab === 'beat'
    ? beatPane
    : activeTab === 'context'
      ? contextPane
      : activeTab === 'models' ? modelsPane : replyPane

  return createElement('section', { className: 'dshtavern-agent' },
    createElement('div', { className: 'dshtavern-agent-toolbar' },
      createElement('span', {
        className: 'dshtavern-pill',
        'data-tone': saving ? 'busy' : dirty ? undefined : 'ok',
      }, saving
        ? '保存中…'
        : dirty
          ? '有未保存的修改'
          : differsFromDefault ? '已保存（自定义）' : '已保存（默认）'),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button',
        disabled: disabled,
        onClick: () => { void load() },
      }, '重新读取'),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button',
        disabled: disabled,
        onClick: () => { void persist(config, true) },
      }, '恢复默认'),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button dshtavern-button-primary',
        disabled: disabled || !dirty,
        onClick: () => { void persist(config) },
      }, '保存')),

    error === null ? null : createElement('div', { className: CLASS.bannerError }, error),
    notice === null ? null : createElement('div', { className: CLASS.bannerNotice }, notice),

    createElement(SubTabs, {
      ariaLabel: 'Agent 编排页面',
      active: activeTab,
      tabs: AGENT_TABS.map(tab => ({
        id: tab.id,
        label: tab.label,
        hint: tab.hint,
        changed: agentTabChanged(config, saved, tab.fields),
      })),
      onSelect: id => setActiveTab(id as AgentTab),
    }),
    pane)
}

/**
 * Reply-length controls: one shared budget plus per-role and per-character
 * overrides.
 *
 * The budget is expressed in characters because that is what an author counts;
 * the host converts it to the provider's token cap.
 */
function ReplyBudgetGroup(props: {
  readonly config: AgentConfigView
  readonly characters: readonly { id: string; name: string }[]
  readonly disabled: boolean
  readonly onChange: (patch: Partial<AgentConfigView>) => void
}): ReactElement {
  const { config, disabled } = props
  const shared = config.maxReplyChars
  const bounds = AGENT_LIMITS.maxReplyChars
  const overrides = config.characterMaxReplyChars ?? {}
  const overriddenCount = Object.keys(overrides).length
  const clearAll = (): void => {
    props.onChange({
      maxReplyChars: undefined,
      directorMaxReplyChars: undefined,
      characterMaxReplyChars: undefined,
    })
  }
  const setOverride = (id: string, value: number | undefined): void => {
    const next = { ...overrides }
    if (value === undefined) delete next[id]
    else next[id] = value
    props.onChange({
      characterMaxReplyChars: Object.keys(next).length === 0 ? undefined : next,
    })
  }

  return createElement('div', { className: 'dshtavern-agent-group' },
    createElement('div', { className: 'dshtavern-agent-group-note' },
      `留空表示不限制，由模型自身决定。字数按约 ${TOKENS_PER_CHAR} token/字换算成模型的输出上限。`),

    createElement('label', { className: 'dshtavern-agent-row' },
      createElement('span', { className: 'dshtavern-agent-row-text' },
        createElement('span', { className: 'dshtavern-agent-label' }, '统一回复长度'),
        createElement('span', { className: 'dshtavern-agent-hint' },
          '所有调用的默认上限；下面的逐角色设置会覆盖它。')),
      createElement('span', { className: 'dshtavern-agent-input-wrap' },
        createElement('input', {
          className: 'dshtavern-agent-input',
          type: 'number',
          min: bounds.min,
          max: bounds.max,
          step: bounds.step,
          placeholder: '不限',
          value: shared === undefined ? '' : String(shared),
          disabled,
          onChange: (event: { target: { value: string } }) => {
            const raw = event.target.value.trim()
            if (raw.length === 0) {
              props.onChange({ maxReplyChars: undefined })
              return
            }
            const parsed = Number(raw)
            if (!Number.isFinite(parsed)) return
            props.onChange({
              maxReplyChars: Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed))),
            })
          },
        }),
        createElement('span', { className: 'dshtavern-agent-unit' }, bounds.unit))),

    createElement('div', { className: 'dshtavern-agent-quick' },
      createElement('span', { className: 'dshtavern-agent-hint' }, '一键设置：'),
      QUICK_SIZES.map(size => createElement('button', {
        key: size,
        type: 'button',
        className: 'dshtavern-button dshtavern-agent-quick-button',
        'data-active': shared === size ? 'true' : 'false',
        disabled,
        onClick: () => props.onChange({ maxReplyChars: size }),
      }, `${size} 字`)),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button dshtavern-agent-quick-button',
        'data-active': shared === undefined ? 'true' : 'false',
        disabled,
        onClick: () => { clearAll() },
      }, '不限')),

    createElement('label', { className: 'dshtavern-agent-row' },
      createElement('span', { className: 'dshtavern-agent-row-text' },
        createElement('span', { className: 'dshtavern-agent-label' }, '导演回复长度'),
        createElement('span', { className: 'dshtavern-agent-hint' },
          '覆盖统一值。导演只输出 JSON 指令，通常可以更短。')),
      createElement('span', { className: 'dshtavern-agent-input-wrap' },
        createElement('input', {
          className: 'dshtavern-agent-input',
          type: 'number',
          min: bounds.min,
          max: bounds.max,
          step: bounds.step,
          placeholder: shared === undefined ? '不限' : `同统一 ${shared}`,
          value: config.directorMaxReplyChars === undefined ? '' : String(config.directorMaxReplyChars),
          disabled,
          onChange: (event: { target: { value: string } }) => {
            const raw = event.target.value.trim()
            if (raw.length === 0) {
              props.onChange({ directorMaxReplyChars: undefined })
              return
            }
            const parsed = Number(raw)
            if (!Number.isFinite(parsed)) return
            props.onChange({
              directorMaxReplyChars: Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed))),
            })
          },
        }),
        createElement('span', { className: 'dshtavern-agent-unit' }, bounds.unit))),

    createElement('div', { className: 'dshtavern-agent-subhead' },
      createElement('span', { className: 'dshtavern-agent-label' }, '逐角色回复长度'),
      overriddenCount === 0
        ? createElement('span', { className: 'dshtavern-agent-hint' }, '全部沿用统一值')
        : createElement('span', { className: 'dshtavern-agent-hint' }, `${overriddenCount} 个角色单独设置`)),    props.characters.length === 0
      ? createElement('div', { className: 'dshtavern-agent-hint' }, '这个工作区还没有角色卡。')
      : createElement('div', { className: 'dshtavern-agent-chars' },
        props.characters.map(character => createElement('label', {
          key: character.id,
          className: 'dshtavern-agent-char-row',
        },
        createElement('span', { className: 'dshtavern-agent-char-name', title: character.id }, character.name),
        createElement('input', {
          className: 'dshtavern-agent-input dshtavern-agent-char-input',
          type: 'number',
          min: bounds.min,
          max: bounds.max,
          step: bounds.step,
          placeholder: shared === undefined ? '不限' : String(shared),
          value: overrides[character.id] === undefined ? '' : String(overrides[character.id]),
          disabled,
          onChange: (event: { target: { value: string } }) => {
            const raw = event.target.value.trim()
            if (raw.length === 0) {
              setOverride(character.id, undefined)
              return
            }
            const parsed = Number(raw)
            if (!Number.isFinite(parsed)) return
            setOverride(character.id, Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed))))
          },
        }),
        createElement('span', { className: 'dshtavern-agent-unit' }, bounds.unit)))),

    createElement('label', { className: 'dshtavern-agent-row' },
      createElement('span', { className: 'dshtavern-agent-row-text' },
        createElement('span', { className: 'dshtavern-agent-label' }, '推理预留'),
        createElement('span', { className: 'dshtavern-agent-hint' },
          `模型把思考与正文算在同一个输出上限里。留出这段 token，字数预算才真正用在正文上；默认 ${DEFAULT_RESERVE}。`)),
      createElement('span', { className: 'dshtavern-agent-input-wrap' },
        createElement('input', {
          className: 'dshtavern-agent-input',
          type: 'number',
          min: AGENT_LIMITS.reasoningReserveTokens.min,
          max: AGENT_LIMITS.reasoningReserveTokens.max,
          step: AGENT_LIMITS.reasoningReserveTokens.step,
          placeholder: String(DEFAULT_RESERVE),
          value: config.reasoningReserveTokens === undefined ? '' : String(config.reasoningReserveTokens),
          disabled,
          onChange: (event: { target: { value: string } }) => {
            const raw = event.target.value.trim()
            if (raw.length === 0) {
              props.onChange({ reasoningReserveTokens: undefined })
              return
            }
            const parsed = Number(raw)
            if (!Number.isFinite(parsed)) return
            const { min, max } = AGENT_LIMITS.reasoningReserveTokens
            props.onChange({ reasoningReserveTokens: Math.min(max, Math.max(min, Math.round(parsed))) })
          },
        }),
        createElement('span', { className: 'dshtavern-agent-unit' }, AGENT_LIMITS.reasoningReserveTokens.unit))))
}

/** One-click budgets offered above the shared reply-length field. */
const QUICK_SIZES = [120, 240, 400, 800] as const

/** Tokens per Chinese character, mirrored from the host for the panel's hint. */
const TOKENS_PER_CHAR = 0.6

/** Reasoning headroom default, mirrored from the host so the placeholder matches. */
const DEFAULT_RESERVE = 512
