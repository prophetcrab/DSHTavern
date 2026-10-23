/**
 * Green marks on the turn rail for beats that already have a ledger.
 *
 * The chat UI owns the rail and exposes no slot for decorating a mark, so this
 * observes the rendered `button[data-index]` marks and sets one attribute the
 * stylesheet turns green. Matching is by turn number read from the mark's
 * accessible label, which is the only per-turn fact the rail publishes.
 */

/** Attribute set on a rail mark whose turn has been tracked. */
export const TRACKED_MARK_ATTRIBUTE = 'data-dshtavern-tracked'

/** Stylesheet element id, so a second install cannot duplicate the rules. */
const STYLE_ID = 'dshtavern-tracked-marks'

/** Rules that colour a tracked mark. */
const TRACKED_CSS = `
[${TRACKED_MARK_ATTRIBUTE}='true'] {
  background-color: var(--dsw-alias-state-success-primary, #3ba55d) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary, #3ba55d) 22%, transparent);
}
`

/** Turns known to have a ledger, per chat. */
const trackedBySession = new Map<string, ReadonlySet<number>>()

/**
 * Read the turn number out of a rail mark's label.
 *
 * The label is a localized sentence ("跳转到第 3 轮" / "Jump to turn 3"), so the
 * number is taken as the last integer in it rather than by matching the whole
 * string, which would break on a copy change or a second language.
 * @param label - the mark's `aria-label`.
 * @returns the turn number, or `undefined` when the label carries none.
 */
export function turnOfLabel(label: string | null): number | undefined {
  if (label === null) return undefined
  const matches = label.match(/\d+/g)
  if (matches === null) return undefined
  const last = matches[matches.length - 1]
  if (last === undefined) return undefined
  const turn = Number(last)
  return Number.isSafeInteger(turn) && turn > 0 ? turn : undefined
}

/**
 * Apply the mark to every rendered rail mark.
 * @param tracked - turns that have a ledger.
 */
export function markTrackedTurns(tracked: ReadonlySet<number>): void {
  if (typeof document === 'undefined') return
  for (const mark of document.querySelectorAll('button[data-index]')) {
    const turn = turnOfLabel(mark.getAttribute('aria-label'))
    if (turn !== undefined && tracked.has(turn)) {
      mark.setAttribute(TRACKED_MARK_ATTRIBUTE, 'true')
      continue
    }
    mark.removeAttribute(TRACKED_MARK_ATTRIBUTE)
  }
}

/**
 * Record one chat's tracked turns and repaint the rail.
 * @param sessionId - chat identity the rail is showing.
 * @param turns - turns that have a ledger.
 */
export function setTrackedTurns(sessionId: string, turns: readonly number[]): void {
  const next = new Set(turns)
  const previous = trackedBySession.get(sessionId)
  if (previous !== undefined && previous.size === next.size && [...next].every(turn => previous.has(turn))) return
  trackedBySession.set(sessionId, next)
  markTrackedTurns(next)
}

/**
 * Keep the rail marks in sync with the tracker.
 *
 * Repaints on tracker changes and after sidebar/transcript mutations, because
 * the rail is virtualized: scrolling rebuilds the marks and drops attributes.
 * @param sessionId - chat identity the rail is showing.
 * @returns a disposer that stops observing.
 */
export function installTrackedTurnMarks(sessionId: string): () => void {
  if (typeof document === 'undefined') return () => undefined
  if (document.getElementById(STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = TRACKED_CSS
    document.head.appendChild(style)
  }
  const repaint = (): void => {
    markTrackedTurns(trackedBySession.get(sessionId) ?? new Set())
  }
  repaint()
  const observer = new MutationObserver(repaint)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-index', 'aria-label'] })
  return () => {
    observer.disconnect()
    document.getElementById(STYLE_ID)?.remove()
    trackedBySession.delete(sessionId)
    for (const mark of document.querySelectorAll(`[${TRACKED_MARK_ATTRIBUTE}]`)) {
      mark.removeAttribute(TRACKED_MARK_ATTRIBUTE)
    }
  }
}

/**
 * Refresh one chat's tracked turns from the tracker route.
 *
 * A profile without the tracker sub-plugin has no route; that is a normal
 * state, so a failed read simply leaves the rail unmarked.
 * @param workspaceId - registered tavern workspace id.
 * @param sessionId - chat identity.
 */
export async function refreshTrackedTurns(workspaceId: string, sessionId: string): Promise<void> {
  try {
    const response = await fetch(`/tavern-tracker/state?workspaceId=${encodeURIComponent(workspaceId)}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    const body = await response.json() as { ok?: unknown; chats?: unknown }
    if (body.ok !== true || !Array.isArray(body.chats)) return
    for (const chat of body.chats) {
      if (typeof chat !== 'object' || chat === null) continue
      const record = chat as Record<string, unknown>
      if (record.sessionId !== sessionId) continue
      if (!Array.isArray(record.trackedTurns)) return
      setTrackedTurns(sessionId, record.trackedTurns.filter((turn): turn is number => typeof turn === 'number'))
      return
    }
  } catch {
    // No tracker row, or the host is unreachable: leave the rail unmarked.
  }
}
