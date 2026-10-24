/** Attribute set on a workspace row that belongs to a tavern. */
export declare const TAVERN_ROW_ATTRIBUTE = "data-dshtavern-workspace";
/**
 * Read the workspace id out of a sidebar row key.
 * @param rowKey - the row's `data-row-key`, e.g. `workspace:<uuid>`.
 * @returns the workspace id, or `undefined` for the ungrouped bucket and other rows.
 */
export declare function tavernWorkspaceIdOf(rowKey: string | null): string | undefined;
/** The two document operations marking needs; kept narrow so a fake can stand in. */
export interface MarkableRow {
    readonly rowKey: string | null;
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
}
/**
 * Apply the mark to one row.
 * @param row - the workspace row.
 * @param ids - tavern workspace ids.
 * @returns whether the row was marked.
 */
export declare function applyMark(row: MarkableRow, ids: ReadonlySet<string>): boolean;
/**
 * Apply the attribute to every workspace row currently in the document.
 *
 * Rows are matched by id, not by title: renaming a tavern workspace must not
 * move the mark to a different row.
 */
export declare function markWorkspaceRows(): void;
/**
 * Adopt the tavern ids the toolbox store currently holds.
 * @param ids - workspace ids reported by `/tavern/state`.
 */
export declare function setTavernWorkspaceIds(ids: readonly string[]): void;
/**
 * Keep the sidebar marks in sync with the tavern registry.
 *
 * The observer watches child and attribute changes so a sidebar re-render
 * (expanding a workspace, renaming, switching views) re-marks rows without the
 * plugin tracking the sidebar's internal state.
 * @returns a disposer that stops observing and removes the stylesheet.
 */
export declare function installTavernWorkspaceMarks(): () => void;
