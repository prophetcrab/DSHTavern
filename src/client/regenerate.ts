/**
 * Regeneration controls under a tavern reply.
 *
 * DSH's transcript is append-only, so "regenerate" cannot rewrite the reply in
 * place. The Host rewinds the story state to the start of the newest beat,
 * replays it, and appends the replacement as the next turn; this strip is how
 * the player asks for that, and how the superseded reply is labelled after.
 *
 * The action only ever appears under the newest closed turn, because the
 * rewind target is the newest beat. Anything older would have to discard every
 * turn after it.
 */
import { createElement, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { matchTavernWorkspace, readToolboxState, subscribeToolboxState, ensureTaverns } from './toolbox.js'

/** One superseded turn and the turn that replaced it. */
export interface RegenerationView {
  readonly turn: number
  readonly replacement: number
}

/** Superseded turns per session: the turn number mapped to its replacement. */
const superseded = new Map<string, Map<number, number>>()

/** Newest turn the Host can replay, per session; absent while unknown. */
const replayable = new Map<string, number>()

/** In-flight list reads, so several mounted strips share one request. */
const refreshing = new Map<string, Promise<void>>()

/** Sessions whose strip asked again while a read was in flight. */
const rerun = new Set<string>()

const listeners = new Set<() => void>()

/** Stable empty value, so a session without records keeps one snapshot identity. */
const EMPTY: ReadonlyMap<number, number> = new Map()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Subscribe to the superseded-turn cache.
 * @param listener - called after any session's records change.
 * @returns the unsubscribe function.
 */
export function subscribeRegenerations(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Read one session's superseded turns.
 * @param sessionId - chat identity.
 * @returns turn number to replacement turn number; a stable empty map before the first read.
 */
export function regenerationSnapshot(sessionId: string): ReadonlyMap<number, number> {
  return superseded.get(sessionId) ?? EMPTY
}

/**
 * Read the newest turn the Host can replay.
 * @param sessionId - chat identity.
 * @returns that turn, or `undefined` when the story has nothing to replay.
 */
export function replayableTurn(sessionId: string): number | undefined {
  return replayable.get(sessionId)
}

/** Replace one session's cache entry without changing identity when nothing moved. */
function store(sessionId: string, records: readonly RegenerationView[], turn: number | undefined): void {
  const next = new Map<number, number>()
  for (const record of records) next.set(record.turn, record.replacement)
  const previous = superseded.get(sessionId) ?? EMPTY
  const sameRecords = next.size === previous.size
    && [...next].every(([oldTurn, replacement]) => previous.get(oldTurn) === replacement)
  const sameTurn = replayable.get(sessionId) === turn
  if (sameRecords && sameTurn) return
  superseded.set(sessionId, next)
  if (turn === undefined) replayable.delete(sessionId)
  else replayable.set(sessionId, turn)
  notify()
}

/**
 * Follow a replacement chain to the reply that currently stands.
 *
 * Regenerating a regeneration adds another hop (2→3, then 3→4). The marker
 * under turn 2 must name the reply the player can actually read, not the
 * intermediate draft that was itself replaced.
 * @param records - superseded turns for the session.
 * @param turn - the turn whose marker is being rendered.
 * @returns the newest replacement turn, or `undefined` when the turn stands.
 */
export function finalReplacement(records: ReadonlyMap<number, number>, turn: number): number | undefined {
  let current = records.get(turn)
  if (current === undefined) return undefined
  // The chain only grows forward. A visited set bounds a corrupted cycle
  // without letting the answer depend on how many hops fit in the loop.
  const visited = new Set<number>([turn])
  while (!visited.has(current)) {
    visited.add(current)
    const next = records.get(current)
    if (next === undefined) break
    current = next
  }
  return current
}

/**
 * Fetch one session's superseded turns.
 *
 * `force` exists because the list grows at the end of a regeneration: a cache
 * filled before that write would keep the replaced reply looking current.
 * @param workspaceId - registered tavern workspace id.
 * @param sessionId - chat identity.
 * @param force - re-read even when a cached list exists.
 */
export function ensureRegenerations(workspaceId: string, sessionId: string, force = false): void {
  if (!force && superseded.has(sessionId)) return
  if (refreshing.has(sessionId)) {
    rerun.add(sessionId)
    return
  }
  const task = fetch(`/tavern/regenerate?${new URLSearchParams({ workspaceId, sessionId }).toString()}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
    .then(async (response) => {
      const body = await response.json() as {
        ok?: unknown
        regenerations?: unknown
        replayableTurn?: unknown
      }
      if (body.ok !== true) return
      const records: RegenerationView[] = []
      for (const item of Array.isArray(body.regenerations) ? body.regenerations : []) {
        if (typeof item !== 'object' || item === null) continue
        const record = item as Record<string, unknown>
        if (typeof record.turn !== 'number' || typeof record.replacement !== 'number') continue
        records.push({ turn: record.turn, replacement: record.replacement })
      }
      store(sessionId, records, typeof body.replayableTurn === 'number' ? body.replayableTurn : undefined)
    })
    .catch(() => {
      // A failed read leaves the previous list in place; the strip still works.
    })
  refreshing.set(sessionId, task)
  void task.finally(() => {
    refreshing.delete(sessionId)
    if (rerun.delete(sessionId)) ensureRegenerations(workspaceId, sessionId, true)
  })
}

/** Standard props the turn-tail slot provides to the strip. */
export interface TurnActionsProps {
  /** Completed turn this strip belongs to. */
  readonly turn: { readonly turn: number; readonly status: 'open' | 'closed' | 'unknown' }
  /** Current Session identity. */
  readonly sessionId: string
  /** Selector hook over the Chat assembly, used to find the newest turn. */
  readonly useChat: (selector: (snapshot: { readonly timeline?: { readonly turnOrder?: readonly number[] } }) => unknown) => unknown
  /** Session-list selector supplying the working directory. */
  readonly useSessions: (selector: (state: { byId: Record<string, { cwd?: string }> }) => unknown) => unknown
}

/** Live state of the one regeneration request this strip may issue. */
interface ActionState {
  readonly busy: boolean
  readonly error: string | null
}

/**
 * Render the regenerate action and the superseded marker.
 * @param props - owning turn, session identity, and the standard hooks.
 * @returns an action row, or `null` outside a tavern or under a stale turn.
 */
export function TavernTurnActions(props: TurnActionsProps): ReactElement | null {
  const cwd = props.useSessions(list => list.byId[props.sessionId]?.cwd) as string | undefined
  // The rewind target is the newest beat, so only the newest turn may offer the
  // action. Reading the timeline keeps the check live without another request.
  const newestTurn = props.useChat((snapshot) => {
    const order = snapshot.timeline?.turnOrder
    return order === undefined || order.length === 0 ? undefined : order[order.length - 1]
  }) as number | undefined
  const records = useSyncExternalStore(
    subscribeRegenerations,
    () => regenerationSnapshot(props.sessionId),
    () => regenerationSnapshot(props.sessionId),
  )
  const [station, setStation] = useState<{ workspaceId: string } | null>(null)
  const [state, setState] = useState<ActionState>({ busy: false, error: null })

  const syncStation = useCallback(() => {
    const match = matchTavernWorkspace(cwd, readToolboxState().taverns)
    setStation(match === null ? null : { workspaceId: match.workspaceId })
  }, [cwd])

  useEffect(() => {
    ensureTaverns()
    syncStation()
    return subscribeToolboxState(syncStation)
  }, [syncStation])

  // The list gains one entry per regeneration; refresh when the newest turn
  // changes so the replaced reply is labelled as soon as its replacement lands.
  useEffect(() => {
    if (station === null) return
    ensureRegenerations(station.workspaceId, props.sessionId, true)
  }, [station, props.sessionId, newestTurn])

  const replacement = finalReplacement(records, props.turn.turn)
  const newestReplayable = useSyncExternalStore(
    subscribeRegenerations,
    () => replayableTurn(props.sessionId),
    () => replayableTurn(props.sessionId),
  )
  const start = useCallback(() => {
    if (station === null) return
    setState({ busy: true, error: null })
    fetch('/tavern/regenerate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        workspaceId: station.workspaceId,
        sessionId: props.sessionId,
        turn: props.turn.turn,
      }),
    })
      .then(async (response) => {
        const body = await response.json() as { ok?: unknown; error?: unknown }
        if (body.ok === true) {
          // A new turn is now queued; the strip on that turn offers the next
          // attempt and this one retires when the newest turn moves.
          setState({ busy: false, error: null })
          return
        }
        setState({ busy: false, error: typeof body.error === 'string' ? body.error : '重新生成失败' })
      })
      .catch((error: unknown) => {
        setState({ busy: false, error: error instanceof Error ? error.message : String(error) })
      })
  }, [station, props.sessionId, props.turn.turn])

  if (station === null) return null
  if (replacement !== undefined) {
    return createElement('div', { className: 'dshtavern-regenerate-row' },
      createElement('span', { className: 'dshtavern-regenerate-superseded' },
        `这一条已被第 ${replacement} 轮重新生成取代`))
  }
  if (newestTurn !== props.turn.turn || props.turn.status !== 'closed') return null
  // The Host replays the newest beat only; offering the action before that beat
  // is known to exist would produce a button that always refuses.
  if (newestReplayable === undefined || newestReplayable !== props.turn.turn) return null
  return createElement('div', { className: 'dshtavern-regenerate-row' },
    createElement('button', {
      type: 'button',
      className: 'dshtavern-regenerate-action',
      onClick: start,
      disabled: state.busy,
      title: '回退到这一幕开始前的剧情状态，再让导演和角色重新演一次',
    }, state.busy ? '正在重新生成…' : '重新生成'),
    state.error === null
      ? null
      : createElement('span', { className: 'dshtavern-regenerate-error' }, state.error))
}
