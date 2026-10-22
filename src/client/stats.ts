/**
 * Usage panel for the tavern toolbox.
 *
 * Renders one tavern workspace's token spend, the current session's spend,
 * context occupancy, and cache-hit rate. Every figure is served by the
 * `dshtavern-stats` sub-plugin's loopback route; this module only formats and
 * lays them out.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { CLASS } from './styles.js'

/** Disjoint provider usage buckets. */
export interface UsageBucketsView {
  readonly uncachedInputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly outputTokens: number
}

/** Context occupancy of one session. */
export interface ContextUsageView {
  readonly usedTokens?: number
  readonly contextWindow?: number
  readonly ratio?: number
}

/** One session's usage. */
export interface SessionUsageView {
  readonly sessionId: string
  readonly title?: string
  readonly createdAt?: number
  readonly totalTokens: number
  readonly buckets: UsageBucketsView
  readonly cacheHitRate?: number
  readonly context: ContextUsageView
}

/** One workspace's usage snapshot. */
export interface UsageSnapshotView {
  readonly schema: number
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly totals: UsageBucketsView & {
    readonly totalTokens: number
    readonly sessionCount: number
    readonly cacheHitRate?: number
  }
  readonly current?: SessionUsageView
  readonly sessions: readonly SessionUsageView[]
  readonly projectionsAvailable: boolean
  readonly generatedAt: string
}

/** Props of the usage panel. */
export interface UsagePanelProps {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  readonly sessionId: string
}

/** How often the panel re-reads live counters. */
const REFRESH_MS = 10_000

/**
 * Format a token count the way the rest of the UI does.
 * @param value - raw count.
 * @returns `—` for an absent value, otherwise a compact number.
 */
export function formatTokens(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)}k`
  return `${(value / 1_000_000).toFixed(2)}M`
}

/**
 * Format a 0..1 ratio as a percentage.
 * @param value - ratio, or undefined when unknown.
 * @returns `—` or a one-decimal percentage.
 */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(value < 0.1 ? 2 : 1)}%`
}

/** Read one snapshot from the stats sub-plugin. */
async function fetchUsage(workspaceId: string, sessionId: string): Promise<UsageSnapshotView> {
  const params = new URLSearchParams({ workspaceId })
  if (sessionId.length > 0) params.set('sessionId', sessionId)
  const response = await fetch(`/tavern-stats/state?${params.toString()}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`用量统计不可用（HTTP ${response.status}）`)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('用量统计返回了非对象 JSON')
  }
  const record = body as Record<string, unknown>
  if (record.ok !== true) {
    throw new Error(typeof record.error === 'string' ? record.error : `用量统计请求失败（HTTP ${response.status}）`)
  }
  return record as unknown as UsageSnapshotView
}

/** One labelled figure. */
function Metric(props: {
  readonly label: string
  readonly value: string
  readonly hint?: string
}): ReactElement {
  return createElement('div', { className: 'dshtavern-usage-metric' },
    createElement('span', { className: 'dshtavern-usage-metric-label' }, props.label),
    createElement('span', { className: 'dshtavern-usage-metric-value' }, props.value),
    props.hint === undefined
      ? null
      : createElement('span', { className: 'dshtavern-usage-metric-hint' }, props.hint))
}

/** A labelled progress bar; `ratio` absent renders a muted empty track. */
function Meter(props: {
  readonly label: string
  readonly ratio: number | undefined
  /** Short right-aligned figure, e.g. `1.05%`. */
  readonly value: string
  /** Detail line under the track. */
  readonly detail: string
}): ReactElement {
  const percent = props.ratio === undefined ? 0 : Math.round(props.ratio * 1000) / 10
  const tone = props.ratio === undefined ? 'muted' : percent >= 85 ? 'hot' : percent >= 60 ? 'warm' : 'ok'
  return createElement('div', { className: 'dshtavern-usage-meter' },
    createElement('div', { className: 'dshtavern-usage-meter-head' },
      createElement('span', { className: 'dshtavern-usage-metric-label' }, props.label),
      createElement('span', { className: 'dshtavern-usage-meter-value' }, props.value)),
    createElement('div', {
      className: 'dshtavern-usage-meter-track',
      role: 'progressbar',
      'aria-valuenow': percent,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-label': props.label,
      'data-tone': tone,
    }, createElement('div', {
      className: 'dshtavern-usage-meter-fill',
      style: { width: `${Math.min(100, Math.max(0, percent))}%` },
    })),
    createElement('div', { className: 'dshtavern-usage-meter-caption' }, props.detail))
}

/**
 * Workspace and session usage, refreshed while the panel is open.
 * @param props - the workspace and session the toolbox opened for.
 * @returns the usage section.
 */
export function UsagePanel(props: UsagePanelProps): ReactElement {
  const [snapshot, setSnapshot] = useState<UsageSnapshotView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) setLoading(true)
    try {
      setSnapshot(await fetchUsage(props.workspaceId, props.sessionId))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [props.workspaceId, props.sessionId])

  useEffect(() => {
    void load(false)
    const timer = window.setInterval(() => { void load(true) }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  if (error !== null && snapshot === null) {
    return createElement('section', { className: 'dshtavern-usage' },
      createElement('div', { className: `${CLASS.bannerError} dshtavern-usage-error` },
        `用量统计未启用或不可用：${error}`,
        createElement('div', { className: 'dshtavern-usage-error-hint' },
          '确认 profile 中已安装并启用 dshtavern-stats 子插件（cordis.patch.yml 的对应行未被禁用）。')),
      createElement('button', {
        type: 'button',
        className: CLASS.button,
        onClick: () => { void load(false) },
      }, '重试'))
  }

  if (snapshot === null) {
    return createElement('section', { className: 'dshtavern-usage' },
      createElement('div', { className: CLASS.hint, style: { padding: '8px 2px' } },
        loading ? '读取用量…' : '暂无用量数据'))
  }

  const totals = snapshot.totals
  const current = snapshot.current
  const context = current?.context
  // The cache meter reports the workspace total: per-session rates are already
  // visible in the session table below.
  const totalHitRate = totals.cacheHitRate
  const contextDetail = context?.usedTokens === undefined
    ? '尚无请求采样'
    : `${formatTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)} tokens`
  const hitDetail = totals.cacheHitRate === undefined
    ? '尚无 prompt token'
    : `缓存读 ${formatTokens(totals.cacheReadTokens)} · 未缓存 ${formatTokens(totals.uncachedInputTokens)}`
  const inputOf = (bucket: { uncachedInputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }): string =>
    formatTokens(bucket.uncachedInputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens)

  return createElement('section', { className: 'dshtavern-usage' },
    createElement('div', { className: 'dshtavern-usage-cards' },
      createElement('div', { className: 'dshtavern-usage-card' },
        createElement('div', { className: 'dshtavern-usage-card-title' }, '工作区总量'),
        createElement('div', { className: 'dshtavern-usage-card-grid' },
          createElement(Metric, {
            label: 'Tokens',
            value: formatTokens(totals.totalTokens),
            hint: `${totals.sessionCount} 个会话`,
          }),
          createElement(Metric, {
            label: '输入 / 输出',
            value: `${inputOf(totals)} / ${formatTokens(totals.outputTokens)}`,
            hint: `缓存写 ${formatTokens(totals.cacheWriteTokens)}`,
          }))),
      createElement('div', { className: 'dshtavern-usage-card' },
        createElement('div', { className: 'dshtavern-usage-card-title' }, '当前会话'),
        createElement('div', { className: 'dshtavern-usage-card-grid' },
          createElement(Metric, {
            label: 'Tokens',
            value: formatTokens(current?.totalTokens),
            hint: current?.title ?? (current === undefined ? '不在本工作区' : '本会话'),
          }),
          createElement(Metric, {
            label: '输入 / 输出',
            value: current === undefined
              ? '—'
              : `${inputOf(current.buckets)} / ${formatTokens(current.buckets.outputTokens)}`,
            hint: current === undefined ? undefined : `缓存读 ${formatTokens(current.buckets.cacheReadTokens)}`,
          })))),

    createElement('div', { className: 'dshtavern-usage-meters' },
      createElement(Meter, {
        label: '上下文使用',
        ratio: context?.ratio,
        value: context?.ratio === undefined ? '—' : formatPercent(context.ratio),
        detail: contextDetail,
      }),
      createElement(Meter, {
        label: '缓存命中率',
        ratio: totalHitRate,
        value: totalHitRate === undefined ? '—' : formatPercent(totalHitRate),
        detail: hitDetail,
      })),

    snapshot.projectionsAvailable
      ? null
      : createElement('div', { className: `${CLASS.bannerNotice} dshtavern-usage-notice` },
        '当前 profile 未注册 token-meter 投影，token 与上下文数据不可用；安装 @deepseek-ai/dsh-token-meter 后重启。'),

    snapshot.sessions.length === 0
      ? createElement('div', { className: 'dshtavern-usage-empty' }, '这个工作区还没有运行中的会话。')
      : createElement('div', { className: 'dshtavern-usage-sessions' },
        createElement('div', { className: 'dshtavern-usage-session-row dshtavern-usage-session-head' },
          createElement('span', { className: 'dshtavern-usage-session-title' }, `会话（${snapshot.sessions.length}）`),
          createElement('span', { className: 'dshtavern-usage-session-cell' }, 'Tokens'),
          createElement('span', { className: 'dshtavern-usage-session-cell' }, '命中'),
          createElement('span', { className: 'dshtavern-usage-session-cell' }, '上下文')),
        snapshot.sessions.map(session => createElement('div', {
          key: session.sessionId,
          className: 'dshtavern-usage-session-row',
          'data-current': session.sessionId === props.sessionId ? 'true' : 'false',
        },
        createElement('span', { className: 'dshtavern-usage-session-title', title: session.sessionId },
          session.title ?? session.sessionId.slice(0, 18)),
        createElement('span', { className: 'dshtavern-usage-session-cell' },
          formatTokens(session.totalTokens)),
        createElement('span', { className: 'dshtavern-usage-session-cell' },
          formatPercent(session.cacheHitRate)),
        createElement('span', { className: 'dshtavern-usage-session-cell' },
          formatPercent(session.context.ratio))))),

    createElement('div', { className: 'dshtavern-usage-foot' },
      createElement('span', null, '仅统计运行中的会话'),
      createElement('span', { className: 'dshtavern-usage-foot-time' },
        `每 10 秒刷新 · 采样于 ${snapshot.generatedAt.replace('T', ' ').slice(11, 19)}`)))
}
