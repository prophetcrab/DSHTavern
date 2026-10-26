/**
 * DSH-Tavern browser half: the tavern panel, sidebar entry, and toolbox seats.
 *
 * Registers the sidebar entry and the main panel. The panel lists registered
 * tavern workspaces, creates a new tavern (directory + marker + DSH workspace
 * registration) and can adopt an existing workspace; the Host half owns every
 * filesystem and registry mutation behind `/tavern/*` JSON routes.
 *
 * This bundle also registers the invisible composer detector and the frame
 * overlay that together draw the in-session toolbox.
 *
 * Typography and spacing scale through `--tv-scale`, raised by media queries so
 * 2K/4K viewports get larger text instead of the same 13px as a 1080p window.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { CLASS, PANEL_CSS } from './styles.js'
import { installTavernWorkspaceMarks } from './marks.js'
import { TavernGreetingDock } from './greeting.js'
import { TavernTurnActions } from './regenerate.js'
import { TavernTurnImage } from './turn-image.js'
import { installTavernBeatRecords } from './beat-record.js'
import { TavernToolboxDetector } from './toolbox.js'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'tavern' as MainPanelId

/** Required client services: the slot registry. */
export const inject = ['slots']

/** Durable identity written into `<workspace>/.dshtavern/tavern.json`. */
export interface TavernMarkerView {
  readonly schema: number
  readonly kind: 'dshtavern'
  readonly tavernId: string
  readonly createdAt: string
  readonly title?: string
  /** Running mode chosen before creation; absent on older markers means role-play. */
  readonly mode?: TavernModeView
}

/** The two tavern run modes shown on the creation page. */
export type TavernModeView = 'rp' | 'novel'

/** Human-facing label for one mode. */
export const MODE_LABELS: Record<TavernModeView, string> = {
  rp: '角色扮演',
  novel: '小说模式',
}

/** One registered tavern workspace. */
export interface TavernView {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly marker: TavernMarkerView
}

/**
 * The panel's read model, served by `GET /tavern/state`.
 *
 * `workspaces` is still served, for callers that want to know which registered
 * directories are not taverns; the panel itself only renders the tavern list.
 */
export interface Overview {
  readonly defaultRoot: string
  readonly taverns: readonly TavernView[]
  readonly workspaces: readonly { readonly id: string; readonly path: string; readonly title: string; readonly tavern: boolean }[]
}

/**
 * Component-scoped stylesheet. The whole page is one card: header, tavern list,
 * create and adopt forms live inside it, separated by dividers instead of
 * separate cards. Media queries raise the whole type scale on large screens.
 */


/** One action button. */
function Button(props: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}): ReactElement {
  return createElement('button', {
    type: 'button',
    className: props.className ?? CLASS.button,
    onClick: props.onClick,
    disabled: props.disabled === true,
  }, props.label)
}

/** A section heading with an optional count. */
function SectionTitle(props: { text: string; count?: number }): ReactElement {
  return createElement('div', { className: CLASS.sectionTitle },
    createElement('span', null, props.text),
    props.count === undefined ? null : createElement('span', { className: CLASS.count }, String(props.count)))
}

/** Format one ISO instant for display; keep the raw text when unparsable. */
function formatInstant(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('T', ' ').slice(0, 16)
}

/** Props of the pure panel view; the container supplies state and callbacks. */
export interface PanelViewProps {
  overview: Overview | null
  loading: boolean
  busy: boolean
  error: string | null
  notice: string | null
  draftTitle: string
  draftPath: string
  draftMode: TavernModeView
  lastRefreshed: string | null
  onTitleChange: (value: string) => void
  onPathChange: (value: string) => void
  onModeChange: (value: TavernModeView) => void
  onCreate: () => void
  onRefresh: () => void
  onSubmitShortcut: () => void
}

/** Card head: title, subtitle, last refresh, refresh control. */
function CardHead(props: PanelViewProps): ReactElement {
  return createElement('header', { className: CLASS.cardHead },
    createElement('div', { className: CLASS.headMain },
      createElement('div', { className: CLASS.title }, '酒馆'),
      createElement('div', { className: CLASS.subtitle },
        '一个酒馆工作区 = 一个目录 + 一个酒馆标记；其中的聊天是 DSH 会话。')),
    createElement('div', { className: CLASS.headSide },
      props.lastRefreshed === null
        ? null
        : createElement('span', { className: CLASS.meta }, `最近刷新 ${props.lastRefreshed}`),
      Button({
        label: props.loading ? '加载中…' : '刷新',
        className: props.loading ? CLASS.buttonPulse : undefined,
        onClick: props.onRefresh,
        disabled: props.loading || props.busy,
      })))
}

/** Error and success banners, or `null` when there is nothing to show. */
function CardBanners(props: PanelViewProps): ReactElement | null {
  if (props.error === null && props.notice === null) return null
  return createElement('div', { className: CLASS.banners },
    props.error === null
      ? null
      : createElement('div', { className: CLASS.bannerError },
        createElement('span', null, props.error),
        createElement('span', { className: CLASS.bannerAction },
          Button({ label: '重试', onClick: props.onRefresh, disabled: props.loading || props.busy }))),
    props.notice === null
      ? null
      : createElement('div', { className: CLASS.bannerNotice }, props.notice))
}

/** One tavern workspace row. */
function TavernRow(tavern: TavernView, index: number): ReactElement {
  return createElement('div', {
    key: tavern.workspaceId,
    className: CLASS.row,
    style: { animationDelay: `${Math.min(index, 8) * 35}ms` },
  },
  createElement('div', { className: CLASS.rowMain },
    createElement('div', { className: CLASS.name }, tavern.title),
    createElement('div', { className: CLASS.path, title: tavern.path }, tavern.path),
    createElement('div', { className: CLASS.hint },
      `tavernId ${tavern.marker.tavernId.slice(0, 8)} · ${MODE_LABELS[tavern.marker.mode ?? 'rp']} · 创建于 ${formatInstant(tavern.marker.createdAt)}`)))
}

/** The tavern workspace list pane. */
function TavernListPane(props: PanelViewProps, taverns: readonly TavernView[]): ReactElement {
  return createElement('section', { className: CLASS.pane },
    SectionTitle({ text: '酒馆工作区', count: taverns.length }),
    taverns.length === 0
      ? createElement('div', { className: CLASS.hint },
        '还没有酒馆工作区。在右侧新建表单里填一个名称就能创建。')
      : createElement('div', null, taverns.map((tavern, index) => TavernRow(tavern, index))))
}

/** Mode picker shared by creation and adoption. */
function ModePicker(props: PanelViewProps): ReactElement {
  return createElement('div', { className: 'dshtavern-mode-picker', role: 'radiogroup', 'aria-label': '酒馆模式' },
    (['rp', 'novel'] as const).map(mode => createElement('button', {
      key: mode,
      type: 'button',
      className: 'dshtavern-mode-option',
      'data-active': props.draftMode === mode,
      role: 'radio',
      'aria-checked': props.draftMode === mode,
      onClick: () => props.onModeChange(mode),
      disabled: props.busy,
    },
    createElement('span', { className: 'dshtavern-mode-name' }, MODE_LABELS[mode]),
    createElement('span', { className: 'dshtavern-mode-desc' },
      mode === 'rp' ? '以角色卡身份对话' : '叙述式写作（提示词块待实现）'))))
}

/** The create form, one group inside the right pane. */
function CreateGroup(props: PanelViewProps, canCreate: boolean, defaultRoot: string): ReactElement {
  const onKeyDown = (event: { key: string }) => {
    if (event.key === 'Enter' && canCreate) props.onSubmitShortcut()
  }
  return createElement('section', { className: CLASS.group },
    SectionTitle({ text: '新建酒馆' }),
    createElement('div', { className: CLASS.form },
      createElement('div', { className: CLASS.field },
        createElement('span', { className: CLASS.label }, '模式（创建后不可更改）'),
        ModePicker(props)),
      createElement('label', { className: CLASS.field },
        createElement('span', { className: CLASS.label }, '名称'),
        createElement('input', {
          className: CLASS.input,
          value: props.draftTitle,
          placeholder: '例如：雾都夜话',
          onChange: (event: { target: { value: string } }) => props.onTitleChange(event.target.value),
          onKeyDown,
        })),
      createElement('label', { className: CLASS.field },
        createElement('span', { className: CLASS.label }, '目录（可选，默认自动创建）'),
        createElement('input', {
          className: CLASS.input,
          value: props.draftPath,
          placeholder: defaultRoot === '' ? '接受绝对路径，留空则自动创建' : `留空则创建到 ${defaultRoot}/<名称>`,
          onChange: (event: { target: { value: string } }) => props.onPathChange(event.target.value),
          onKeyDown,
        })),
      createElement('div', { className: CLASS.hint },
        '创建时会依次：创建目录 → 原子写入 .dshtavern/tavern.json → 注册为 DSH 工作区。'),
      createElement('div', { className: CLASS.formActions },
        Button({
          label: props.busy ? '处理中…' : '创建酒馆',
          className: CLASS.buttonPrimary,
          onClick: props.onCreate,
          disabled: !canCreate,
        }))))
}

/**
 * Render the panel body without hooks, so it stays unit-testable.
 * @param props - read model and action callbacks.
 * @returns the panel element tree.
 */
export function PanelView(props: PanelViewProps): ReactElement {
  const overview = props.overview
  const taverns = overview?.taverns ?? []
  const defaultRoot = overview?.defaultRoot ?? ''
  const canCreate = !props.busy
    && (props.draftTitle.trim().length > 0 || props.draftPath.trim().length > 0)

  return createElement('div', { className: CLASS.panel },
    createElement('style', { key: 'dshtavern-style' }, PANEL_CSS),
    createElement('article', { className: CLASS.card },
      CardHead(props),
      CardBanners(props),
      createElement('div', { className: CLASS.cardBody },
        TavernListPane(props, taverns),
        createElement('section', { className: CLASS.pane },
          CreateGroup(props, canCreate, defaultRoot))),
      createElement('footer', { className: CLASS.cardFoot },
        createElement('div', { className: CLASS.hint },
          '标识文件只随目录走；删除工作区注册不会删除目录，重新添加同一目录时会自动恢复为酒馆。'))))
}

/** Read failure as display text. */
function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Parse one JSON response, reporting a missing route as an actionable message. */
async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`酒馆接口不可用（HTTP ${response.status}）：插件可能尚未重新加载`)
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

/** Fetch the panel read model. */
async function fetchOverview(): Promise<Overview> {
  const response = await fetch('/tavern/state', {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  return (await readJsonResponse(response)) as unknown as Overview
}

/** POST one tavern action and return the raw success body. */
async function postTavern(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  return await readJsonResponse(response)
}

/** Current wall-clock label for the "recently refreshed" indicator. */
function clockLabel(): string {
  return new Date().toTimeString().slice(0, 8)
}

/**
 * Stateful container: owns the read model, the form draft, and the request
 * lifecycle; renders {@link PanelView}.
 *
 * The read model refreshes on mount, every few seconds while the page is
 * visible, when the window regains focus, and after every successful action, so
 * a workspace created elsewhere no longer leaves the panel stale.
 * @returns the panel element tree.
 */
export function TavernPanel(): ReactElement {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftPath, setDraftPath] = useState('')
  const [draftMode, setDraftMode] = useState<TavernModeView>('rp')
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const next = await fetchOverview()
      setOverview(next)
      setError(null)
      setLastRefreshed(clockLabel())
    } catch (cause) {
      if (!quiet) setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // A tavern can be created or removed outside this panel; keep the list live.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true)
    }, 4000)
    const onFocus = () => { void refresh(true) }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  const run = useCallback(async (operation: () => Promise<string>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const message = await operation()
      await refresh(true)
      setNotice(message)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const onCreate = useCallback(() => {
    if (draftTitle.trim().length === 0 && draftPath.trim().length === 0) return
    void run(async () => {
      const body = await postTavern('/tavern/create', {
        title: draftTitle.trim(),
        path: draftPath.trim(),
        mode: draftMode,
      })
      const tavern = body.tavern as TavernView | undefined
      setDraftTitle('')
      setDraftPath('')
      return `已创建${MODE_LABELS[draftMode]}酒馆工作区「${tavern?.title ?? draftTitle.trim()}」`
    })
  }, [draftMode, draftPath, draftTitle, run])

  return createElement(PanelView, {
    overview,
    loading,
    busy,
    error,
    notice,
    draftTitle,
    draftPath,
    draftMode,
    lastRefreshed,
    onTitleChange: setDraftTitle,
    onPathChange: setDraftPath,
    onModeChange: setDraftMode,
    onCreate,
    onRefresh: () => { void refresh() },
    onSubmitShortcut: onCreate,
  })
}

/** Sidebar glyph for the tavern entry. */
function TavernIcon({ size, active }: { size: number; active: boolean }): ReactElement {
  return createElement('span', {
    'aria-hidden': true,
    style: {
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: 8,
      fontSize: Math.round(size * 0.5),
      fontWeight: 600,
      color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
      background: active ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
    },
  }, '酒')
}

/**
 * Contribute the Tavern sidebar row and its main panel.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, TavernPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 0,
    label: '酒馆',
  }, TavernIcon))
  // The toolbox belongs to a tavern *session*: the composer-left detector
  // publishes that station and renders the fixed launcher, its popover, and
  // each tool's sub-window. Rendering from the mounted session row (rather
  // than shell.overlay) keeps the toolbox present in the blank New Session
  // hero, where the shell overlay seat is not mounted.
  const composerLeftSlot = 'conversation.input.left' as never
  ctx.slots.inject(composerLeftSlot, () => ctx.slots.register({
    name: composerLeftSlot,
    id: 'tavern-toolbox',
    order: -5,
    label: '酒馆工具箱',
  } as never, TavernToolboxDetector as never))
  // The opening line a blank tavern chat shows above its composer. It is a
  // session-scoped dock entry so it appears only inside a real chat, and it
  // renders nothing once the player has spoken.
  const greetingDock = 'conversation.input.dock' as never
  ctx.slots.inject(greetingDock, () => ctx.slots.register({
    name: greetingDock,
    id: 'tavern-greeting',
    order: -10,
    label: '酒馆开场白',
  } as never, TavernGreetingDock as never))
  // Regeneration belongs to a reply, not to the toolbox: the action sits under
  // the newest completed turn and the superseded marker replaces it once a
  // replacement lands.
  const turnTail = 'conversation.chat.turnTail' as never
  ctx.slots.inject(turnTail, () => ctx.slots.register({
    name: turnTail,
    id: 'tavern-regenerate',
    order: 0,
    label: '酒馆重新生成',
  } as never, TavernTurnActions as never))
  // Scene images and the per-turn prompt workshop sit beside regeneration;
  // both are sidecar state, never part of the assistant message.
  ctx.slots.inject(turnTail, () => ctx.slots.register({
    name: turnTail,
    id: 'tavern-image',
    order: -1,
    label: '酒馆生图',
  } as never, TavernTurnImage as never))
  // Mark tavern workspaces in the sidebar list. The sidebar exposes no slot for
  // a workspace row, so this observes the rendered rows instead.
  ctx.effect(() => installTavernWorkspaceMarks(), 'dshtavern: sidebar workspace marks')
  // Contribute one Trajectory row per beat. The orchestrator builds its own
  // model requests, so without this the prompts that actually decided each
  // reply would never appear in the log the trajectory view reads.
  installTavernBeatRecords(ctx)
}
