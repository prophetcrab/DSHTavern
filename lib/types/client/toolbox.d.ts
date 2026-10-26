import type { ReactElement } from 'react';
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client';
/** One registered tavern workspace, as served by `/tavern/state`. */
export interface TavernWorkspaceRef {
    readonly workspaceId: string;
    readonly workspacePath: string;
    readonly workspaceTitle: string;
}
/** One Workspace row from the client Workspace projection. */
export interface WorkspaceMembershipView {
    readonly workspaceId: string;
    readonly path: string;
    readonly title: string;
    readonly sessionIds: readonly string[];
}
/** Selector hook over the Workspace projection; supplied by the session slot. */
export type WorkspaceSelector = (selector: (state: {
    readonly items: readonly WorkspaceMembershipView[];
}) => unknown) => unknown;
/** The station (session) currently published by the composer detector. */
export interface TavernToolboxStation {
    readonly sessionId: string;
    readonly workspaceId: string;
    readonly workspacePath: string;
    readonly workspaceTitle: string;
}
/** Tool identities shown by the toolbox. */
export type TavernToolId = 'prompt' | 'agent' | 'characters' | 'persona' | 'worldbooks' | 'usage' | 'tracker' | 'image';
/** Launcher position in viewport pixels (top-left corner). */
export interface FabPosition {
    readonly left: number;
    readonly top: number;
}
/** `localStorage` key remembering where the user dragged the launcher. */
export declare const FAB_POSITION_KEY = "dshtavern.toolbox.fab.v1";
/** Launcher diameter in pixels. */
export declare const FAB_SIZE = 44;
interface ToolboxState {
    readonly station: TavernToolboxStation | null;
    readonly taverns: readonly TavernWorkspaceRef[];
    readonly loaded: boolean;
    readonly open: boolean;
    readonly activeTool: TavernToolId | null;
}
/** Refresh the tavern workspace list used to recognize a tavern session. */
export declare function ensureTaverns(force?: boolean): void;
/**
 * Match a session working directory to a registered tavern workspace.
 *
 * The match is exact (D004): only a session whose cwd is the tavern directory
 * itself is a tavern session. The host applies the same rule when it decides
 * whether to intercept a request, so the toolbox never offers tools for a
 * session the host would not orchestrate.
 * @param cwd - session working directory.
 * @param taverns - registered tavern workspaces.
 * @returns the tavern whose directory is the cwd, or `null`.
 */
export declare function matchTavernWorkspace(cwd: string | undefined, taverns: readonly TavernWorkspaceRef[]): TavernWorkspaceRef | null;
/**
 * Match a session to a tavern by cwd, falling back to its Workspace membership.
 *
 * A freshly created blank Session is catalogued with its Workspace id before
 * the client has a cwd summary for it. The cwd-only match then leaves the
 * toolbox and pre-chat card unmounted even though the session is already in a
 * registered tavern. Workspace membership is the authoritative fact in that
 * window; cwd remains the precise check once it arrives.
 * @param cwd - session working directory, when known.
 * @param taverns - registered tavern workspaces.
 * @param workspaceId - Workspace accounting for the session, when known.
 * @returns the tavern, or `null`.
 */
export declare function matchTavernWorkspaceForSession(cwd: string | undefined, taverns: readonly TavernWorkspaceRef[], workspaceId: string | undefined): TavernWorkspaceRef | null;
/**
 * Keep the launcher fully inside the viewport.
 * @param position - wanted top-left corner.
 * @param width - viewport width.
 * @param height - viewport height.
 * @returns a clamped position.
 */
export declare function clampFabPosition(position: FabPosition, width: number, height: number): FabPosition;
/**
 * Default launcher seat: the left gutter, above the composer.
 * @param width - viewport width.
 * @param height - viewport height.
 * @returns a clamped position that clears the composer.
 */
export declare function defaultFabPosition(width: number, height: number): FabPosition;
/** Read the remembered launcher position, falling back to the default seat. */
export declare function loadFabPosition(): FabPosition;
/** Remember the launcher position for the next page load. */
export declare function saveFabPosition(position: FabPosition): void;
/** Publish the station whose detector is mounted. */
export declare function publishStation(station: TavernToolboxStation | null): void;
/** Open or close the icon popover. */
export declare function setToolboxOpen(open: boolean): void;
/** Open one tool sub-window, or close it with `null`. */
export declare function setActiveTool(tool: TavernToolId | null): void;
/** Read the current store snapshot (tests and the surfaces). */
export declare function readToolboxState(): ToolboxState;
/**
 * Subscribe to store changes, including the tavern workspace list.
 * @param listener - called after every state change.
 * @returns the unsubscribe function.
 */
export declare function subscribeToolboxState(listener: () => void): () => void;
/** Standard props the composer-left slot provides to the detector. */
export interface ToolboxDetectorProps {
    readonly sessionId: string;
    readonly useSessions: (selector: (state: {
        byId: Record<string, {
            cwd?: string;
        }>;
    }) => unknown) => unknown;
    /** Workspace membership, used when a blank session has no cwd summary yet. */
    readonly useWorkspaces?: WorkspaceSelector;
    /**
     * The session's public composer actions.
     *
     * This row is registered in a session-scope slot, so the face is always
     * available at runtime; it stays optional in the type because the reply
     * affordance degrades to inert rather than failing to mount when a host omits
     * it.
     */
    readonly inputActions?: InputActions;
}
/**
 * Invisible composer row: publishes the current session's tavern station so
 * the floating launcher can appear only in tavern sessions.
 * @param props - session id and the session-list selector hook.
 * @returns `null` (the row renders nothing).
 */
export declare function TavernToolboxDetector(props: ToolboxDetectorProps): ReactElement | null;
/**
 * Popover size for the registered tool count.
 *
 * The anchor math needs the real box, and the tile count is what the grid
 * wraps on, so both derive from {@link TOOLS} instead of a hardcoded box that
 * goes stale whenever a tool is added.
 * @returns the popover's width and height in CSS pixels.
 */
export declare function toolPopoverSize(): {
    width: number;
    height: number;
};
/** How far the pointer must travel before a press becomes a drag. */
export declare const LAUNCHER_DRAG_THRESHOLD_PX = 4;
/**
 * Whether a launcher gesture counts as a drag.
 *
 * Sticky on purpose: once a gesture has crossed the threshold it stays a drag
 * even if the pointer returns to its origin, otherwise releasing where the
 * press started would produce a click and open the popover mid-drag.
 * @param moved - whether this gesture already crossed the threshold.
 * @param startX - press position, viewport pixels.
 * @param startY - press position, viewport pixels.
 * @param clientX - current pointer position.
 * @param clientY - current pointer position.
 * @returns whether the gesture is a drag.
 */
export declare function launcherGestureMoved(moved: boolean, startX: number, startY: number, clientX: number, clientY: number): boolean;
/**
 * Frame-wide toolbox: the draggable launcher, its icon popover, and the tool
 * sub-window. Renders nothing outside tavern sessions.
 * @returns the overlay elements, or `null`.
 */
export declare function TavernToolboxOverlay(): ReactElement | null;
export {};
