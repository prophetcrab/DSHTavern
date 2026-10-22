/**
 * Tavern marks in the sidebar workspace list.
 *
 * The DSH sidebar exposes slots for session rows but none for a workspace row,
 * so a workspace cannot register its own decoration. This module reads the rows
 * the sidebar renders (`[data-row-key="workspace:<id>"]`) and, for the ids the
 * tavern registry reports, sets one attribute the stylesheet turns into a
 * badge. Nothing is moved, wrapped, or injected: a React re-render keeps the
 * attribute and re-marks on the next mutation.
 */
import { subscribeToolboxState, readToolboxState, ensureTaverns } from './toolbox.js'
import { PANEL_CSS } from './styles.js'

/** Attribute set on a workspace row that belongs to a tavern. */
export const TAVERN_ROW_ATTRIBUTE = 'data-dshtavern-workspace'

/** Stylesheet element id, so a second install cannot duplicate the rules. */
const STYLE_ID = 'dshtavern-sidebar-marks'

/** Prefix the sidebar puts before a workspace id in `data-row-key`. */
const ROW_KEY_PREFIX = 'workspace:'

/** Rules that render the badge. */
const SIDEBAR_CSS = `
[${TAVERN_ROW_ATTRIBUTE}='true'] > :first-child {
  color: var(--tv-accent, var(--dsw-alias-state-business-primary, #4f7fe0));
}
[${TAVERN_ROW_ATTRIBUTE}='true'] > :nth-child(3) > span::after {
  content: '酒';
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 15px;
  height: 15px;
  margin-inline-start: 6px;
  border: var(--tv-hairline, 0.5px) solid color-mix(in srgb, var(--tv-accent, #4f7fe0) 45%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--tv-accent, #4f7fe0) 14%, transparent);
  color: var(--tv-accent, #4f7fe0);
  font-size: 9px;
  line-height: 1;
  font-weight: 600;
  vertical-align: 1px;
  flex: none;
}
`

let tavernIds: ReadonlySet<string> = new Set()

/**
 * Read the workspace id out of a sidebar row key.
 * @param rowKey - the row's `data-row-key`, e.g. `workspace:<uuid>`.
 * @returns the workspace id, or `undefined` for the ungrouped bucket and other rows.
 */
export function tavernWorkspaceIdOf(rowKey: string | null): string | undefined {
  if (rowKey === null || !rowKey.startsWith(ROW_KEY_PREFIX)) return undefined
  const id = rowKey.slice(ROW_KEY_PREFIX.length)
  return id.length > 0 ? id : undefined
}

/** The two document operations marking needs; kept narrow so a fake can stand in. */
export interface MarkableRow {
  readonly rowKey: string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/**
 * Apply the mark to one row.
 * @param row - the workspace row.
 * @param ids - tavern workspace ids.
 * @returns whether the row was marked.
 */
export function applyMark(row: MarkableRow, ids: ReadonlySet<string>): boolean {
  const id = tavernWorkspaceIdOf(row.rowKey)
  if (id !== undefined && ids.has(id)) {
    row.setAttribute(TAVERN_ROW_ATTRIBUTE, 'true')
    return true
  }
  row.removeAttribute(TAVERN_ROW_ATTRIBUTE)
  return false
}

/**
 * Apply the attribute to every workspace row currently in the document.
 *
 * Rows are matched by id, not by title: renaming a tavern workspace must not
 * move the mark to a different row.
 */
export function markWorkspaceRows(): void {
  if (typeof document === 'undefined') return
  for (const row of document.querySelectorAll(`[data-row-key^="${ROW_KEY_PREFIX}"]`)) {
    applyMark({
      rowKey: row.getAttribute('data-row-key'),
      setAttribute: (name, value) => row.setAttribute(name, value),
      removeAttribute: name => row.removeAttribute(name),
    }, tavernIds)
  }
}

/**
 * Adopt the tavern ids the toolbox store currently holds.
 * @param ids - workspace ids reported by `/tavern/state`.
 */
export function setTavernWorkspaceIds(ids: readonly string[]): void {
  const next = new Set(ids)
  if (next.size === tavernIds.size && [...next].every(id => tavernIds.has(id))) return
  tavernIds = next
  markWorkspaceRows()
}

/**
 * Keep the sidebar marks in sync with the tavern registry.
 *
 * The observer watches child and attribute changes so a sidebar re-render
 * (expanding a workspace, renaming, switching views) re-marks rows without the
 * plugin tracking the sidebar's internal state.
 * @returns a disposer that stops observing and removes the stylesheet.
 */
export function installTavernWorkspaceMarks(): () => void {
  if (typeof document === 'undefined') return () => undefined

  if (document.getElementById(STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    // Panel tokens and rules ship with the sidebar marks rather than the
    // toolbox overlay: this effect is mounted for the session's whole life,
    // while the overlay only exists while its window is open — and the pre-chat
    // opening card renders outside both.
    style.textContent = SIDEBAR_CSS + PANEL_CSS
    document.head.appendChild(style)
  }

  ensureTaverns()
  const applyStore = (): void => {
    setTavernWorkspaceIds(readToolboxState().taverns.map(tavern => tavern.workspaceId))
  }
  applyStore()
  const unsubscribe = subscribeToolboxState(applyStore)

  const observer = new MutationObserver(() => { markWorkspaceRows() })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-row-key'],
  })
  markWorkspaceRows()

  return () => {
    observer.disconnect()
    unsubscribe()
    // Rows keep their attribute for the rest of the page's life; React owns
    // their removal, and a reinstall re-marks from the current registry.
    tavernIds = new Set()
    markWorkspaceRows()
    document.getElementById(STYLE_ID)?.remove()
  }
}
