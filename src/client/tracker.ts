/**
 * Story tracker panel for the tavern toolbox.
 *
 * Three parts, top to bottom: where the tracking stands right now, the two
 * settings that control it, and the ledgers each run produced. A run happens on
 * the host's own schedule; this panel only configures it and reads the result,
 * so opening it never spends a model call.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { CLASS } from './styles.js'

/** Which of the two schedules a workspace uses. */
export type TrackerTriggerView = 'turns' | 'minutes'

/** Trigger settings for one tavern workspace. */
export interface TrackerConfigView {
  readonly schema: number
  readonly enabled: boolean
  readonly trigger: TrackerTriggerView
  readonly everyTurns: number
  readonly everyMinutes: number
  readonly maxTranscriptChars: number
  readonly model?: { readonly provider: string; readonly model: string }
}

/** One character's entry in a ledger. */
export interface CharacterProgressView {
  readonly id?: string
  readonly name: string
  readonly progress: string
}

/** One tracking run's result. */
export interface TrackerSummaryView {
  readonly turn: number
  readonly at: string
  readonly model?: string
  readonly world: string
  readonly characters: readonly CharacterProgressView[]
  readonly transcriptChars: number
  readonly sinceTurn?: number
}

/** One chat's tracking view. */
export interface TrackerChatView {
  readonly sessionId: string
  readonly newestTurn: number
  readonly summaries: readonly TrackerSummaryView[]
  readonly trackedTurns: readonly number[]
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
} as const

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

/** One tracked turn's ledger. */
function SummaryCard(props: { readonly summary: TrackerSummaryView }): ReactElement {
  const summary = props.summary
  return createElement('article', { className: 'dshtavern-tracker-summary' },
    createElement('header', { className: 'dshtavern-tracker-summary-head' },
      createElement('span', { className: 'dshtavern-tracker-badge' }, `第 ${summary.turn} 轮`),
      createElement('span', { className: 'dshtavern-tracker-hint' },
        `${summary.at.replace('T', ' ').slice(0, 16)}${summary.model === undefined ? '' : ` · ${summary.model}`}`),
      createElement('span', { className: 'dshtavern-tracker-hint dshtavern-tracker-summary-size' },
        `${summary.transcriptChars} 字全文`)),
    createElement('div', { className: 'dshtavern-tracker-section' },
      createElement('div', { className: 'dshtavern-tracker-section-title' }, '世界'),
      createElement('p', { className: 'dshtavern-tracker-text' }, summary.world)),
    ...summary.characters.length === 0
      ? []
      : [createElement('div', { key: 'chars', className: 'dshtavern-tracker-section' },
        createElement('div', { className: 'dshtavern-tracker-section-title' }, `角色（${summary.characters.length}）`),
        ...summary.characters.map(entry => createElement('div', { key: entry.name, className: 'dshtavern-tracker-entry' },
          createElement('span', { className: 'dshtavern-tracker-entry-name' }, entry.name),
          createElement('p', { className: 'dshtavern-tracker-text' }, entry.progress))))])
}

/**
 * Story tracker: status, schedule choice, and the ledgers so far.
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

  return createElement('section', { className: 'dshtavern-tracker' },
    // ---- Status ---------------------------------------------------------
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

    // ---- Settings -------------------------------------------------------
    createElement('div', { className: 'dshtavern-tracker-group' },
      createElement('div', { className: 'dshtavern-tracker-group-head' },
        createElement('div', { className: 'dshtavern-tracker-group-title' }, '自动回顾'),
        createElement('span', {
          className: 'dshtavern-tracker-badge',
          'data-tone': dirty ? 'warn' : 'ok',
        }, saving ? '保存中…' : dirty ? '有未保存的修改' : '已保存')),
      createElement('div', { className: 'dshtavern-tracker-group-note' },
        '回顾在后台独立运行，不占用本回合的模型调用。每次都会把从开场到现在的完整剧情读一遍，重写成一份当前状态的摘要。'),

      createElement('div', { className: 'dshtavern-tracker-row dshtavern-tracker-row-toggle' },
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
      }),

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
        }, '保存'))),

    // ---- Ledgers --------------------------------------------------------
    createElement('div', { className: 'dshtavern-tracker-records' },
      createElement('div', { className: 'dshtavern-tracker-head' },
        createElement('div', { className: 'dshtavern-tracker-title' }, '回顾记录'),
        createElement('span', { className: 'dshtavern-tracker-hint' },
          current === undefined || current.newestTurn === 0
            ? '还没有剧情'
            : `最新第 ${current.newestTurn} 轮 · 已回顾 ${current.trackedTurns.length} 次`)),
      ordered.length === 0
        ? createElement('div', { className: 'dshtavern-tracker-hint' }, '这个工作区还没有可以回顾的聊天。')
        : ordered.map(chat => createElement('div', { key: chat.sessionId, className: 'dshtavern-tracker-chat' },
          ordered.length === 1
            ? null
            : createElement('div', { className: 'dshtavern-tracker-chat-head' },
              createElement('span', { className: 'dshtavern-tracker-chat-title' },
                chat.sessionId === props.sessionId ? '当前会话' : chat.sessionId.slice(0, 18)),
              createElement('span', { className: 'dshtavern-tracker-hint' },
                chat.newestTurn === 0 ? '还没有剧情' : `最新第 ${chat.newestTurn} 轮`),
              chat.running
                ? createElement('span', { className: 'dshtavern-tracker-badge', 'data-tone': 'busy' }, '回顾中…')
                : null),
          chat.lastError === undefined
            ? null
            : createElement('div', { className: 'dshtavern-tracker-error' }, chat.lastError),
          chat.summaries.length === 0
            ? createElement('div', { className: 'dshtavern-tracker-hint' }, '还没有回顾记录。')
            : chat.summaries.map(summary => createElement(SummaryCard, {
              key: summary.turn,
              summary,
            }))))))
}
