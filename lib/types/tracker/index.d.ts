/**
 * DSH-Tavern story tracker sub-plugin.
 *
 * A separate plugin row (`dshtavern-tracker` in the bundle patch) that runs a
 * progress-tracking task beside the conversation. It never touches the agent
 * loop: a run reads the story a chat has already staged, asks a model to
 * restate it as a ledger, and writes the result to disk. Because it is its own
 * row, removing that row takes the whole feature offline — the routes vanish,
 * the toolbox entry reports the feature as unavailable, and the tavern itself
 * is unaffected.
 *
 * Two triggers, both configurable per workspace:
 * - after every N beats, and
 * - after every N minutes,
 * whichever comes first. A run is skipped while another one for the same chat
 * is still in flight, so a slow model cannot stack up requests.
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { TrackerConfig, TrackerState, TrackerSummary } from './summary.js';
/** Service name this plugin publishes. */
export declare const TRACKER_SERVICE = "tavernTracker";
/** Route serving the tracker snapshot and accepting actions. */
export declare const TRACKER_ROUTE = "/tavern-tracker/state";
/** Route the client probes to decide whether this sub-plugin is active. */
export declare const TRACKER_PING_ROUTE = "/tavern-tracker/ping";
/** Version stamped on every response, so the client can refuse a mismatch. */
export declare const TRACKER_API_SCHEMA = 1;
/** One chat's tracking view. */
export interface TrackerChatView {
    readonly sessionId: string;
    /** Newest beat the chat has produced. */
    readonly newestTurn: number;
    /** Ledgers newest first. */
    readonly summaries: readonly TrackerSummary[];
    /**
     * Every turn the newest ledger has read, ascending; the turn rail marks these.
     *
     * A run reads the whole story up to its own turn, so this runs from 1 to the
     * newest ledger's turn rather than listing only the turns that own a file.
     */
    readonly trackedTurns: readonly number[];
    /** How many runs have written a ledger. */
    readonly runCount: number;
    /** Whether a run for this chat is in flight. */
    readonly running: boolean;
    /**
     * Turns whose reply was regenerated after the newest ledger was written.
     *
     * A ledger describes the story as it stood; regenerating a covered beat
     * replaced part of that story, so the ledger no longer matches what is on
     * stage. The turn rail stops marking the affected range and the panel says
     * the ledger is out of date until the next run.
     */
    readonly staleTurns: readonly number[];
    /** Why the last automatic run could not write a ledger, when it failed. */
    readonly lastError?: string;
}
/** Everything the tracker panel needs for one render. */
export interface TrackerSnapshot {
    readonly schema: number;
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    readonly config: TrackerConfig;
    readonly defaults: TrackerConfig;
    /** Every chat in this workspace that has a story on disk. */
    readonly chats: readonly TrackerChatView[];
    readonly generatedAt: string;
}
/**
 * Host plugin: schedules and runs progress tracking for one tavern workspace.
 *
 * Loads with `workspaceRegistry`; `webServer` and `llm` are injected optionally
 * so a profile without the Web layer or a model route still loads the plugin
 * and simply reports the feature as unavailable.
 */
export declare class TavernTrackerService extends Service {
    static inject: string[];
    private readonly workspaces;
    /** Chats with a run in flight, so a slow model cannot stack requests. */
    private readonly running;
    /** Last failure per chat, cleared by the next successful run. */
    private readonly failures;
    /**
     * @param ctx - Cordis context carrying the workspace registry.
     */
    constructor(ctx: Context);
    /**
     * Read one workspace's tracker snapshot.
     * @param workspaceId - registered tavern workspace id.
     * @returns the panel's read model.
     * @throws Error when the workspace is not registered.
     */
    snapshot(workspaceId: string): Promise<TrackerSnapshot>;
    /**
     * Persist one workspace's tracker settings.
     * @param workspaceId - registered tavern workspace id.
     * @param value - full config payload, validated before writing.
     * @returns the stored config.
     */
    saveConfig(workspaceId: string, value: unknown): Promise<TrackerConfig>;
    /**
     * Run one tracking pass for a chat now, ignoring the triggers.
     *
     * The run is async: the caller gets the chat identity back immediately and
     * polls the snapshot for the ledger. A second request for a chat already
     * running returns `started: false` instead of queueing another model call.
     * @param workspaceId - registered tavern workspace id.
     * @param sessionId - chat identity.
     * @returns whether a run started.
     */
    track(workspaceId: string, sessionId: string): Promise<{
        started: boolean;
        reason?: string;
    }>;
    /**
     * Start the automatic scheduler.
     *
     * A single interval scans every registered tavern workspace: it reads each
     * chat's on-disk state, so a restart resumes the same schedule instead of
     * starting over, and a disabled config costs one file read per chat.
     *
     * The interval is registered as an effect so unloading the plugin row stops
     * it, which is what makes the sub-plugin removable at runtime.
     */
    private startScheduler;
    /** One scheduler tick: start a run for every chat that is due. */
    private schedule;
    /**
     * Run one tracking pass and store its ledger.
     *
     * Nothing here touches the agent loop or the story: a failed run leaves the
     * previous state untouched so the next tick retries the same range.
     * @param workspacePath - tavern workspace root.
     * @param sessionId - chat identity.
     * @param config - workspace settings.
     * @param newestTurn - newest beat the run should cover.
     */
    private runTracking;
    /** @returns the LLM service when the profile has one. */
    private llm;
    /**
     * Provider and model a run uses when the workspace names none.
     * @returns the deployment default, or `undefined` when unavailable.
     */
    private defaultSelection;
    /**
     * Chats in one workspace that have a story on disk.
     * @param workspacePath - tavern workspace root.
     * @returns session ids.
     */
    private listChats;
    /**
     * Turns covered by the newest ledger that a later regeneration replaced.
     * @param workspacePath - tavern workspace root.
     * @param sessionId - chat identity.
     * @returns superseded turns inside the ledger's range, ascending.
     */
    private staleTurnsOf;
    /**
     * Newest beat recorded for one chat.
     * @param workspacePath - tavern workspace root.
     * @param sessionId - chat identity.
     * @returns the newest turn, or 0 when the chat has no beat yet.
     */
    private newestTurnOf;
    private registerRoutes;
    /** Read the snapshot, save settings, or start a run. */
    private handleState;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Tavern story tracker. */
        tavernTracker: TavernTrackerService;
    }
}
export type { TrackerConfig, TrackerState, TrackerSummary };
export default TavernTrackerService;
