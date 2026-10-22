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
import { matchTavernWorkspace, subscribeToolboxState, readToolboxState, ensureTaverns } from './toolbox.js'

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
 * Show the scene and first line above the composer while the chat is blank.
 * @param props - session identity and blank flag.
 * @returns the card, or `null` when it does not apply.
 */
export function TavernGreetingDock(props: GreetingDockProps): ReactElement | null {
  const summary = props.useSessions(list => list.byId[props.session.sessionId]) as { cwd?: string } | undefined
  const cwd = summary?.cwd
  const [opening, setOpening] = useState<OpeningView | null>(null)
  const [station, setStation] = useState<{ workspaceId: string } | null>(null)

  // Track the tavern registry so a newly created workspace is recognized without
  // a reload, matching how the toolbox detector behaves.
  const syncStation = useCallback(() => {
    const match = matchTavernWorkspace(cwd, readToolboxState().taverns)
    setStation(match === null ? null : { workspaceId: match.workspaceId })
  }, [cwd])

  useEffect(() => {
    ensureTaverns()
    syncStation()
    return subscribeToolboxState(syncStation)
  }, [syncStation])

  useEffect(() => {
    if (station === null) {
      setOpening(null)
      return
    }
    let cancelled = false
    fetchOpening(station.workspaceId, props.session.sessionId).then((next) => {
      if (!cancelled) setOpening(next ?? null)
    }).catch(() => {
      if (!cancelled) setOpening(null)
    })
    return () => { cancelled = true }
  }, [station, props.session.sessionId])

  if (!props.session.blank || opening === null) return null

  // Script form: the model wrote the scene and its lines, so each segment keeps
  // its own voice instead of being flattened into one paragraph.
  if (opening.kind === 'script') {
    return createElement('section', {
      className: 'dshtavern-greeting',
      'aria-label': '开场',
    },
    opening.segments.map((segment, index) => segment.kind === 'narration'
      ? createElement('p', { key: index, className: 'dshtavern-opening-narration' }, segment.text)
      : createElement('div', { key: index, className: 'dshtavern-opening-speech' },
        createElement('div', { className: 'dshtavern-greeting-head' },
          createElement('span', { className: 'dshtavern-greeting-avatar', 'aria-hidden': true },
            (segment.speakerName ?? '?').slice(0, 1)),
          createElement('div', { className: 'dshtavern-greeting-title' },
            createElement('span', { className: 'dshtavern-greeting-name' }, segment.speakerName ?? '角色'))),
        createElement('p', { className: 'dshtavern-greeting-text' }, segment.text))),
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
