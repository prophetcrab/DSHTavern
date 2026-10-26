import type { ReactElement } from 'react';
import type { WorkspaceSelector } from './toolbox.js';
/** Props the session-scoped dock slot supplies. */
export interface GreetingDockProps {
    /** The session this card belongs to. */
    readonly session: {
        readonly sessionId: string;
        readonly blank: boolean;
    };
    /** Session-list selector supplying the working directory. */
    readonly useSessions: (selector: (state: {
        byId: Record<string, {
            cwd?: string;
        }>;
    }) => unknown) => unknown;
    /** Workspace membership, used when a blank session has no cwd summary yet. */
    readonly useWorkspaces?: WorkspaceSelector;
}
/**
 * Show the scene and first line above the composer while the chat is blank.
 * @param props - session identity and blank flag.
 * @returns the card, or `null` when it does not apply.
 */
export declare function TavernGreetingDock(props: GreetingDockProps): ReactElement | null;
