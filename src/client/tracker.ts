/**
 * Story tracker panel for the tavern toolbox.
 *
 * Three sub-pages behind one tab strip: the newest ledger, the run history, and
 * the settings. A run happens on the host's own schedule; this panel only
 * configures it and reads the result, so opening it never spends a model call.
 * The newest ledger is separated from the rest because that is what a player
 * checks while playing — the history is for going back, not for skimming.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { CLASS } from './styles.js'

/** Which of the two schedules a workspace uses. */
export type TrackerTriggerView = 'turns' | 'minutes'

/** Which sub-page the panel shows. */
export type TrackerTab = 'latest' | 'history' | 'settings'

/** How much text one category of the ledger may carry. */
export interface TrackerLengthView {
  /** Length the prompt asks for, in characters. */
  readonly suggested: number
}

/** Per-category length budgets, mirrored from the host. */
export interface TrackerLengthsView {
  readonly world: TrackerLengthView
  readonly character: TrackerLengthView
  readonly user: TrackerLengthView
}

/** Trigger settings for one tavern workspace. */
export interface TrackerConfigView {
  readonly schema: number
  readonly enabled: boolean
  readonly trigger: TrackerTriggerView
  readonly everyTurns: number
  readonly everyMinutes: number
  readonly maxTranscriptChars: number
  readonly lengths: TrackerLengthsView
  readonly model?: { readonly provider: string; readonly model: string }
}

/** One character's entry in a ledger. */
export interface CharacterProgressView {
  readonly id?: string
  readonly name: string
  readonly progress: string
}

/** The player's entry in a ledger. */
export interface UserProgressView {
  readonly progress: string
}

/** One tracking run's result. */
export interface TrackerSummaryView {
  readonly turn: number
  readonly at: string
  readonly model?: string
  readonly world: string
  /** Absent on ledgers written before player tracking existed. */
  readonly user?: UserProgressView
  readonly characters: readonly CharacterProgressView[]
  readonly transcriptChars: number
  readonly sinceTurn?: number
}

/** One chat's tracking view. */
export interface TrackerChatView {
  readonly sessionId: string
  readonly newestTurn: number
  readonly summaries: readonly TrackerSummaryView[]
  /** Every turn the newest ledger has read; the rail marks these. */
  readonly trackedTurns: readonly number[]
  /** How many runs have written a ledger. */
  readonly runCount: number
  readonly running: boolean
  readonly staleTurns: readonly number[]
  readonly lastError?: string
}

/** The tracker's read model. */
export interface TrackerSnapshotView {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly config: TrackerConfigView
  readonly defaults: TrackerConfigView
  readonly chats: readonly TrackerChatView[]
  readonly generatedAt: string
}

/** Bounds mirrored from the host so the inputs can clamp in place. */
export const TRACKER_LIMITS = {
  everyTurns: { min: 1, max: 200, unit: '轮' },
  everyMinutes: { min: 1, max: 10_080, unit: '分钟' },
  maxTranscriptChars: { min: 2_000, max: 800_000, unit: '字' },
  worldChars: { min: 60, max: 4_000, unit: '字' },
  characterChars: { min: 40, max: 2_000, unit: '字' },
  userChars: { min: 40, max: 2_000, unit: '字' },
} as const

/**
 * Ready-made length budgets.
 *
 * Three sizes rather than a single slider per field: the useful question is
 * "how much summary do I want", not "how many characters should the world
 * section be". Each preset scales the three categories together, keeping the
 * ratio the defaults established.
 */
export const LENGTH_PRESETS = {
  short: { label: '精简', hint: '几句话说清现状', world: 150, character: 100, user: 80 },
  standard: { label: '标准', hint: '默认，够回顾也能读完', world: 300, character: 180, user: 150 },
  long: { label: '详细', hint: '保留更多细节', world: 600, character: 360, user: 300 },
  deep: { label: '详尽', hint: '接近章节摘要', world: 1_200, character: 700, user: 600 },
} as const

/** A preset id from {@link LENGTH_PRESETS}. */
export type LengthPresetId = keyof typeof LENGTH_PRESETS

/**
 * Which preset a set of budgets currently matches.
 * @param lengths - configured budgets.
 * @returns the preset id, or `undefined` for a custom mix.
 */
export function lengthPresetOf(lengths: TrackerLengthsView): LengthPresetId | undefined {
  for (const [id, preset] of Object.entries(LENGTH_PRESETS)) {
    if (preset.world === lengths.world.suggested
      && preset.character === lengths.character.suggested
      && preset.user === lengths.user.suggested) return id as LengthPresetId
  }
  return undefined
}

/** How often the panel re-reads run state while open. */
const REFRESH_MS = 15_000

/** Props of the tracker panel. */
export interface TrackerPanelProps {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  /** Chat the toolbox was opened from, shown first and used for manual runs. */
  readonly sessionId: string
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`回顾接口不可用（HTTP ${response.status}）`)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('回顾接口返回了非对象 JSON')
  }
  const record = body as Record<string, unknown>
  if (record.ok !== true) {
    throw new Error(typeof record.error === 'string' ? record.error : `回顾请求失败（HTTP ${response.status}）`)
  }
  return record
}

/** Read one workspace's tracker snapshot. */
async function loadSnapshot(workspaceId: string): Promise<TrackerSnapshotView> {
  const response = await fetch(`/tavern-tracker/state?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  return (await readJson(response)) as unknown as TrackerSnapshotView
}

/** Persist one workspace's tracker settings. */
async function saveConfig(
  workspaceId: string,
  body: { config: TrackerConfigView } | { reset: true },
): Promise<TrackerConfigView> {
  const response = await fetch('/tavern-tracker/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ workspaceId, action: 'save', ...body }),
  })
  const payload = await readJson(response)
  return payload.config as TrackerConfigView
}

/** Start one tracking run for a chat. */
async function startTracking(workspaceId: string, sessionId: string): Promise<{ started: boolean; reason?: string }> {
  const response = await fetch('/tavern-tracker/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ workspaceId, action: 'track', sessionId }),
  })
  const payload = await readJson(response)
  return {
    started: payload.started === true,
    ...(typeof payload.reason === 'string' ? { reason: payload.reason } : {}),
  }
}

/**
 * One line of the status card: what tracking is doing right now.
 *
 * The status is the first thing a reader wants, so it is a sentence rather than
 * a row of pills: "next run after 3 more beats" answers the question a knob
 * cannot.
 * @param props - config and the current chat, when one is selected.
 * @returns the status sentence.
 */
export function trackerStatusText(
  config: TrackerConfigView,
  chat: TrackerChatView | undefined,
): string {
  if (!config.enabled) return '自动回顾已关闭，只能在下面手动点「立即回顾」。'
  const schedule = config.trigger === 'turns'
    ? `每新增 ${config.everyTurns} 轮`
    : `每 ${config.everyMinutes} 分钟`
  if (chat === undefined) return `${schedule}回顾一次。`
  const trackedThrough = chat.trackedTurns.length === 0 ? 0 : Math.max(...chat.trackedTurns)
  if (config.trigger === 'turns') {
    const pending = Math.max(0, chat.newestTurn - trackedThrough)
    const remaining = Math.max(0, config.everyTurns - pending)
    return `${schedule}回顾一次。已到第 ${chat.newestTurn} 轮${trackedThrough === 0 ? '' : `（上次第 ${trackedThrough} 轮）`}，`
      + (remaining === 0 ? '下一次很快就会运行。' : `再新增 ${remaining} 轮后运行。`)
  }
  return `${schedule}回顾一次。当前已到第 ${chat.newestTurn} 轮。`
}

/** One labelled number input with its unit and bounds. */
function NumberRow(props: {
  readonly label: string
  readonly hint: string
  readonly value: number
  readonly bounds: { readonly min: number; readonly max: number; readonly unit: string }
  readonly disabled: boolean
  readonly onChange: (value: number) => void
}): ReactElement {
  return createElement('label', { className: 'dshtavern-tracker-row' },
    createElement('span', { className: 'dshtavern-tracker-row-text' },
      createElement('span', { className: 'dshtavern-tracker-label' }, props.label),
      createElement('span', { className: 'dshtavern-tracker-hint' }, props.hint)),
    createElement('span', { className: 'dshtavern-tracker-input-wrap' },
      createElement('input', {
        className: 'dshtavern-tracker-input',
        type: 'number',
        min: props.bounds.min,
        max: props.bounds.max,
        value: String(props.value),
        disabled: props.disabled,
        onChange: (event: { target: { value: string } }) => {
          const parsed = Number(event.target.value)
          if (!Number.isFinite(parsed)) return
          props.onChange(Math.min(props.bounds.max, Math.max(props.bounds.min, Math.round(parsed))))
        },
      }),
      createElement('span', { className: 'dshtavern-tracker-unit' }, props.bounds.unit)))
}

/**
 * The two schedule options, as one choice rather than two switches.
 * @param props - current choice and the change handler.
 * @returns the radio group.
 */
function TriggerPicker(props: {
  readonly trigger: TrackerTriggerView
  readonly disabled: boolean
  readonly onChange: (trigger: TrackerTriggerView) => void
}): ReactElement {
  const options: ReadonlyArray<{ id: TrackerTriggerView; name: string; hint: string }> = [
    { id: 'turns', name: '按轮次', hint: '每新增 N 轮跑一次' },
    { id: 'minutes', name: '按时间', hint: '每隔 N 分钟跑一次' },
  ]
  return createElement('div', { className: 'dshtavern-tracker-triggers', role: 'radiogroup', 'aria-label': '自动触发方式' },
    options.map(option => createElement('button', {
      key: option.id,
      type: 'button',
      role: 'radio',
      'aria-checked': props.trigger === option.id,
      'data-active': props.trigger === option.id,
      className: 'dshtavern-tracker-trigger',
      disabled: props.disabled,
      onClick: () => props.onChange(option.id),
    },
    createElement('span', { className: 'dshtavern-tracker-trigger-name' }, option.name),
    createElement('span', { className: 'dshtavern-tracker-trigger-hint' }, option.hint))))
}

/**
 * One ledger, rendered as world → player → characters.
 *
 * The player entry comes second because it is the reader's own position, and
 * the cast's view of them depends on it; older ledgers without one simply skip
 * the section.
 * @param props - the ledger and whether it is the newest.
 * @returns the card element.
 */
function SummaryCard(props: { readonly summary: TrackerSummaryView; readonly newest?: boolean }): ReactElement {
  const summary = props.summary
  return createElement('article', {
    className: props.newest === true
      ? 'dshtavern-tracker-summary dshtavern-tracker-summary-newest'
      : 'dshtavern-tracker-summary',
  },
  createElement('header', { className: 'dshtavern-tracker-summary-head' },
    createElement('span', { className: 'dshtavern-tracker-badge' }, `第 ${summary.turn} 轮`),
    createElement('span', { className: 'dshtavern-tracker-hint' },
      `${summary.at.replace('T', ' ').slice(0, 16)}${summary.model === undefined ? '' : ` · ${summary.model}`}`),
    createElement('span', { className: 'dshtavern-tracker-hint dshtavern-tracker-summary-size' },
      `${summary.transcriptChars} 字全文`)),
  createElement('div', { className: 'dshtavern-tracker-section' },
    createElement('div', { className: 'dshtavern-tracker-section-title' }, '世界'),
    createElement('p', { className: 'dshtavern-tracker-text' }, summary.world)),
  ...summary.user === undefined
    ? []
    : [createElement('div', { key: 'user', className: 'dshtavern-tracker-section' },
      createElement('div', { className: 'dshtavern-tracker-section-title' }, '你'),
      createElement('p', { className: 'dshtavern-tracker-text' }, summary.user.progress))],
  ...summary.characters.length === 0
    ? []
    : [createElement('div', { key: 'chars', className: 'dshtavern-tracker-section' },
      createElement('div', { className: 'dshtavern-tracker-section-title' }, `角色（${summary.characters.length}）`),
      ...summary.characters.map(entry => createElement('div', { key: entry.name, className: 'dshtavern-tracker-entry' },
        createElement('span', { className: 'dshtavern-tracker-entry-name' }, entry.name),
        createElement('p', { className: 'dshtavern-tracker-text' }, entry.progress))))])
}

/**
 * The length presets, as one row of choices.
 *
 * Picking one replaces all three budgets at once, because they only make sense
 * relative to each other: a detailed world with a terse character entry reads
 * as if the cast barely matters.
 * @param props - current budgets and the change handler.
 * @returns the preset row.
 */
function LengthPicker(props: {
  readonly lengths: TrackerLengthsView
  readonly disabled: boolean
  readonly onChange: (lengths: TrackerLengthsView) => void
}): ReactElement {
  const active = lengthPresetOf(props.lengths)
  return createElement('div', { className: 'dshtavern-tracker-presets', role: 'radiogroup', 'aria-label': '摘要篇幅预设' },
    (Object.entries(LENGTH_PRESETS) as [LengthPresetId, typeof LENGTH_PRESETS[LengthPresetId]][]).map(([id, preset]) =>
      createElement('button', {
        key: id,
        type: 'button',
        role: 'radio',
        'aria-checked': active === id,
        'data-active': active === id,
        className: 'dshtavern-tracker-preset',
        disabled: props.disabled,
        title: `世界 ${preset.world} 字 · 玩家 ${preset.user} 字 · 每个角色 ${preset.character} 字`,
        onClick: () => props.onChange({
          world: { suggested: preset.world },
          character: { suggested: preset.character },
          user: { suggested: preset.user },
        }),
      },
      createElement('span', { className: 'dshtavern-tracker-preset-name' }, preset.label),
      createElement('span', { className: 'dshtavern-tracker-preset-hint' }, preset.hint))))
}

/**
 * Story tracker: newest ledger, run history, and settings behind one tab strip.
 * @param props - the workspace and chat the toolbox opened for.
 * @returns the tracker section.
 */
export function TrackerPanel(props: TrackerPanelProps): ReactElement {
  const [snapshot, setSnapshot] = useState<TrackerSnapshotView | null>(null)
  const [draft, setDraft] = useState<TrackerConfigView | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TrackerTab>('latest')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const next = await loadSnapshot(props.workspaceId)
      setSnapshot(next)
      // Keep unsaved edits: a background refresh must not discard a knob the
      // user just turned.
      setDraft(current => current === null ? next.config : current)
      setError(null)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [props.workspaceId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => { void load(true) }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const persist = useCallback(async (next: TrackerConfigView, reset = false) => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const stored = await saveConfig(props.workspaceId, reset ? { reset: true } : { config: next })
      setDraft(stored)
      setSnapshot(current => current === null ? current : { ...current, config: stored })
      setNotice(reset ? '已恢复默认设置' : '已保存回顾设置')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setSaving(false)
    }
  }, [props.workspaceId])

  const trackNow = useCallback(async () => {
    setError(null)
    setNotice(null)
    try {
      const result = await startTracking(props.workspaceId, props.sessionId)
      setNotice(result.started ? '已开始回顾，完成后会出现在下方' : result.reason ?? '回顾没有开始')
      await load(true)
    } catch (cause) {
      setError(errorText(cause))
    }
  }, [load, props.workspaceId, props.sessionId])

  if (loading && snapshot === null) {
    return createElement('section', { className: 'dshtavern-tracker' },
      createElement('div', { className: CLASS.hint, style: { padding: '10px 2px' } }, '读取回顾状态…'))
  }
  if (snapshot === null || draft === null) {
    return createElement('section', { className: 'dshtavern-tracker' },
      createElement('div', { className: CLASS.bannerError }, error ?? '无法读取回顾状态'),
      createElement('button', { type: 'button', className: CLASS.button, onClick: () => { void load() } }, '重试'))
  }

  const ordered = snapshot.chats.find(chat => chat.sessionId === props.sessionId) === undefined
    ? snapshot.chats
    : [snapshot.chats.find(chat => chat.sessionId === props.sessionId)!, ...snapshot.chats.filter(chat => chat.sessionId !== props.sessionId)]
  const current = ordered[0]
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.config)
  // The host reports only superseded turns the newest ledger actually covers.
  const staleCovered = current?.staleTurns ?? []

  const tab = activeTab
  const latest = current?.summaries[0]
  const history = current?.summaries.slice(1) ?? []

  /** Newest ledger only: what a player checks while playing. */
  const latestPane = createElement('div', { className: 'dshtavern-tracker-pane' },
    current === undefined || latest === undefined
      ? createElement('div', { className: 'dshtavern-tracker-empty' },
        current === undefined
          ? '这个工作区还没有可以回顾的聊天。'
          : '还没有回顾记录。点上面的「立即回顾」生成第一份。')
      : createElement(SummaryCard, { summary: latest, newest: true }),
    current?.lastError === undefined
      ? null
      : createElement('div', { className: 'dshtavern-tracker-error' }, current.lastError))

  /** Older ledgers, newest first. */
  const historyPane = createElement('div', { className: 'dshtavern-tracker-pane' },
    history.length === 0
      ? createElement('div', { className: 'dshtavern-tracker-empty' }, '还没有更早的回顾记录。')
      : history.map(summary => createElement(SummaryCard, { key: summary.turn, summary })))

  /** Settings: schedule, transcript ceiling, and the per-category budgets. */
  const settingsPane = createElement('div', { className: 'dshtavern-tracker-pane' },
    createElement('div', { className: 'dshtavern-tracker-group' },
      createElement('div', { className: 'dshtavern-tracker-group-head' },
        createElement('div', { className: 'dshtavern-tracker-group-title' }, '自动回顾'),
        createElement('span', {
          className: 'dshtavern-tracker-badge',
          'data-tone': dirty ? 'warn' : 'ok',
        }, saving ? '保存中…' : dirty ? '有未保存的修改' : '已保存')),
      createElement('div', { className: 'dshtavern-tracker-group-note' },
        '回顾在后台独立运行，不占用本回合的模型调用。每次都会把从开场到现在的完整剧情读一遍，重写成一份当前状态的摘要。'),

      // A label, not a div: the visible switch is 34×20 px, so the row text has
      // to be part of the hit target or the control reads as unclickable.
      createElement('label', { className: 'dshtavern-tracker-row dshtavern-tracker-row-toggle' },
        createElement('span', { className: 'dshtavern-tracker-row-text' },
          createElement('span', { className: 'dshtavern-tracker-label' }, '启用自动回顾'),
          createElement('span', { className: 'dshtavern-tracker-hint' }, '关闭后只在手动点「立即回顾」时运行。')),
        createElement('span', { className: 'dshtavern-switch' },
          createElement('input', {
            type: 'checkbox',
            checked: draft.enabled,
            disabled: saving,
            onChange: () => setDraft({ ...draft, enabled: !draft.enabled }),
          }),
          createElement('span', { className: 'dshtavern-switch-track', 'aria-hidden': true },
            createElement('span', { className: 'dshtavern-switch-thumb' })))),

      createElement(TriggerPicker, {
        trigger: draft.trigger,
        disabled: saving || !draft.enabled,
        onChange: trigger => setDraft({ ...draft, trigger }),
      }),

      draft.trigger === 'turns'
        ? createElement(NumberRow, {
          label: '每 N 轮',
          hint: '按新增的轮次计算：上次回顾之后又发生了几轮，达到这个数就运行一次。',
          value: draft.everyTurns,
          bounds: TRACKER_LIMITS.everyTurns,
          disabled: saving || !draft.enabled,
          onChange: value => setDraft({ ...draft, everyTurns: value }),
        })
        : createElement(NumberRow, {
          label: '每 N 分钟',
          hint: '按真实时间计算，与轮次无关；这段时间里没有新剧情就跳过。',
          value: draft.everyMinutes,
          bounds: TRACKER_LIMITS.everyMinutes,
          disabled: saving || !draft.enabled,
          onChange: value => setDraft({ ...draft, everyMinutes: value }),
        }),

      createElement(NumberRow, {
        label: '全文上限',
        hint: '完整剧情超过这个字数时，从最旧的部分开始丢弃。留给最后注入的系统提示词与摘要本身。',
        value: draft.maxTranscriptChars,
        bounds: TRACKER_LIMITS.maxTranscriptChars,
        disabled: saving,
        onChange: value => setDraft({ ...draft, maxTranscriptChars: value }),
      })),

    createElement('div', { className: 'dshtavern-tracker-group' },
      createElement('div', { className: 'dshtavern-tracker-group-head' },
        createElement('div', { className: 'dshtavern-tracker-group-title' }, '摘要篇幅'),
        createElement('span', { className: 'dshtavern-tracker-hint' }, '建议字数；模型超出这个篇幅时会被裁掉')),
      createElement('div', { className: 'dshtavern-tracker-group-note' },
        '三部分各自独立计字。调小更省 token、更容易扫读；调大能留住更多细节，但下一轮的提示词也会更长。'),
      createElement(LengthPicker, {
        lengths: draft.lengths,
        disabled: saving,
        onChange: lengths => setDraft({ ...draft, lengths }),
      }),
      createElement(NumberRow, {
        label: '世界',
        hint: '地点、正在发生的事、还没解决的线索。',
        value: draft.lengths.world.suggested,
        bounds: TRACKER_LIMITS.worldChars,
        disabled: saving,
        onChange: value => setDraft({ ...draft, lengths: { ...draft.lengths, world: { suggested: value } } }),
      }),
      createElement(NumberRow, {
        label: '你（玩家）',
        hint: '玩家已经表明的身份、做过并被看见的事、角色现在怎么看玩家。',
        value: draft.lengths.user.suggested,
        bounds: TRACKER_LIMITS.userChars,
        disabled: saving,
        onChange: value => setDraft({ ...draft, lengths: { ...draft.lengths, user: { suggested: value } } }),
      }),
      createElement(NumberRow, {
        label: '每个角色',
        hint: '每个角色各自的上限，不是全部角色加起来。',
        value: draft.lengths.character.suggested,
        bounds: TRACKER_LIMITS.characterChars,
        disabled: saving,
        onChange: value => setDraft({ ...draft, lengths: { ...draft.lengths, character: { suggested: value } } }),
      })),

    createElement('div', { className: 'dshtavern-tracker-actions' },
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button',
        disabled: saving,
        onClick: () => { void persist(draft, true) },
      }, '恢复默认'),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button dshtavern-button-primary',
        disabled: saving || !dirty,
        onClick: () => { void persist(draft) },
      }, '保存')))

  return createElement('section', { className: 'dshtavern-tracker' },
    // ---- Status (always visible: it answers "what happens next") ----------
    createElement('div', { className: 'dshtavern-tracker-card dshtavern-tracker-status' },
      createElement('div', { className: 'dshtavern-tracker-status-main' },
        createElement('span', {
          className: 'dshtavern-tracker-dot',
          'data-tone': !draft.enabled ? 'off' : staleCovered.length > 0 ? 'warn' : 'on',
          'aria-hidden': true,
        }),
        createElement('span', { className: 'dshtavern-tracker-status-text' },
          trackerStatusText(draft, current))),
      createElement('div', { className: 'dshtavern-tracker-status-actions' },
        createElement('button', {
          type: 'button',
          className: 'dshtavern-button',
          disabled: saving,
          onClick: () => { void load() },
        }, '刷新'),
        createElement('button', {
          type: 'button',
          className: 'dshtavern-button dshtavern-button-primary',
          disabled: saving || current === undefined || current.running || current.newestTurn === 0,
          onClick: () => { void trackNow() },
        }, current?.running === true ? '回顾中…' : '立即回顾'))),

    error === null ? null : createElement('div', { className: CLASS.bannerError }, error),
    notice === null ? null : createElement('div', { className: CLASS.bannerNotice }, notice),

    staleCovered.length === 0
      ? null
      : createElement('div', { className: 'dshtavern-tracker-stale' },
        createElement('span', { className: 'dshtavern-tracker-stale-title' }, '摘要已过期'),
        createElement('span', null,
          `第 ${staleCovered.join('、')} 轮被重新生成取代，现有摘要是按旧剧情写的。`),
        createElement('button', {
          type: 'button',
          className: 'dshtavern-button',
          disabled: saving || current?.running === true,
          onClick: () => { void trackNow() },
        }, '重新回顾')),

    // ---- Tabs -----------------------------------------------------------
    createElement('div', { className: 'dshtavern-tracker-tabbar', role: 'tablist', 'aria-label': '回顾页面' },
      createElement('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': tab === 'latest',
        'data-active': tab === 'latest',
        className: 'dshtavern-tracker-tab',
        onClick: () => setActiveTab('latest'),
      }, '最新回顾'),
      createElement('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': tab === 'history',
        'data-active': tab === 'history',
        className: 'dshtavern-tracker-tab',
        disabled: history.length === 0,
        title: history.length === 0 ? '还没有更早的回顾' : undefined,
        onClick: () => setActiveTab('history'),
      }, `历史记录${history.length === 0 ? '' : `（${history.length}）`}`),
      createElement('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': tab === 'settings',
        'data-active': tab === 'settings',
        className: 'dshtavern-tracker-tab',
        onClick: () => setActiveTab('settings'),
      }, '设置')),

    tab === 'latest' ? latestPane : null,
    tab === 'history' ? historyPane : null,
    tab === 'settings' ? settingsPane : null)
}
