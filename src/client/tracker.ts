/**
 * Story tracker panel for the tavern toolbox.
 *
 * Shows one workspace's tracking schedule, the ledger each run produced, and
 * which beats have already been tracked. A run happens on the host's own
 * schedule; this panel only configures it and reads the result, so opening it
 * never spends a model call.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { CLASS } from './styles.js'

/** Trigger settings for one tavern workspace. */
export interface TrackerConfigView {
  readonly schema: number
  readonly enabled: boolean
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
    throw new Error(`追踪接口不可用（HTTP ${response.status}）`)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('追踪接口返回了非对象 JSON')
  }
  const record = body as Record<string, unknown>
  if (record.ok !== true) {
    throw new Error(typeof record.error === 'string' ? record.error : `追踪请求失败（HTTP ${response.status}）`)
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

/** One labelled number input. */
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

/** One tracked turn's ledger. */
function SummaryCard(props: { readonly summary: TrackerSummaryView }): ReactElement {
  const summary = props.summary
  const range = summary.sinceTurn === undefined
    ? `覆盖到第 ${summary.turn} 轮`
    : `第 ${summary.sinceTurn + 1}–${summary.turn} 轮`
  return createElement('article', { className: 'dshtavern-tracker-summary' },
    createElement('header', { className: 'dshtavern-tracker-summary-head' },
      createElement('span', { className: 'dshtavern-tracker-badge', 'data-tone': 'ok' }, range),
      createElement('span', { className: 'dshtavern-tracker-hint' },
        `${summary.at.replace('T', ' ').slice(0, 16)}${summary.model === undefined ? '' : ` · ${summary.model}`}`)),
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
 * Story tracker: schedule settings, manual run, and the ledgers so far.
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
      setDraft(current => current === null || JSON.stringify(current) === JSON.stringify(snapshot?.config)
        ? next.config
        : current)
      setError(null)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [props.workspaceId, snapshot?.config])

  useEffect(() => { void load() }, [props.workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps
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
      setNotice(reset ? '已恢复默认设置' : '已保存追踪设置')
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
      setNotice(result.started ? '已开始追踪，完成后会出现在下方' : result.reason ?? '追踪没有开始')
      await load(true)
    } catch (cause) {
      setError(errorText(cause))
    }
  }, [load, props.workspaceId, props.sessionId])

  if (loading && snapshot === null) {
    return createElement('section', { className: 'dshtavern-tracker' },
      createElement('div', { className: CLASS.hint, style: { padding: '10px 2px' } }, '读取追踪状态…'))
  }
  if (snapshot === null || draft === null) {
    return createElement('section', { className: 'dshtavern-tracker' },
      createElement('div', { className: CLASS.bannerError }, error ?? '无法读取追踪状态'),
      createElement('button', { type: 'button', className: CLASS.button, onClick: () => { void load() } }, '重试'))
  }

  const current = snapshot.chats.find(chat => chat.sessionId === props.sessionId)
  const chats = current === undefined
    ? snapshot.chats
    : [current, ...snapshot.chats.filter(chat => chat.sessionId !== props.sessionId)]
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.config)

  return createElement('section', { className: 'dshtavern-tracker' },
    createElement('div', { className: 'dshtavern-tracker-toolbar' },
      createElement('span', {
        className: 'dshtavern-pill',
        'data-tone': saving ? 'busy' : dirty ? undefined : 'ok',
      }, saving ? '保存中…' : dirty ? '有未保存的修改' : draft.enabled ? '自动追踪已开启' : '自动追踪已关闭'),
      createElement('button', {
        type: 'button',
        className: 'dshtavern-button',
        disabled: saving,
        onClick: () => { void load() },
      }, '刷新'),
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
      }, '保存')),

    error === null ? null : createElement('div', { className: CLASS.bannerError }, error),
    notice === null ? null : createElement('div', { className: CLASS.bannerNotice }, notice),

    createElement('div', { className: 'dshtavern-tracker-group' },
      createElement('div', { className: 'dshtavern-tracker-group-title' }, '触发方式'),
      createElement('div', { className: 'dshtavern-tracker-group-note' },
        '追踪在后台独立运行，不占用本回合的模型调用。两个条件谁先满足就触发一次；设为 0 表示关掉该条件。'),
      createElement('label', { className: 'dshtavern-tracker-row dshtavern-tracker-row-toggle' },
        createElement('span', { className: 'dshtavern-tracker-row-text' },
          createElement('span', { className: 'dshtavern-tracker-label' }, '启用自动追踪'),
          createElement('span', { className: 'dshtavern-tracker-hint' }, '关闭后只在手动点「立即追踪」时运行。')),
        createElement('span', { className: 'dshtavern-switch' },
          createElement('input', {
            type: 'checkbox',
            checked: draft.enabled,
            disabled: saving,
            onChange: () => setDraft({ ...draft, enabled: !draft.enabled }),
          }),
          createElement('span', { className: 'dshtavern-switch-track', 'aria-hidden': true },
            createElement('span', { className: 'dshtavern-switch-thumb' })))),
      createElement(NumberRow, {
        label: '每 N 轮追踪一次',
        hint: '按新增的轮次计算：上次追踪之后又发生了几轮，达到这个数就运行一次。',
        value: draft.everyTurns,
        bounds: { ...TRACKER_LIMITS.everyTurns, min: 0 },
        disabled: saving,
        onChange: value => setDraft({ ...draft, everyTurns: value }),
      }),
      createElement(NumberRow, {
        label: '每 N 分钟追踪一次',
        hint: '按真实时间计算，与轮次条件互不替代。',
        value: draft.everyMinutes,
        bounds: { ...TRACKER_LIMITS.everyMinutes, min: 0 },
        disabled: saving,
        onChange: value => setDraft({ ...draft, everyMinutes: value }),
      }),
      createElement(NumberRow, {
        label: '单次对话上限',
        hint: '超过这个字数时从最旧的记录开始丢弃，只把最近的部分交给追踪。',
        value: draft.maxTranscriptChars,
        bounds: TRACKER_LIMITS.maxTranscriptChars,
        disabled: saving,
        onChange: value => setDraft({ ...draft, maxTranscriptChars: value }),
      })),

    createElement('div', { className: 'dshtavern-tracker-group' },
      createElement('div', { className: 'dshtavern-tracker-group-title' }, '摘要'),
      chats.length === 0
        ? createElement('div', { className: 'dshtavern-tracker-hint' }, '这个工作区还没有可追踪的会话。')
        : chats.map(chat => createElement('div', { key: chat.sessionId, className: 'dshtavern-tracker-chat' },
          createElement('div', { className: 'dshtavern-tracker-chat-head' },
            createElement('span', { className: 'dshtavern-tracker-chat-title' },
              chat.sessionId === props.sessionId ? '当前会话' : chat.sessionId.slice(0, 18)),
            createElement('span', { className: 'dshtavern-tracker-hint' },
              chat.newestTurn === 0 ? '还没有剧情' : `最新第 ${chat.newestTurn} 轮 · 已追踪 ${chat.trackedTurns.length} 次`),
            chat.running
              ? createElement('span', { className: 'dshtavern-pill', 'data-tone': 'busy' }, '追踪中…')
              : null,
            chat.sessionId === props.sessionId
              ? createElement('button', {
                type: 'button',
                className: 'dshtavern-button',
                disabled: chat.running || chat.newestTurn === 0,
                onClick: () => { void trackNow() },
              }, '立即追踪')
              : null),
          chat.lastError === undefined
            ? null
            : createElement('div', { className: 'dshtavern-tracker-error' }, chat.lastError),
          chat.summaries.length === 0
            ? createElement('div', { className: 'dshtavern-tracker-hint' }, '还没有追踪记录。')
            : chat.summaries.map(summary => createElement(SummaryCard, {
              key: summary.turn,
              summary,
            }))))))
}
