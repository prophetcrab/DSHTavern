/**
 * Sub-page strip shared by the tool panels.
 *
 * A tool with more settings than fit on one screen splits them behind this
 * strip instead of one long scroll: the strip stays put, the pane below it
 * scrolls, and every page is reachable in one click.
 */
import { createElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

/** One entry in the strip. */
export interface SubTabItem {
  readonly id: string
  readonly label: string
  /** Extra line under the label, shown as the tooltip. */
  readonly hint?: string
  readonly disabled?: boolean
  /** Marks the page as holding unsaved edits. */
  readonly changed?: boolean
}

/** Props of {@link SubTabs}. */
export interface SubTabsProps {
  /** Accessible name of the tab list, e.g. `'Agent 编排页面'`. */
  readonly ariaLabel: string
  readonly tabs: readonly SubTabItem[]
  readonly active: string
  readonly onSelect: (id: string) => void
}

/**
 * Render the tab strip.
 * @param props - the tabs and which one is open.
 * @returns the strip, with the active tab underlined in the accent.
 */
export function SubTabs(props: SubTabsProps): ReactElement {
  return createElement('div', {
    className: 'dshtavern-subtabs',
    role: 'tablist',
    'aria-label': props.ariaLabel,
  },
  props.tabs.map(tab => createElement('button', {
    key: tab.id,
    type: 'button',
    role: 'tab',
    'aria-selected': props.active === tab.id,
    'data-active': props.active === tab.id,
    className: 'dshtavern-subtab',
    disabled: tab.disabled === true,
    title: tab.hint,
    onClick: () => props.onSelect(tab.id),
  },
  createElement('span', { className: 'dshtavern-subtab-label' }, tab.label),
  tab.changed === true
    ? createElement('span', {
      className: 'dshtavern-subtab-changed',
      'aria-label': '有未保存的修改',
    }, '●')
    : null)))
}

/** Props of {@link SubTabPane}. */
export interface SubTabPaneProps {
  readonly children?: ReactNode
}

/**
 * Wrap the open page so it owns the leftover height and scrolls itself.
 * @param props - the page content.
 * @returns the scrolling pane.
 */
export function SubTabPane(props: SubTabPaneProps): ReactElement {
  return createElement('div', { className: 'dshtavern-subtabs-pane', role: 'tabpanel' }, props.children)
}
