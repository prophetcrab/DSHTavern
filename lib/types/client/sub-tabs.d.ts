import type { ReactElement, ReactNode } from 'react';
/** One entry in the strip. */
export interface SubTabItem {
    readonly id: string;
    readonly label: string;
    /** Extra line under the label, shown as the tooltip. */
    readonly hint?: string;
    readonly disabled?: boolean;
    /** Marks the page as holding unsaved edits. */
    readonly changed?: boolean;
}
/** Props of {@link SubTabs}. */
export interface SubTabsProps {
    /** Accessible name of the tab list, e.g. `'Agent 编排页面'`. */
    readonly ariaLabel: string;
    readonly tabs: readonly SubTabItem[];
    readonly active: string;
    readonly onSelect: (id: string) => void;
}
/**
 * Render the tab strip.
 * @param props - the tabs and which one is open.
 * @returns the strip, with the active tab underlined in the accent.
 */
export declare function SubTabs(props: SubTabsProps): ReactElement;
/** Props of {@link SubTabPane}. */
export interface SubTabPaneProps {
    readonly children?: ReactNode;
}
/**
 * Wrap the open page so it owns the leftover height and scrolls itself.
 * @param props - the page content.
 * @returns the scrolling pane.
 */
export declare function SubTabPane(props: SubTabPaneProps): ReactElement;
