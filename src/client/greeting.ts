/**
 * Pre-chat opening line.
 *
 * A fresh tavern session has an empty transcript, and the first beat only runs
 * after the player speaks. Without this card the card's `greetings.first` would
 * never be seen: the author writes an opening scene, and the player opens to a
 * blank page.
 *
 * The card renders above the composer while the session is still blank. Once the
 * player speaks, the orchestrator stages the same line as history and this card
 * disappears with the blank state.
 */
import { createElement, useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  ensureTaverns,
  matchTavernWorkspaceForSession,
  readToolboxState,
  subscribeToolboxState,
} from './toolbox.js'
import type { WorkspaceSelector } from './toolbox.js'

/** One opening script segment as served by `/tavern/greeting?sessionId=`. */
interface ScriptSegmentView {
  readonly kind: 'narration' | 'speech'
  readonly cardId?: string
  readonly speakerName?: string
  readonly text: string
}

/** What the pre-chat card renders. */
type OpeningView =
  | { readonly kind: 'script'; readonly segments: readonly ScriptSegmentView[] }
  | {
    readonly kind: 'static'
    readonly narration?: { readonly cardId: string; readonly text: string }
    readonly greeting?: { readonly cardId: string; readonly name: string; readonly text: string }
  }

/** Props the session-scoped dock slot supplies. */
export interface GreetingDockProps {
  /** The session this card belongs to. */
  readonly session: { readonly sessionId: string; readonly blank: boolean }
  /** Session-list selector supplying the working directory. */
  readonly useSessions: (selector: (state: { byId: Record<string, { cwd?: string }> }) => unknown) => unknown
  /** Workspace membership, used when a blank session has no cwd summary yet. */
  readonly useWorkspaces?: WorkspaceSelector
}

/**
 * Read the opening for one story.
 *
 * With a session the host generates (once, cached on disk) a full opening
 * script; without one it only reports the static card fields, used as the
 * fallback when no script could be written.
 * @param workspaceId - registered tavern workspace id.
 * @param sessionId - chat identity, so the script belongs to this chat.
 * @returns what the card should render, or `undefined` when there is nothing.
 */
async function fetchOpening(workspaceId: string, sessionId: string | undefined): Promise<OpeningView | undefined> {
  const params = new URLSearchParams({ workspaceId })
  if (sessionId !== undefined && sessionId.length > 0) params.set('sessionId', sessionId)
  const response = await fetch(`/tavern/greeting?${params.toString()}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await response.json() as {
    ok?: unknown
    script?: { segments?: unknown }
    narration?: { cardId?: unknown; text?: unknown }
    greeting?: { cardId?: unknown; name?: unknown; text?: unknown }
  }
  if (body.ok !== true) return undefined

  const rawSegments = Array.isArray(body.script?.segments) ? body.script.segments : []
  const segments: ScriptSegmentView[] = []
  for (const item of rawSegments) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const kind = record.kind === 'speech' ? 'speech' : record.kind === 'narration' ? 'narration' : undefined
    const text = typeof record.text === 'string' ? record.text : ''
    if (kind === undefined || text.trim().length === 0) continue
    segments.push({
      kind,
      text,
      ...(typeof record.cardId === 'string' ? { cardId: record.cardId } : {}),
      ...(typeof record.speakerName === 'string' ? { speakerName: record.speakerName } : {}),
    })
  }
  if (segments.length > 0) return { kind: 'script', segments }

  const narration = typeof body.narration?.text === 'string' && body.narration.text.trim().length > 0
    ? { cardId: String(body.narration.cardId ?? ''), text: body.narration.text }
    : undefined
  const greeting = typeof body.greeting?.text === 'string' && typeof body.greeting.name === 'string'
    && body.greeting.text.trim().length > 0
    ? { cardId: String(body.greeting.cardId ?? ''), name: body.greeting.name, text: body.greeting.text }
    : undefined
  if (narration === undefined && greeting === undefined) return undefined
  return {
    kind: 'static',
    ...(narration === undefined ? {} : { narration }),
    ...(greeting === undefined ? {} : { greeting }),
  }
}

/**
 * Ask the host to run the opening as a real turn.
 *
 * Transcript order is turn order, and only the agent loop can open a turn, so
 * the card cannot insert the opening itself. Queuing it as a trigger turn is
 * what makes the opening appear above the player's first message; the card
 * stays visible until that turn lands.
 * @param workspaceId - registered tavern workspace id.
 * @param sessionId - chat identity.
 * @returns whether a turn was queued.
 */
async function requestOpeningTurn(workspaceId: string, sessionId: string): Promise<boolean> {
  const response = await fetch('/tavern/opening', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ workspaceId, sessionId }),
  })
  const body = await response.json() as { ok?: unknown; queued?: unknown }
  return body.ok === true && body.queued === true
}

/**
 * Show the scene and first line above the composer while the chat is blank.
 * @param props - session identity and blank flag.
 * @returns the card, or `null` when it does not apply.
 */
export function TavernGreetingDock(props: GreetingDockProps): ReactElement | null {
  const summary = props.useSessions(list => list.byId[props.session.sessionId]) as { cwd?: string } | undefined
  const cwd = summary?.cwd
  const sessionWorkspaceId = props.useWorkspaces?.((state) => {
    for (const item of state.items) {
      if (item.sessionIds.some(id => String(id) === props.session.sessionId)) return String(item.workspaceId)
    }
    return undefined
  }) as string | undefined
  const [opening, setOpening] = useState<OpeningView | null>(null)
  const [loading, setLoading] = useState(false)
  const [station, setStation] = useState<{ workspaceId: string } | null>(null)

  // Track the tavern registry so a newly created workspace is recognized without
  // a reload, matching how the toolbox detector behaves.
  const syncStation = useCallback(() => {
    const match = matchTavernWorkspaceForSession(cwd, readToolboxState().taverns, sessionWorkspaceId)
    setStation(match === null ? null : { workspaceId: match.workspaceId })
  }, [cwd, sessionWorkspaceId])

  useEffect(() => {
    ensureTaverns()
    syncStation()
    return subscribeToolboxState(syncStation)
  }, [syncStation])

  useEffect(() => {
    if (station === null) {
      setOpening(null)
      setLoading(false)
      return
    }
    // Generation is a real model call (tens of seconds the first time), so the
    // card reports progress instead of leaving the player staring at nothing.
    let cancelled = false
    setLoading(true)
    fetchOpening(station.workspaceId, props.session.sessionId).then(async (next) => {
      if (cancelled) return
      setOpening(next ?? null)
      // The card is only a preview once the script exists. Queueing the turn is
      // what puts the opening above the player's first message, so it happens
      // here rather than when the player speaks.
      if (next !== undefined) {
        await requestOpeningTurn(station.workspaceId, props.session.sessionId).catch(() => false)
      }
      if (cancelled) return
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setOpening(null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [station, props.session.sessionId])

  if (!props.session.blank) return null

  if (loading) {
    return createElement('section', {
      className: 'dshtavern-greeting dshtavern-greeting-loading',
      'aria-label': '正在生成开场',
      'aria-busy': true,
    },
    createElement('div', { className: 'dshtavern-opening-spinner', 'aria-hidden': true }),
    createElement('div', { className: 'dshtavern-opening-loading-text' },
      createElement('div', { className: 'dshtavern-opening-loading-title' }, '正在生成开场…'),
      createElement('div', { className: 'dshtavern-opening-loading-hint' },
        '首次进入需要一次模型调用，通常十几秒。生成后会存进本会话，之后打开不再重复生成。')))
  }

  if (opening === null) return null

  // Script form: the model wrote the scene and its lines, so each segment keeps
  // its own voice instead of being flattened into one paragraph.
  if (opening.kind === 'script') {
    return createElement('section', {
      className: 'dshtavern-greeting',
      'aria-label': '开场',
    },
    opening.segments.map((segment, index) => {
      if (segment.kind === 'narration') {
        return createElement('p', { key: index, className: 'dshtavern-opening-narration' }, segment.text)
      }
      // Consecutive lines from one speaker read as one turn: the repeated avatar
      // and rule would make a single beat look like two.
      const previous = opening.segments[index - 1]
      const continued = previous?.kind === 'speech' && previous.cardId === segment.cardId
      return createElement('div', {
        key: index,
        className: 'dshtavern-opening-speech',
        'data-continued': continued ? 'true' : 'false',
      },
      createElement('div', { className: 'dshtavern-greeting-head' },
        continued
          ? null
          : createElement('span', { className: 'dshtavern-greeting-avatar', 'aria-hidden': true },
            (segment.speakerName ?? '?').slice(0, 1)),
        createElement('div', { className: 'dshtavern-greeting-title' },
          createElement('span', { className: 'dshtavern-greeting-name' },
            continued ? '（继续）' : segment.speakerName ?? '角色'))),
      createElement('p', { className: 'dshtavern-greeting-text' }, segment.text))
    }),
    createElement('div', { className: 'dshtavern-opening-foot' }, '回应即可开始'))
  }

  return createElement('section', {
    className: 'dshtavern-greeting',
    'aria-label': '开场',
  },
  opening.narration === undefined
    ? null
    : createElement('p', { className: 'dshtavern-opening-narration' }, opening.narration.text),
  opening.greeting === undefined
    ? null
    : createElement('div', { className: 'dshtavern-opening-speech' },
      createElement('div', { className: 'dshtavern-greeting-head' },
        createElement('span', { className: 'dshtavern-greeting-avatar', 'aria-hidden': true },
          opening.greeting.name.slice(0, 1)),
        createElement('div', { className: 'dshtavern-greeting-title' },
          createElement('span', { className: 'dshtavern-greeting-name' }, opening.greeting.name),
          createElement('span', { className: 'dshtavern-greeting-hint' }, '开场白 · 回应即可开始'))),
      createElement('p', { className: 'dshtavern-greeting-text' }, opening.greeting.text)))
}
