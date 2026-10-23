/**
 * Tavern playground toolbox.
 *
 * A floating, draggable launcher lives above the conversation (position is
 * remembered in `localStorage`). Clicking it opens an icon-only popover; a
 * tool tile then opens that tool's page in a separate sub-window. The launcher
 * is only present while the session runs inside a tavern workspace: a hidden
 * detector row in the composer publishes that station.
 *
 * The detector, launcher/popover and sub-window are separate slot
 * registrations in one client bundle, so they share a tiny module store.
 */
import { createElement, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { PANEL_CSS, STORY_CSS, TOOLBOX_CSS } from './styles.js'
import { PromptOrchestration } from './prompt.js'
import { AgentPanel } from './agent.js'
import { CharacterCardTool } from './characters.js'
import { WorldbookWorkbench } from './worldbook.js'
import { UsagePanel } from './stats.js'
import { TrackerPanel } from './tracker.js'
import { installTrackedTurnMarks, refreshTrackedTurns } from './tracked-marks.js'

/** One registered tavern workspace, as served by `/tavern/state`. */
export interface TavernWorkspaceRef {
  readonly workspaceId: string
  readonly workspacePath: string
  readonly workspaceTitle: string
}

/** The station (session) currently published by the composer detector. */
export interface TavernToolboxStation {
  readonly sessionId: string
  readonly workspaceId: string
  readonly workspacePath: string
  readonly workspaceTitle: string
}

/** Tool identities shown by the toolbox. */
export type TavernToolId = 'prompt' | 'agent' | 'characters' | 'worldbooks' | 'usage' | 'tracker' | 'settings'

/** Launcher position in viewport pixels (top-left corner). */
export interface FabPosition {
  readonly left: number
  readonly top: number
}

/** `localStorage` key remembering where the user dragged the launcher. */
export const FAB_POSITION_KEY = 'dshtavern.toolbox.fab.v1'

/** Launcher diameter in pixels. */
export const FAB_SIZE = 44

/** Clearance between the launcher and the viewport edges. */
const FAB_MARGIN = 12

interface ToolboxState {
  readonly station: TavernToolboxStation | null
  readonly taverns: readonly TavernWorkspaceRef[]
  readonly loaded: boolean
  readonly open: boolean
  readonly activeTool: TavernToolId | null
}

let state: ToolboxState = {
  station: null,
  taverns: [],
  loaded: false,
  open: false,
  activeTool: null,
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function snapshot(): ToolboxState {
  return state
}

let fetching = false

/** Refresh the tavern workspace list used to recognize a tavern session. */
export function ensureTaverns(force = false): void {
  if (fetching) return
  if (!force && state.loaded) return
  fetching = true
  fetch('/tavern/state', { headers: { accept: 'application/json' }, cache: 'no-store' })
    .then(async response => {
      const body = await response.json() as {
        taverns?: Array<{ workspaceId?: unknown; path?: unknown; title?: unknown }>
      }
      const taverns: TavernWorkspaceRef[] = []
      for (const tavern of Array.isArray(body.taverns) ? body.taverns : []) {
        if (typeof tavern.workspaceId !== 'string' || typeof tavern.path !== 'string') continue
        taverns.push({
          workspaceId: tavern.workspaceId,
          workspacePath: tavern.path,
          workspaceTitle: typeof tavern.title === 'string' ? tavern.title : tavern.path,
        })
      }
      const changed = JSON.stringify(taverns) !== JSON.stringify(state.taverns)
      state = { ...state, taverns, loaded: true }
      if (changed) notify()
    })
    .catch(() => {
      state = { ...state, loaded: true }
      notify()
    })
    .finally(() => { fetching = false })
}

/**
 * Match a session working directory to a registered tavern workspace.
 *
 * The match is exact (D004): only a session whose cwd is the tavern directory
 * itself is a tavern session. The host applies the same rule when it decides
 * whether to intercept a request, so the toolbox never offers tools for a
 * session the host would not orchestrate.
 * @param cwd - session working directory.
 * @param taverns - registered tavern workspaces.
 * @returns the tavern whose directory is the cwd, or `null`.
 */
export function matchTavernWorkspace(
  cwd: string | undefined,
  taverns: readonly TavernWorkspaceRef[],
): TavernWorkspaceRef | null {
  if (cwd === undefined || cwd.length === 0) return null
  const normalized = normalizeDirectory(cwd)
  for (const tavern of taverns) {
    if (normalized === normalizeDirectory(tavern.workspacePath)) return tavern
  }
  return null
}

/** Normalise a directory for comparison (separators, trailing slash, case). */
function normalizeDirectory(directory: string): string {
  return directory.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

/**
 * Keep the launcher fully inside the viewport.
 * @param position - wanted top-left corner.
 * @param width - viewport width.
 * @param height - viewport height.
 * @returns a clamped position.
 */
export function clampFabPosition(position: FabPosition, width: number, height: number): FabPosition {
  const maxLeft = Math.max(FAB_MARGIN, width - FAB_SIZE - FAB_MARGIN)
  const maxTop = Math.max(FAB_MARGIN, height - FAB_SIZE - FAB_MARGIN)
  return {
    left: Math.min(Math.max(FAB_MARGIN, position.left), maxLeft),
    top: Math.min(Math.max(FAB_MARGIN, position.top), maxTop),
  }
}

/**
 * Default launcher seat: the left gutter, above the composer.
 * @param width - viewport width.
 * @param height - viewport height.
 * @returns a clamped position that clears the composer.
 */
export function defaultFabPosition(width: number, height: number): FabPosition {
  return clampFabPosition({
    left: FAB_MARGIN,
    top: height - 190,
  }, width, height)
}

/** Read the remembered launcher position, falling back to the default seat. */
export function loadFabPosition(): FabPosition {
  if (typeof window === 'undefined') return defaultFabPosition(1280, 800)
  try {
    const raw = window.localStorage.getItem(FAB_POSITION_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown }
      if (typeof parsed.left === 'number' && typeof parsed.top === 'number'
        && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
        return clampFabPosition({ left: parsed.left, top: parsed.top }, window.innerWidth, window.innerHeight)
      }
    }
  } catch {
    // A malformed or unavailable store falls back to the default seat.
  }
  return defaultFabPosition(window.innerWidth, window.innerHeight)
}

/** Remember the launcher position for the next page load. */
export function saveFabPosition(position: FabPosition): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(position))
  } catch {
    // Storage may be unavailable; the launcher still works for this session.
  }
}

/** Publish the station whose detector is mounted. */
export function publishStation(station: TavernToolboxStation | null): void {
  const current = state.station
  const same = current === station
    || (current !== null && station !== null
      && current.sessionId === station.sessionId
      && current.workspaceId === station.workspaceId)
  if (same) return
  state = {
    ...state,
    station,
    ...(station === null ? { open: false, activeTool: null } : {}),
  }
  notify()
}

/** Open or close the icon popover. */
export function setToolboxOpen(open: boolean): void {
  if (state.open === open) return
  state = { ...state, open }
  notify()
}

/** Open one tool sub-window, or close it with `null`. */
export function setActiveTool(tool: TavernToolId | null): void {
  if (state.activeTool === tool) return
  state = { ...state, activeTool: tool, open: false }
  notify()
}

/** Read the current store snapshot (tests and the surfaces). */
export function readToolboxState(): ToolboxState {
  return state
}

/**
 * Subscribe to store changes, including the tavern workspace list.
 * @param listener - called after every state change.
 * @returns the unsubscribe function.
 */
export function subscribeToolboxState(listener: () => void): () => void {
  return subscribe(listener)
}

/** Standard props the composer-left slot provides to the detector. */
export interface ToolboxDetectorProps {
  readonly sessionId: string
  readonly useSessions: (selector: (state: { byId: Record<string, { cwd?: string }> }) => unknown) => unknown
}

/**
 * Invisible composer row: publishes the current session's tavern station so
 * the floating launcher can appear only in tavern sessions.
 * @param props - session id and the session-list selector hook.
 * @returns `null` (the row renders nothing).
 */
export function TavernToolboxDetector(props: ToolboxDetectorProps): null {
  const toolbox = useSyncExternalStore(subscribe, snapshot, snapshot)
  const summary = props.useSessions(list => list.byId[props.sessionId]) as { cwd?: string } | undefined
  const cwd = summary?.cwd

  useEffect(() => {
    ensureTaverns()
    const timer = window.setInterval(() => { ensureTaverns(true) }, 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const match = matchTavernWorkspace(cwd, toolbox.taverns)
    if (match === null) {
      publishStation(null)
      return
    }
    publishStation({
      sessionId: props.sessionId,
      workspaceId: match.workspaceId,
      workspacePath: match.workspacePath,
      workspaceTitle: match.workspaceTitle,
    })
    return () => publishStation(null)
  }, [cwd, props.sessionId, toolbox.taverns])

  // Mark the document while a tavern session is on screen. The story stylesheet
  // keys off this attribute, so narration and speech styling never reaches an
  // ordinary coding conversation.
  useEffect(() => {
    const root = document.body
    const active = toolbox.station !== null && toolbox.station.sessionId === props.sessionId
    if (active) root.dataset.dshtavernStory = 'true'
    else delete root.dataset.dshtavernStory
    return () => { delete root.dataset.dshtavernStory }
  }, [toolbox.station, props.sessionId])

  // The stylesheet lives in the document, not in this row's render output: the
  // conversation renders elsewhere in the tree and must be styled from outside.
  useEffect(() => {
    const id = 'dshtavern-story-style'
    if (document.getElementById(id) !== null) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = STORY_CSS
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])

  // Mark the turns the tracker has already summarised. The rail is virtualized
  // and offers no slot, so this observes it; a profile without the tracker row
  // simply never gets the route and leaves the rail unmarked.
  useEffect(() => {
    const stop = installTrackedTurnMarks(props.sessionId)
    return () => { stop() }
  }, [props.sessionId])

  useEffect(() => {
    const station = toolbox.station
    if (station === null) return
    void refreshTrackedTurns(station.workspaceId, props.sessionId)
    const timer = window.setInterval(() => {
      void refreshTrackedTurns(station.workspaceId, props.sessionId)
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [toolbox.station, props.sessionId])

  return null
}

interface ToolEntry {
  readonly id: TavernToolId
  readonly glyph: string
  readonly label: string
  readonly enabled: boolean
}

const TOOLS: readonly ToolEntry[] = [
  { id: 'prompt', glyph: '编', label: '提示词编排', enabled: true },
  { id: 'agent', glyph: '演', label: 'Agent 编排', enabled: true },
  { id: 'characters', glyph: '卡', label: '角色卡', enabled: true },
  { id: 'worldbooks', glyph: '书', label: '世界书', enabled: true },
  { id: 'usage', glyph: '量', label: '用量统计', enabled: true },
  { id: 'tracker', glyph: '追', label: '剧情追踪', enabled: true },
  { id: 'settings', glyph: '设', label: '设置', enabled: false },
]

/** Launcher glyph: a toolbox outline, drawn as artwork. */
function LauncherIcon(): ReactElement {
  return createElement('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': true,
  },
  createElement('rect', { x: 3.5, y: 9, width: 17, height: 9.5, rx: 2.2 }),
  createElement('path', { d: 'M9 9V7.2A1.2 1.2 0 0 1 10.2 6h3.6A1.2 1.2 0 0 1 15 7.2V9' }),
  createElement('path', { d: 'M3.5 13h17' }),
  createElement('path', { d: 'M10.2 13v1.8h3.6V13' }))
}

/** Width of one popover tile, matching the CSS grid column. */
const TOOL_TILE_WIDTH = 78

/** Height of one popover tile, matching the CSS tile height. */
const TOOL_TILE_HEIGHT = 64

/** Popover padding and gap, matching the CSS. */
const TOOL_POPOVER_PADDING = 10
const TOOL_POPOVER_GAP = 6

/**
 * Popover size for the registered tool count.
 *
 * The anchor math needs the real box, and the tile count is what the grid
 * wraps on, so both derive from {@link TOOLS} instead of a hardcoded box that
 * goes stale whenever a tool is added.
 * @returns the popover's width and height in CSS pixels.
 */
export function toolPopoverSize(): { width: number; height: number } {
  const columns = 2
  const rows = Math.ceil(TOOLS.length / columns)
  return {
    width: columns * TOOL_TILE_WIDTH + (columns - 1) * TOOL_POPOVER_GAP + TOOL_POPOVER_PADDING * 2,
    height: rows * TOOL_TILE_HEIGHT + (rows - 1) * TOOL_POPOVER_GAP + TOOL_POPOVER_PADDING * 2,
  }
}

/** Icon popover anchored to the launcher. */
function ToolboxPopover(position: FabPosition): ReactElement | null {
  if (!state.open || state.station === null) return null
  const { width, height } = toolPopoverSize()
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight
  const left = Math.min(Math.max(8, position.left + FAB_SIZE / 2 - width / 2), viewportWidth - width - 8)
  let top = position.top - height - 10
  if (top < 8) top = Math.min(position.top + FAB_SIZE + 10, viewportHeight - height - 8)
  return createElement('div', {
    className: 'dshtavern-tool-popover',
    role: 'toolbar',
    'aria-label': '酒馆工具箱',
    style: { left, top },
  },
  TOOLS.map(tool => createElement('button', {
    key: tool.id,
    type: 'button',
    className: 'dshtavern-tool-launch',
    title: tool.enabled ? tool.label : `${tool.label}（待实现）`,
    'aria-label': tool.label,
    disabled: !tool.enabled,
    onClick: () => setActiveTool(tool.id),
  },
  createElement('span', { className: 'dshtavern-tool-launch-glyph', 'aria-hidden': true }, tool.glyph),
  createElement('span', { className: 'dshtavern-tool-launch-label' }, tool.label))))
}

/** Tool sub-window. */
function ToolWindow(): ReactElement | null {
  const station = state.station
  const tool = state.activeTool
  if (station === null || tool === null) return null
  const entry = TOOLS.find(item => item.id === tool)
  return createElement('div', {
    className: 'dshtavern-panel dshtavern-window-layer',
    onClick: (event: { target: unknown; currentTarget: unknown }) => {
      if (event.target === event.currentTarget) setActiveTool(null)
    },
  },
  createElement('section', {
    className: 'dshtavern-window',
    role: 'dialog',
    'aria-label': entry?.label ?? tool,
  },
  createElement('header', { className: 'dshtavern-window-head' },
    createElement('span', { className: 'dshtavern-window-glyph', 'aria-hidden': true }, entry?.glyph ?? '工'),
    createElement('div', { style: { flex: 1, minWidth: 0 } },
      createElement('div', { className: 'dshtavern-window-title' },
        `${entry?.label ?? tool} · ${station.workspaceTitle}`),
      createElement('div', { className: 'dshtavern-window-sub', title: station.workspacePath },
        station.workspacePath)),
    createElement('button', {
      type: 'button',
      className: 'dshtavern-window-close',
      title: '关闭',
      'aria-label': '关闭',
      onClick: () => setActiveTool(null),
    }, '✕')),
  createElement('div', { className: 'dshtavern-window-body' },
    tool === 'prompt'
      ? createElement(PromptOrchestration, {
        workspaceId: station.workspaceId,
        workspaceTitle: station.workspaceTitle,
        workspacePath: station.workspacePath,
        sessionId: station.sessionId,
      })
      : tool === 'agent'
        ? createElement(AgentPanel, {
          workspaceId: station.workspaceId,
          workspaceTitle: station.workspaceTitle,
          workspacePath: station.workspacePath,
        })
        : tool === 'characters'
        ? createElement(CharacterCardTool, {
          workspaceId: station.workspaceId,
          workspaceTitle: station.workspaceTitle,
          workspacePath: station.workspacePath,
        })
        : tool === 'worldbooks'
          ? createElement(WorldbookWorkbench, {
            workspaceId: station.workspaceId,
            workspaceTitle: station.workspaceTitle,
            workspacePath: station.workspacePath,
          })
          : tool === 'usage'
            ? createElement(UsagePanel, {
              workspaceId: station.workspaceId,
              workspaceTitle: station.workspaceTitle,
              workspacePath: station.workspacePath,
              sessionId: station.sessionId,
            })
            : tool === 'tracker'
              ? createElement(TrackerPanel, {
                workspaceId: station.workspaceId,
                workspaceTitle: station.workspaceTitle,
                workspacePath: station.workspacePath,
                sessionId: station.sessionId,
              })
              : createElement('div', { style: { padding: 20 } }, '该工具尚未实现。'))))
}

/** How far the pointer must travel before a press becomes a drag. */
export const LAUNCHER_DRAG_THRESHOLD_PX = 4

/**
 * Whether a launcher gesture counts as a drag.
 *
 * Sticky on purpose: once a gesture has crossed the threshold it stays a drag
 * even if the pointer returns to its origin, otherwise releasing where the
 * press started would produce a click and open the popover mid-drag.
 * @param moved - whether this gesture already crossed the threshold.
 * @param startX - press position, viewport pixels.
 * @param startY - press position, viewport pixels.
 * @param clientX - current pointer position.
 * @param clientY - current pointer position.
 * @returns whether the gesture is a drag.
 */
export function launcherGestureMoved(
  moved: boolean,
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
): boolean {
  return moved || Math.hypot(clientX - startX, clientY - startY) >= LAUNCHER_DRAG_THRESHOLD_PX
}

/**
 * Frame-wide toolbox: the draggable launcher, its icon popover, and the tool
 * sub-window. Renders nothing outside tavern sessions.
 * @returns the overlay elements, or `null`.
 */
export function TavernToolboxOverlay(): ReactElement | null {
  const toolbox = useSyncExternalStore(subscribe, snapshot, snapshot)
  const [position, setPosition] = useState<FabPosition>(() => loadFabPosition())
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    originLeft: number
    originTop: number
    moved: boolean
    /** Element holding pointer capture, once a drag actually started. */
    capture: {
      setPointerCapture?(pointerId: number): void
      releasePointerCapture?(pointerId: number): void
    } | null
    /** Latest position this gesture moved the launcher to. */
    latest: FabPosition
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  /**
   * Whether the gesture that just ended moved the launcher.
   *
   * Cleared at pointerdown, not only in the click handler: a gesture whose
   * pointerup lands outside the button produces no click, and a flag left set
   * would swallow the next real click.
   */
  const dragged = useRef(false)

  useEffect(() => {
    const onResize = () => {
      setPosition(current => clampFabPosition(current, window.innerWidth, window.innerHeight))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!toolbox.open && toolbox.activeTool === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (state.activeTool !== null) setActiveTool(null)
      else setToolboxOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolbox.open, toolbox.activeTool])

  if (toolbox.station === null) return null

  const onPointerDown = (event: {
    pointerId: number
    clientX: number
    clientY: number
    currentTarget: { setPointerCapture?(pointerId: number): void }
  }) => {
    // A new gesture starts unclaimed; see the `dragged` ref comment.
    dragged.current = false
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: position.left,
      originTop: position.top,
      moved: false,
      capture: null,
      latest: { left: position.left, top: position.top },
    }
    setDragging(true)
  }

  const onPointerMove = (event: {
    pointerId: number
    clientX: number
    clientY: number
    currentTarget: { setPointerCapture?(pointerId: number): void }
  }) => {
    const current = drag.current
    if (current === null) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.moved) {
      if (!launcherGestureMoved(false, current.startX, current.startY, event.clientX, event.clientY)) return
      current.moved = true
      dragged.current = true
      // Capture only once the gesture is a drag. Capturing on pointerdown
      // retargets the whole click to the button, which is what let a few pixels
      // of pointer jitter turn a click into a drag.
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
        current.capture = event.currentTarget
      } catch {
        // Dragging still works; only pointer capture outside the button is lost.
      }
    }
    const next = clampFabPosition(
      { left: current.originLeft + dx, top: current.originTop + dy },
      window.innerWidth,
      window.innerHeight,
    )
    current.latest = next
    setPosition(next)
  }

  const onPointerUp = () => {
    const current = drag.current
    drag.current = null
    setDragging(false)
    if (current === null) return
    if (current.capture?.releasePointerCapture !== undefined) {
      try {
        current.capture.releasePointerCapture(current.pointerId)
      } catch {
        // The pointer is already gone; capture released itself.
      }
    }
    if (!current.moved) return
    // A completed drag suppresses the click that follows the pointerup, so
    // dropping the launcher never also opens the popover. Persist the position
    // this gesture actually reached: `position` in this closure is the value
    // from the render that started the drag.
    saveFabPosition(current.latest)
  }

  return createElement('div', null,
    createElement('style', { key: 'dshtavern-toolbox-style' }, PANEL_CSS + TOOLBOX_CSS),
    toolbox.open
      ? createElement('div', {
        className: 'dshtavern-fab-backdrop',
        onClick: () => setToolboxOpen(false),
      })
      : null,
    createElement('button', {
      type: 'button',
      className: 'dshtavern-fab',
      title: '酒馆工具箱（可拖动）',
      'aria-label': '酒馆工具箱',
      'aria-expanded': toolbox.open,
      'data-dragging': dragging,
      'data-open': toolbox.open,
      style: { left: position.left, top: position.top },
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClick: () => {
        if (dragged.current) {
          dragged.current = false
          return
        }
        setToolboxOpen(!state.open)
      },
    },
    LauncherIcon()),
    ToolboxPopover(position),
    ToolWindow())
}
