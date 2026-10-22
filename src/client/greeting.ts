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

/** One workspace's resolved opening, as served by `/tavern/greeting`. */
interface OpeningView {
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
 * Read the opening for one workspace.
 * @param workspaceId - registered tavern workspace id.
 * @returns the scene and first line, or `undefined` when no card defines either.
 */
async function fetchOpening(workspaceId: string): Promise<OpeningView | undefined> {
  const response = await fetch(`/tavern/greeting?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await response.json() as { ok?: unknown } & Partial<OpeningView>
  if (body.ok !== true) return undefined
  const narration = typeof body.narration?.text === 'string' && body.narration.text.trim().length > 0
    ? { cardId: String(body.narration.cardId ?? ''), text: body.narration.text }
    : undefined
  const greeting = typeof body.greeting?.text === 'string' && typeof body.greeting.name === 'string'
    && body.greeting.text.trim().length > 0
    ? { cardId: String(body.greeting.cardId ?? ''), name: body.greeting.name, text: body.greeting.text }
    : undefined
  if (narration === undefined && greeting === undefined) return undefined
  return { ...(narration === undefined ? {} : { narration }), ...(greeting === undefined ? {} : { greeting }) }
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
    fetchOpening(station.workspaceId).then((next) => {
      if (!cancelled) setOpening(next ?? null)
    }).catch(() => {
      if (!cancelled) setOpening(null)
    })
    return () => { cancelled = true }
  }, [station])

  if (!props.session.blank || opening === null) return null

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
