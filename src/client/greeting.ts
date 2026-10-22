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

/** One workspace's resolved opening line, as served by `/tavern/greeting`. */
interface GreetingView {
  readonly cardId: string
  readonly name: string
  readonly text: string
}

/** Props the session-scoped dock slot supplies. */
export interface GreetingDockProps {
  /** The session this card belongs to. */
  readonly session: { readonly sessionId: string; readonly blank: boolean }
  /** Session-list selector supplying the working directory. */
  readonly useSessions: (selector: (state: { byId: Record<string, { cwd?: string }> }) => unknown) => unknown
}

/**
 * Read the opening line for one workspace.
 * @param workspaceId - registered tavern workspace id.
 * @returns the greeting, or `undefined` when no card defines one.
 */
async function fetchGreeting(workspaceId: string): Promise<GreetingView | undefined> {
  const response = await fetch(`/tavern/greeting?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await response.json() as { ok?: unknown; greeting?: unknown }
  if (body.ok !== true) return undefined
  const greeting = body.greeting as Partial<GreetingView> | null | undefined
  if (greeting === null || greeting === undefined) return undefined
  if (typeof greeting.name !== 'string' || typeof greeting.text !== 'string') return undefined
  return { cardId: String(greeting.cardId ?? ''), name: greeting.name, text: greeting.text }
}

/**
 * Show the card's opening line above the composer while the chat is blank.
 * @param props - session identity and blank flag.
 * @returns the card, or `null` when it does not apply.
 */
export function TavernGreetingDock(props: GreetingDockProps): ReactElement | null {
  const summary = props.useSessions(list => list.byId[props.session.sessionId]) as { cwd?: string } | undefined
  const cwd = summary?.cwd
  const [greeting, setGreeting] = useState<GreetingView | null>(null)
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
      setGreeting(null)
      return
    }
    let cancelled = false
    fetchGreeting(station.workspaceId).then((next) => {
      if (!cancelled) setGreeting(next ?? null)
    }).catch(() => {
      if (!cancelled) setGreeting(null)
    })
    return () => { cancelled = true }
  }, [station])

  if (!props.session.blank || greeting === null) return null

  return createElement('section', {
    className: 'dshtavern-greeting',
    'aria-label': `${greeting.name} 的开场白`,
  },
  createElement('div', { className: 'dshtavern-greeting-head' },
    createElement('span', { className: 'dshtavern-greeting-avatar', 'aria-hidden': true },
      greeting.name.slice(0, 1)),
    createElement('div', { className: 'dshtavern-greeting-title' },
      createElement('span', { className: 'dshtavern-greeting-name' }, greeting.name),
      createElement('span', { className: 'dshtavern-greeting-hint' }, '开场白 · 回应她即可开始'))),
  createElement('p', { className: 'dshtavern-greeting-text' }, greeting.text))
}
