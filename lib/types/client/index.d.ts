import type { ReactElement } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
/** The id shared by the sidebar entry and the main panel it opens. */
export declare const PANEL_ID: MainPanelId;
/** Required client services: the slot registry. */
export declare const inject: string[];
/** Durable identity written into `<workspace>/.dshtavern/tavern.json`. */
export interface TavernMarkerView {
    readonly schema: number;
    readonly kind: 'dshtavern';
    readonly tavernId: string;
    readonly createdAt: string;
    readonly title?: string;
    /** Running mode chosen before creation; absent on older markers means role-play. */
    readonly mode?: TavernModeView;
}
/** The two tavern run modes shown on the creation page. */
export type TavernModeView = 'rp' | 'novel';
/** Human-facing label for one mode. */
export declare const MODE_LABELS: Record<TavernModeView, string>;
/** One registered tavern workspace. */
export interface TavernView {
    readonly workspaceId: string;
    readonly path: string;
    readonly title: string;
    readonly marker: TavernMarkerView;
}
/**
 * The panel's read model, served by `GET /tavern/state`.
 *
 * `workspaces` is still served, for callers that want to know which registered
 * directories are not taverns; the panel itself only renders the tavern list.
 */
export interface Overview {
    readonly defaultRoot: string;
    readonly taverns: readonly TavernView[];
    readonly workspaces: readonly {
        readonly id: string;
        readonly path: string;
        readonly title: string;
        readonly tavern: boolean;
    }[];
}
/** Props of the pure panel view; the container supplies state and callbacks. */
export interface PanelViewProps {
    overview: Overview | null;
    loading: boolean;
    busy: boolean;
    error: string | null;
    notice: string | null;
    draftTitle: string;
    draftPath: string;
    draftMode: TavernModeView;
    lastRefreshed: string | null;
    onTitleChange: (value: string) => void;
    onPathChange: (value: string) => void;
    onModeChange: (value: TavernModeView) => void;
    onCreate: () => void;
    onRefresh: () => void;
    onSubmitShortcut: () => void;
}
/**
 * Render the panel body without hooks, so it stays unit-testable.
 * @param props - read model and action callbacks.
 * @returns the panel element tree.
 */
export declare function PanelView(props: PanelViewProps): ReactElement;
/**
 * Stateful container: owns the read model, the form draft, and the request
 * lifecycle; renders {@link PanelView}.
 *
 * The read model refreshes on mount, every few seconds while the page is
 * visible, when the window regains focus, and after every successful action, so
 * a workspace created elsewhere no longer leaves the panel stale.
 * @returns the panel element tree.
 */
export declare function TavernPanel(): ReactElement;
/**
 * Contribute the Tavern sidebar row and its main panel.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: Context): void;
