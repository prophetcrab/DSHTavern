import type { ReactElement } from 'react';
/** How secondary keys combine with a primary hit. */
export type WorldbookLogic = 'and_any' | 'and_all' | 'not_any' | 'not_all';
/** Where an activated entry is placed. */
export type WorldbookVisibility = 'all' | 'director' | 'characters';
/** Who may read an entry. */
/** One keyed lore entry as served by `/tavern/worldbook`. */
export interface WorldbookEntryView {
    readonly id: string;
    readonly name: string;
    readonly content: string;
    readonly keys: readonly string[];
    readonly secondaryKeys: readonly string[];
    readonly logic: WorldbookLogic;
    readonly constant: boolean;
    readonly visibility: WorldbookVisibility;
    /** Character ids when visibility is `characters`. */
    readonly characterIds: readonly string[];
    readonly order: number;
    readonly depth: number;
    readonly enabled: boolean;
    readonly caseSensitive: boolean;
    readonly wholeWords: boolean;
}
/**
 * Ask the host for the workspace worldbook as a `.world` document.
 * @param workspaceId - tavern workspace id.
 * @returns the suggested file name and document text.
 */
export declare function exportWorldbook(workspaceId: string): Promise<{
    file: string;
    text: string;
}>;
/**
 * Replace the workspace worldbook from a `.world` document.
 * @param workspaceId - tavern workspace id.
 * @param text - document text.
 * @returns the stored entries.
 */
export declare function importWorldbook(workspaceId: string, text: string): Promise<WorldbookEntryView[]>;
/**
 * Decide which entries a sample line would activate.
 *
 * Runs the shared matching engine with an empty stage, so the panel reports
 * exactly the activation the host would compute for that line.
 * @param entries - stored entries.
 * @param sample - text to scan.
 * @returns activated entries in injection order.
 */
export declare function previewActivation(entries: readonly WorldbookEntryView[], sample: string): WorldbookEntryView[];
/** Props of the worldbook workbench. */
export interface WorldbookWorkbenchProps {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
}
/**
 * Two-pane worldbook editor: the entry list on the left, the selected entry on
 * the right, with an activation preview under the form.
 * @param props - the workspace this workbench edits.
 * @returns the workbench section.
 */
export declare function WorldbookWorkbench(props: WorldbookWorkbenchProps): ReactElement;
