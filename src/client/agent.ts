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
import { CLASS } from './styles.js'

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
  stageWindow: { min: 4, max: 200, step: 1, unit: '行' },
  loreScanLines: { min: 4, max: 200, step: 1, unit: '行' },
  loreMaxEntries: { min: 1, max: 20, step: 1, unit: '条' },
  loreMaxChars: { min: 200, max: 40_000, step: 100, unit: '字' },
  playerInputMax: { min: 200, max: 20_000, step: 100, unit: '字' },
} as const

type NumericField = keyof typeof AGENT_LIMITS

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [snapshot, providers] = await Promise.all([
        fetchAgentConfig(props.workspaceId),
        fetchModelCatalog().catch(() => [] as readonly ModelCatalogEntry[]),
      ])
      setConfig(snapshot.config)
      setSaved(snapshot.config)
      setDefaults(snapshot.defaults)
      setCatalog(providers)
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

  const dirty = JSON.stringify(config) !== JSON.stringify(saved)
  const differsFromDefault = JSON.stringify(config) !== JSON.stringify(defaults)
  const disabled = saving
  const num = (field: NumericField, label: string, hint: string): ReactElement =>
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

    createElement('div', { className: 'dshtavern-agent-group' },
      createElement('div', { className: 'dshtavern-agent-group-title' }, '这一幕'),
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
        createElement('option', { value: 'first' }, '第一个角色顶替')))),

    createElement('div', { className: 'dshtavern-agent-group' },
      createElement('div', { className: 'dshtavern-agent-group-title' }, '上下文预算'),
      createElement('div', { className: 'dshtavern-agent-group-note' },
        '这些值决定每次模型调用带上多少历史与设定。调大更连贯，也更费 token。'),
      num('stageWindow', '角色可见舞台行数', '每个角色能看到最近多少条旁白与台词。'),
      num('loreScanLines', '世界书扫描行数', '关键词匹配回溯多少条舞台记录。'),
      num('loreMaxEntries', '世界书最多条数', '单次请求最多注入多少条命中条目。'),
      num('loreMaxChars', '世界书最多字数', '单次请求注入条目内容的总字数上限。'),
      num('playerInputMax', '玩家输入上限', '超过这个长度的玩家输入会被截断。')),

    createElement('div', { className: 'dshtavern-agent-group' },
      createElement('div', { className: 'dshtavern-agent-group-title' }, '角色分工模型'),
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
}
