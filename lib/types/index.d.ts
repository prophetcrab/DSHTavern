import { Service, type Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { CharacterCard, CharacterCardInput, CharacterCardListing } from './character-card.js';
import type { PersonaFile } from './persona.js';
import type { OpeningScript } from './opening.js';
import type { PromptPreview } from './preview.js';
import type { RegenerationRecord } from './regenerate.js';
import type { TavernAgentConfig } from './agent-config.js';
import type { TavernOpening } from './greeting.js';
import type { WorldbookFile } from './worldbook.js';
import type { PromptBlockView, PromptScope } from './prompt-layout.js';
/** Directory owning every tavern-side file, relative to the workspace root. */
export declare const TAVERN_DIRECTORY = ".dshtavern";
/** Per-agent complete prompt section registered by the host assembly. */
export declare const TAVERN_PROMPT_SECTION = "tavern:workspace-prompt";
/** Reply text shown when a beat produced neither narration nor speech. */
export declare const EMPTY_BEAT_NOTICE = "\u8FD9\u4E00\u5E55\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u5185\u5BB9\u3002\u53EF\u4EE5\u518D\u8BF4\u4E00\u53E5\uFF0C\u6216\u68C0\u67E5\u63D0\u793A\u8BCD\u7F16\u6392\u91CC\u7684\u5BFC\u6F14\u5757\u662F\u5426\u88AB\u505C\u7528\u3002";
/** Appended when any call in a beat hit its reply budget. */
export declare const TRUNCATED_NOTICE = "\uFF08\u672C\u5E55\u8FBE\u5230\u8BBE\u5B9A\u7684\u56DE\u590D\u957F\u5EA6\u4E0A\u9650\uFF0C\u5185\u5BB9\u88AB\u622A\u65AD\u3002\u53EF\u5728 Agent \u7F16\u6392\u91CC\u8C03\u5927\u56DE\u590D\u957F\u5EA6\u3002\uFF09";
/**
 * Reply text shown when a non-player trigger woke a tavern session.
 *
 * Refusing the turn keeps the story untouched. The trigger's own text is never
 * forwarded: a scheduled reminder asking for a tool call reads as narration to
 * the director, which turns a housekeeping message into plot.
 */
export declare const EXTERNAL_TRIGGER_NOTICE = "\u8FD9\u662F\u9152\u9986\u4F1A\u8BDD\uFF0C\u53EA\u4F1A\u56DE\u5E94\u4F60\u672C\u4EBA\u8BF4\u7684\u8BDD\u3002\u5B9A\u65F6\u4EFB\u52A1\u6216\u5176\u4ED6\u81EA\u52A8\u89E6\u53D1\u7684\u6D88\u606F\u4E0D\u4F1A\u63A8\u8FDB\u5267\u60C5\u3002";
/** Marker file name inside {@link TAVERN_DIRECTORY}. */
export declare const MARKER_FILE = "tavern.json";
/** Marker schema version this build reads and writes. */
export declare const MARKER_SCHEMA = 1;
/** Durable identity of one tavern, stored inside its workspace directory. */
export interface TavernMarker {
    /** Marker schema version. */
    readonly schema: number;
    /** Discriminator; always `dshtavern`. */
    readonly kind: 'dshtavern';
    /** Stable tavern identity, generated at creation. */
    readonly tavernId: string;
    /** ISO-8601 creation instant. */
    readonly createdAt: string;
    /** Optional display title captured at creation. */
    readonly title?: string;
    /** Running mode chosen before creation; absent on older markers means role-play. */
    readonly mode?: TavernMode;
}
/** The two tavern run modes. Their prompt block catalogues are independent. */
export type TavernMode = 'rp' | 'novel';
/**
 * Resolve the mode of a marker, defaulting legacy markers to role-play.
 * @param marker - parsed marker.
 * @returns the effective mode.
 */
export declare function tavernModeOf(marker: TavernMarker): TavernMode;
/** One registered workspace whose directory carries a tavern marker. */
export interface TavernWorkspaceView {
    /** DSH workspace id. */
    readonly workspaceId: string;
    /** Canonical workspace directory. */
    readonly path: string;
    /** Display title of the workspace. */
    readonly title: string;
    /** Parsed marker. */
    readonly marker: TavernMarker;
}
/** Minimal workspace facts this plugin needs; keeps the marker layer testable. */
export interface TavernWorkspaceRecord {
    readonly id: string;
    readonly path: string;
    readonly title: string;
}
/** A stored marker exists but is structurally invalid. */
export declare class TavernMarkerInvalidError extends Error {
    readonly path: string;
    constructor(path: string);
}
/** A stored marker was written by a newer schema than this build understands. */
export declare class TavernMarkerVersionError extends Error {
    readonly path: string;
    readonly schema: number;
    constructor(path: string, schema: number);
}
/** A workspace id named for adoption or removal is not registered. */
export declare class TavernWorkspaceNotFoundError extends Error {
    readonly workspaceId: string;
    constructor(workspaceId: string);
}
/** @param directory - workspace directory. @returns its tavern-owned directory. */
export declare function tavernDirectory(directory: string): string;
/** @param directory - workspace directory. @returns the absolute marker path. */
export declare function markerPath(directory: string): string;
/**
 * Parse and validate marker JSON.
 * @param text - file content.
 * @returns the marker, or `undefined` when the content is not a valid marker.
 */
export declare function parseMarker(text: string): TavernMarker | undefined;
/**
 * Create a fresh marker value.
 * @param title - optional display title.
 * @returns a marker with a new tavern identity.
 */
export declare function createMarker(title?: string, mode?: TavernMode): TavernMarker;
/**
 * Read the marker of one directory.
 * @param directory - workspace directory.
 * @returns the marker, or `undefined` when the file is absent or invalid.
 */
export declare function readMarker(directory: string): Promise<TavernMarker | undefined>;
/**
 * Write a marker atomically (temporary file then rename).
 * @param directory - workspace directory.
 * @param marker - marker to persist.
 * @returns resolution after the rename.
 */
export declare function writeMarker(directory: string, marker: TavernMarker): Promise<void>;
/** Options for {@link ensureMarker}. */
export interface EnsureMarkerOptions {
    /** Replace a structurally invalid marker instead of throwing. */
    readonly force?: boolean;
    /** Mode for a newly written marker (defaults to role-play). */
    readonly mode?: TavernMode;
}
/**
 * Ensure a directory carries a valid marker, creating one when absent.
 * @param directory - workspace directory.
 * @param title - optional display title for a newly created marker.
 * @param options - invalid-marker handling.
 * @returns the existing or created marker.
 * @throws TavernMarkerInvalidError when a stored marker is invalid and `force` is false.
 * @throws TavernMarkerVersionError when a stored marker is newer than this build.
 */
export declare function ensureMarker(directory: string, title?: string, options?: EnsureMarkerOptions): Promise<TavernMarker>;
/** A create request named a directory or workspace this build cannot use. */
export declare class TavernInputError extends Error {
    constructor(message: string);
}
/** One registered workspace with its tavern status resolved. */
export interface TavernWorkspaceSummary {
    /** DSH workspace id. */
    readonly id: string;
    /** Canonical workspace directory. */
    readonly path: string;
    /** Display title of the workspace. */
    readonly title: string;
    /** Whether the workspace directory carries a valid tavern marker. */
    readonly tavern: boolean;
}
/** Everything the tavern panel needs for one render. */
export interface TavernOverview {
    /** Root directory new taverns default to. */
    readonly defaultRoot: string;
    /** Registered tavern workspaces in registry order. */
    readonly taverns: readonly TavernWorkspaceView[];
    /** Every registered workspace, in registry order. */
    readonly workspaces: readonly TavernWorkspaceSummary[];
}
/** One workspace's prompt assembly order as served to the panel. */
export interface PromptLayoutSnapshot {
    /** DSH workspace id. */
    readonly workspaceId: string;
    /** Which of the two prompts this layout orders. */
    readonly scope: PromptScope;
    /** Display title of the workspace. */
    readonly workspaceTitle: string;
    /** Workspace directory. */
    readonly workspacePath: string;
    /** System-prompt blocks in assembly order. */
    readonly blocks: readonly PromptBlockView[];
    /** Whether the workspace has an imported character card. */
    readonly hasCharacterCard: boolean;
    /** ISO-8601 of the last write, when the layout was saved. */
    readonly savedAt?: string;
}
/** Input of one tavern creation. */
export interface CreateTavernInput {
    /** Display title; also names the default directory. */
    readonly title?: string;
    /** Explicit absolute directory; defaults below {@link defaultTavernRoot}. */
    readonly path?: string;
    /** Mode chosen before creation; defaults to role-play. */
    readonly mode?: TavernMode;
}
/** Creates or reuses the DSH registration of one prepared directory. */
export interface TavernWorkspaceRegistrar {
    /** @param directory - existing directory. @param title - new-workspace title. @returns the registered workspace. */
    create(directory: string, title?: string): Promise<TavernWorkspaceRecord>;
}
/**
 * Root directory for taverns created without an explicit path.
 * @returns `<DSH_HOME>/taverns`.
 */
export declare function defaultTavernRoot(): string;
/**
 * Directory-safe name for one tavern title.
 * @param title - display title.
 * @returns a non-empty single path segment.
 */
export declare function tavernSlug(title: string): string;
/**
 * Resolve the directory one create request writes into.
 * @param input - create request.
 * @param root - default root for title-only requests.
 * @returns an absolute directory path.
 * @throws TavernInputError when neither a usable title nor an absolute path is given.
 */
export declare function resolveTavernDirectory(input: CreateTavernInput, root: string): string;
/**
 * Prepare a directory as a tavern and register it as a DSH workspace.
 *
 * Order follows D004: create the directory, write the marker atomically, then
 * register the workspace. A failed registration leaves the marker in place, so
 * retrying the same request recovers instead of losing the tavern identity.
 * @param registrar - DSH workspace registrar adapter.
 * @param input - wanted title and optional directory.
 * @param root - default root for title-only requests.
 * @returns the tavern view for the created (or reused) workspace.
 */
export declare function createTavernWorkspace(registrar: TavernWorkspaceRegistrar, input: CreateTavernInput, root?: string): Promise<TavernWorkspaceView>;
/**
 * Scan every registered workspace for tavern markers.
 * @param source - registered workspaces.
 * @returns tavern views and every workspace's tavern flag, in source order.
 */
export declare function overviewTaverns(source: TavernWorkspaceSource): Promise<{
    readonly taverns: readonly TavernWorkspaceView[];
    readonly workspaces: readonly TavernWorkspaceSummary[];
}>;
/** Workspace facts the marker registry reads; the Cordis service adapts DSH to this. */
export interface TavernWorkspaceSource {
    /** @returns every registered workspace. */
    list(): readonly TavernWorkspaceRecord[];
    /** @param id - workspace id. @returns the registered workspace, if any. */
    get(id: string): TavernWorkspaceRecord | undefined;
}
/** Observability hooks for the marker registry. */
export interface TavernMarkerRegistryOptions {
    /** Report a workspace whose marker could not be read (I/O or permission failure). */
    readonly onScanError?: (error: unknown, workspace: TavernWorkspaceRecord) => void;
}
/**
 * Marker operations over a workspace source. Framework-free so it is unit
 * testable without a Cordis context.
 */
export declare class TavernMarkerRegistry {
    private readonly source;
    private readonly options;
    constructor(source: TavernWorkspaceSource, options?: TavernMarkerRegistryOptions);
    /**
     * Scan registered workspaces for tavern markers.
     * @returns tavern workspaces in registry order.
     */
    list(): Promise<readonly TavernWorkspaceView[]>;
    /**
     * @param directory - candidate directory.
     * @returns whether the directory carries a marker.
     */
    isTavernDirectory(directory: string): Promise<boolean>;
    /**
     * @param cwd - session working directory.
     * @returns whether a session in that directory is a tavern session.
     */
    isTavernSessionCwd(cwd: string | undefined): Promise<boolean>;
}
/**
 * Host service exposed as `ctx.tavernWorkspaces`.
 *
 * DSH emits no workspace create/delete events, so callers reconcile on demand:
 * startup, tavern creation/adoption, session creation, and client refresh.
 */
export declare class TavernWorkspaceService extends Service {
    static inject: string[];
    private readonly source;
    private readonly markers;
    /** Agents already asked to switch presets, so a failure does not loop. */
    private readonly presetAttempts;
    /** Tavern sessions by id, so the request cleaner can resolve their workspace. */
    private readonly tavernSessionCwd;
    /**
     * In-flight opening generations, keyed by story directory.
     *
     * The pre-chat card asks for the script and the first beat also needs it; a
     * player who types while the card is still spinning must not trigger a second
     * model call, and must still get the script staged rather than the fallback.
     */
    private readonly openingGenerations;
    /**
     * Sessions with a regeneration queued but not yet run, and when it was
     * queued. A second request inside the window is a double click, not two
     * regenerations; the window also expires an entry whose turn never ran.
     */
    private readonly pendingRegenerations;
    /**
     * @param ctx - Cordis context carrying `workspaceRegistry`.
     */
    constructor(ctx: Context);
    /** @returns every tavern workspace. */
    list(): Promise<readonly TavernWorkspaceView[]>;
    /** @param directory - candidate directory. @returns whether it is a tavern directory. */
    isTavernDirectory(directory: string): Promise<boolean>;
    /** @param cwd - session working directory. @returns whether the session is a tavern session. */
    isTavernSessionCwd(cwd: string | undefined): Promise<boolean>;
    /**
     * Snapshot every registered workspace with its tavern status.
     * @returns the tavern panel's read model.
     */
    overview(): Promise<TavernOverview>;
    /**
     * Create (or recover) one tavern workspace: directory, marker, registration.
     * @param input - wanted title and optional directory.
     * @returns the created or reused tavern workspace.
     */
    create(input: CreateTavernInput): Promise<TavernWorkspaceView>;
    /**
     * Read one tavern workspace's system-prompt assembly order.
     * @param workspaceId - registered tavern workspace id.
     * @param scope - which prompt to read; the character prompt by default.
     * @returns the persisted layout, or the catalogue default.
     */
    promptLayout(workspaceId: string, scope?: PromptScope): Promise<PromptLayoutSnapshot>;
    /**
     * Persist one tavern workspace's system-prompt assembly order.
     * @param workspaceId - registered tavern workspace id.
     * @param input - a full block ordering, or `reset` for the catalogue default.
     * @param scope - which prompt to write; the character prompt by default.
     * @returns the stored layout.
     */
    savePromptLayout(workspaceId: string, input: {
        blocks?: unknown;
        reset?: boolean;
    }, scope?: PromptScope): Promise<PromptLayoutSnapshot>;
    /**
     * Assemble the prompt one scope would produce, without calling a model.
     * @param workspaceId - registered tavern workspace id.
     * @param options - scope, optional card, the sample line to scan, and the
     *   session whose stage/world the preview should reflect.
     * @returns the assembled system prompt and the lore it activated.
     */
    previewPrompt(workspaceId: string, options?: {
        scope?: PromptScope;
        cardId?: string;
        sample?: string;
        sessionId?: string;
    }): Promise<PromptPreview>;
    /** Resolve one registered workspace and require its tavern marker. */
    private requireTavernWorkspace;
    /**
     * Read one tavern workspace's worldbook.
     * @param workspaceId - registered tavern workspace id.
     * @returns the stored book.
     */
    worldbook(workspaceId: string): Promise<WorldbookFile>;
    /**
     * Replace one tavern workspace's worldbook.
     * @param workspaceId - registered tavern workspace id.
     * @param entries - complete entry list.
     * @returns the stored book.
     */
    saveWorldbook(workspaceId: string, entries: unknown): Promise<WorldbookFile>;
    /**
     * Read one tavern workspace's player personas.
     * @param workspaceId - registered tavern workspace id.
     * @returns the stored library.
     */
    personas(workspaceId: string): Promise<PersonaFile>;
    /**
     * Replace one tavern workspace's persona library and active pointer.
     *
     * The caller sends the whole library so one save cannot interleave with
     * another editor's changes; this is a workspace-level replace, not a
     * per-field patch.
     * @param workspaceId - registered tavern workspace id.
     * @param input - full persona list and the active pointer.
     * @returns the stored library.
     */
    savePersonas(workspaceId: string, input: {
        personas?: unknown;
        activeId?: unknown;
    }): Promise<PersonaFile>;
    /** List every character card stored in one tavern workspace. */
    characterCards(workspaceId: string): Promise<CharacterCardListing>;
    /** Create one character card in a tavern workspace. */
    createCharacterCard(workspaceId: string, input: CharacterCardInput): Promise<CharacterCard>;
    /** Save one existing character card. */
    saveCharacterCard(workspaceId: string, id: string, input: CharacterCardInput): Promise<CharacterCard>;
    /** Delete one character card. */
    deleteCharacterCard(workspaceId: string, id: string): Promise<boolean>;
    /**
     * Render one stored card as a downloadable `.charc` document.
     * @param workspaceId - registered tavern workspace id.
     * @param id - card id.
     * @returns the suggested file name and the document text.
     * @throws CharacterCardInvalidError when the card is absent.
     */
    exportCharacterCard(workspaceId: string, id: string): Promise<{
        file: string;
        text: string;
    }>;
    /**
     * Import one `.charc` document into a workspace as a new card.
     * @param workspaceId - registered tavern workspace id.
     * @param text - uploaded document.
     * @returns the stored card.
     */
    importCharacterCard(workspaceId: string, text: string): Promise<CharacterCard>;
    /**
     * Render one workspace's worldbook as a downloadable `.world` document.
     * @param workspaceId - registered tavern workspace id.
     * @returns the suggested file name and the document text.
     */
    exportWorldbook(workspaceId: string): Promise<{
        file: string;
        text: string;
    }>;
    /**
     * Replace one workspace's worldbook from a `.world` document.
     * @param workspaceId - registered tavern workspace id.
     * @param text - uploaded document.
     * @returns the stored book.
     */
    importWorldbook(workspaceId: string, text: string): Promise<WorldbookFile>;
    /**
     * Assemble a directory's workspace-level system prompt text (D005).
     *
     * The session-side preset row calls this with the session cwd: it resolves
     * the containing tavern workspace and renders that workspace's enabled
     * prompt blocks. Nothing global or cross-workspace participates.
     * @param directory - session working directory.
     * @returns the assembled text, or `undefined` when the directory is not inside a tavern workspace.
     */
    assemblePromptText(directory: string | undefined): Promise<string | undefined>;
    /**
     * Register the JSON routes backing the tavern panel.
     *
     * `webServer` is optional at the Host half so the marker service still runs
     * in profiles without the Web layer; the routes exist only where the panel
     * can run.
     */
    /**
     * Auto-bind sessions created inside a tavern workspace to the `tavern` preset.
     *
     * The UI preset picker is only a preference; a session keeps whatever preset
     * its header named when the agent was created. This listener closes that gap
     * (D005): every agent whose cwd belongs to a tavern workspace is reassigned
     * to `tavern` unless it already uses it.
     */
    /**
     * Keep the internal tavern presets out of the manual preset roster.
     *
     * They are bound automatically to sessions created inside a tavern workspace;
     * offering them in the new-session picker (or as a default) would let users
     * select them in non-tavern workspaces, where they must never run. The filter
     * only wraps the roster read, so `agentPresets.select()` for auto-binding is
     * unaffected.
     *
     * The registry exposes no roster-filter extension point, so this wraps the
     * prototype method and restores it when the plugin unloads. Without the
     * restore, a reloaded plugin would stack a second wrapper and the module-level
     * marker that used to guard this kept a disposed instance patched forever.
     */
    private hideTavernPresetFromRoster;
    private bindTavernPreset;
    /**
     * Record the final tavern request for inspection (observer only).
     *
     * GenerateOptions is deeply frozen by the agent loop, so request cleanup
     * happens at `system-prompt/assemble` (tools + contexts) and at
     * `agent/pre-step` (injected reminder messages) on the agent context. This
     * `llm/stream` listener only writes the request the provider is about to see.
     */
    private installRequestCleaner;
    /**
     * Run one role-play beat: director decides, then each speaking character
     * answers from its own card in an isolated model call.
     *
     * The returned stream stands in for the session's own model call, so the
     * agent loop records one assistant reply while the stage receives the
     * structured narration and speech.
     * @param cwd - tavern workspace directory.
     * @param options - the intercepted loop request, used for provider and model.
     * @returns the reply stream consumed by the agent loop.
     */
    private orchestrateBeat;
    /**
     * Run one auxiliary completion to a finished string plus its reported usage.
     *
     * The orchestrator replaces the agent loop's own model call, so adapter usage
     * chunks would otherwise be dropped before reaching the loop: the loop would
     * record an assistant message with no usage, and the token-meter projection
     * would report zero for every tavern session.
     * @param options - the intercepted request, providing provider and model.
     * @param system - system prompt for this call.
     * @param messages - user turns.
     * @param choice - per-role model override; omitted follows the session.
     * @param maxReplyChars - reply budget in characters; omitted sends no cap.
     * @param reasoningReserve - tokens added to the cap for the model's thinking.
     * @returns the concatenated text output and the call's usage, when reported.
     */
    private complete;
    /** Persist one beat's prompts and outcome for inspection. */
    private writeBeat;
    /** Resolve a session's tavern cwd, falling back to the session store. */
    private tavernSessionCwdFor;
    /**
     * Drop non-working-directory required contexts from tavern requests.
     *
     * `step()` calls `systemPrompt.refreshContext()` after `agent/pre-step` and
     * restores every `required` context that the assembly lost (notably
     * `team:identity` from the globally installed agent-team plugin). That call
     * happens after both assembly and pre-step, so the only place to filter it is
     * the service method itself. The wrapper is inert outside tavern sessions.
     *
     * The service offers no per-assembly hook here, so this wraps the prototype
     * method inside an effect: unloading the plugin must remove the wrapper, or a
     * stale closure over a disposed context would throw on every later assembly.
     */
    private installRequiredContextFilter;
    private recordFinalRequest;
    /**
     * Register the workspace-level system prompt on a tavern agent.
     *
     * The preset row is not mounted reliably early enough for the first turn, so
     * the host registers the complete section directly on the agent context.
     * DSH assembles the prompt before dispatching `agent/pre-step`, therefore the
     * section text provider reads the workspace layout synchronously; an async
     * refresh hook would leave the first turn with an empty prompt.
     * @param agent - the newly created agent.
     */
    private setupTavernAgent;
    private debugLog;
    private ensureTavernPreset;
    /** Resolve the internal preset id for a directory's tavern mode. */
    private tavernPresetForDirectory;
    private registerHttp;
    private handleState;
    private handleCreate;
    private handlePromptLayout;
    /** Character-card CRUD for one tavern workspace. */
    private handleCharacters;
    /** Import or export one character card as a `.charc` document. */
    private handleCharacterTransfer;
    /** Import or export one workspace's worldbook as a `.world` document. */
    private handleWorldbookTransfer;
    /**
     * Resolve one workspace's opening: scene setting plus the first character line.
     * @param workspaceId - registered tavern workspace id.
     * @returns the resolved opening; both fields are absent when no card defines them.
     */
    opening(workspaceId: string): Promise<TavernOpening>;
    /**
     * Read a story's generated opening script, generating it on first use.
     *
     * The script is written once per chat and stored under that chat's story
     * directory, so reopening never spends another call and never changes what the
     * player already read. Reading it does not touch the transcript: the opening
     * becomes a real turn only when {@link requestOpening} queues one.
     * @param workspaceId - registered tavern workspace id.
     * @param sessionId - chat identity owning the script.
     * @returns the stored or freshly generated script; empty when it cannot be written.
     */
    ensureOpeningScript(workspaceId: string, sessionId: string): Promise<OpeningScript>;
    /**
     * Queue the opening as a turn of its own.
     *
     * The opening must precede the player's first message, and the transcript
     * order is turn order, so it cannot be prepended to the first reply. A turn
     * also cannot be written from outside the loop: the loop owns turn numbering,
     * and a turn it did not open makes the session unreadable on reload. Queuing
     * an inbox message with the opening source is therefore the only sound way to
     * produce it — the loop opens the turn, and the orchestrator fills it with
     * the script instead of calling the director.
     *
     * A story that already has turns keeps its existing opening; a second call is
     * a no-op so the greeting card can retry freely.
     * @param workspaceId - registered tavern workspace id.
     * @param sessionId - chat identity.
     * @returns whether the opening turn was queued.
     */
    requestOpening(workspaceId: string, sessionId: string): Promise<{
        queued: boolean;
    }>;
    /**
     * Describe one story's regeneration state.
     *
     * `replayableTurn` is the only turn the action can replace: the rewind target
     * is always the newest beat. The client uses it to hide the action on turns
     * that cannot be regenerated (an opening-only story, or any older reply)
     * instead of offering a button that would immediately refuse.
     * @param workspaceId - registered tavern workspace id.
     * @param sessionId - chat identity.
     * @returns superseded turns and the newest replayable turn, when known.
     */
    regenerationState(workspaceId: string, sessionId: string): Promise<{
        regenerations: RegenerationRecord[];
        replayableTurn?: number;
    }>;
    /**
     * Start one regeneration turn for a story.
     *
     * Only the newest beat can be replayed: the mechanism rolls the story state
     * back to that beat's start, so an older turn would have to discard every
     * turn after it. The newest beat's turn number is the check that the caller
     * and the story agree on which reply is being replaced.
     * @param workspaceId - registered tavern workspace id.
     * @param sessionId - chat identity.
     * @param turn - turn the caller is regenerating.
     * @returns the turn that will receive the replacement reply.
     * @throws TavernInputError when the request is stale, the story has no beat,
     *   or the agent is busy.
     */
    requestRegeneration(workspaceId: string, sessionId: string, turn: number): Promise<{
        turn: number;
    }>;
    /**
     * Queue one non-player trigger turn.
     *
     * A turn cannot be written from outside the loop: the loop owns turn
     * numbering, and a turn it did not open makes the session unreadable on
     * reload. The only sound way to run work as a turn is an inbox message the
     * loop claims, so every trigger uses this path.
     * @param sessionId - chat identity.
     * @param kind - source kind the orchestrator dispatches on.
     * @param text - model-facing trigger body; never player text.
     * @param summary - one-line account shown on the context row.
     * @returns whether the trigger was accepted.
     */
    private queueTrigger;
    /**
     * Read the opening as beat segments and stage lines.
     *
     * Shared by the opening turn and the legacy inline fallback so both render
     * the script identically.
     * @param cwd - tavern workspace directory.
     * @param story - owning session id.
     * @param cards - cards whose static opening is the fallback.
     * @returns display segments, the stage lines that record them, and the
     *   generation call when a script was used.
     */
    private openingBeatSegments;
    /**
     * Roll a story back to the state the newest beat started from.
     *
     * The transcript is append-only, so regeneration cannot delete the old
     * reply. The story state is what matters: cutting the stage and restoring
     * the director's world means the replay never reads the discarded draft, and
     * the new reply is appended as the next turn while the old one is marked
     * superseded through {@link appendRegeneration}.
     *
     * Nothing is written here. The caller commits the trimmed stage only after
     * the replay settles, so a failed replay leaves the replaced beat intact
     * instead of deleting it without a replacement.
     * @param cwd - tavern workspace directory.
     * @param story - owning session id, when the request has one.
     * @returns the beat to replay and the state it started from, or `undefined`
     *   when the story has no replayable beat.
     */
    private rewindForRegeneration;
    /**
     * Latest turn number recorded for one session.
     * @param sessionId - chat identity.
     * @returns the projection's `lastTurn`, or 0 when it cannot be read.
     */
    private lastTurnOf;
    /**
     * Generate a story's opening script from its workspace directory.
     *
     * Shared by the pre-chat route (which only knows the workspace id) and the
     * first beat (which only knows the directory), so both join one call.
     * @param workspacePath - tavern workspace root.
     * @param sessionId - chat identity.
     * @returns the stored or generated script; empty when it cannot be produced.
     */
    private ensureOpeningScriptForDirectory;
    /**
     * Append one beat's prompts to the session log.
     *
     * The orchestrator builds its own requests, so the loop never records them as
     * `system/message`; without this record the prompts that actually decided the
     * reply exist only in the beat file, and Trajectory can show nothing but the
     * unchanging workspace prompt. The record is an ignorable plugin record, so it
     * never enters derived model history, and a failure here must not fail a beat
     * that has already committed its story state.
     * @param sessionId - chat identity.
     * @param log - assembled record.
     */
    private appendBeatLog;
    /**
     * Read the model labels one beat's calls used, for the log record.
     * @param config - workspace orchestration settings.
     * @param options - the intercepted loop request, the fallback route.
     * @param turns - the beat's recorded calls.
     * @returns director and per-character labels.
     */
    private beatModels;
    /**
     * Generate and store one story's opening script.
     * @param workspacePath - tavern workspace root.
     * @param directory - story directory owning the script file.
     * @param sessionId - chat identity, used to check the stage is still empty.
     * @returns the generated script, or an empty one when it cannot be produced.
     */
    private generateOpeningScript;
    /**
     * Provider and model a brand-new session would use.
     *
     * A chat that has never sent a request has no request header, so the adapter
     * default is the only source. Read defensively: the service is optional on a
     * profile without a model picker.
     * @returns the selection, or `undefined` when no default is available.
     */
    private defaultSelection;
    /**
     * Read one workspace's agent orchestration settings.
     * @param workspaceId - registered tavern workspace id.
     * @returns the stored config, or the defaults when absent.
     */
    agentConfig(workspaceId: string): Promise<TavernAgentConfig>;
    /**
     * Replace one workspace's agent orchestration settings.
     * @param workspaceId - registered tavern workspace id.
     * @param value - full config payload, validated before writing.
     * @returns the stored config.
     */
    saveAgentConfig(workspaceId: string, value: unknown): Promise<TavernAgentConfig>;
    /**
     * Read one workspace's agent orchestration settings plus the defaults.
     * @param workspaceId - registered tavern workspace id.
     * @returns the stored config, the defaults, and every field's bounds.
     */
    agentConfigView(workspaceId: string): Promise<{
        config: TavernAgentConfig;
        defaults: TavernAgentConfig;
        status: 'stored' | 'default';
    }>;
    /** List every provider route and its models, for the model picker. */
    modelCatalog(): Promise<readonly {
        provider: string;
        name: string;
        models: readonly {
            id: string;
            name: string;
        }[];
    }[]>;
    /** Resolve one story's opening for the pre-chat card. */
    private handleGreeting;
    /**
     * Queue the story's opening as its own turn.
     *
     * The pre-chat card calls this once the script exists. It is separate from
     * `GET /tavern/greeting` because reading the script is idempotent while
     * starting a turn is not.
     */
    private handleOpening;
    /**
     * Read one story's superseded turns, or start a regeneration.
     *
     * `GET` reports which turns were replaced so the transcript can label them.
     * `POST` validates that the named turn is the newest beat and then queues the
     * regeneration trigger, which wakes the agent and runs one replaying beat.
     */
    private handleRegenerate;
    /** Read, replace, or reset one workspace's agent orchestration settings. */
    private handleAgentConfig;
    /** List provider routes and models for the model picker. */
    private handleModelCatalog;
    /** Read or replace one tavern workspace's player personas. */
    private handlePersonas;
    /** Assemble one scope's prompt for inspection. */
    private handlePreview;
    /** Read or replace one tavern workspace's worldbook. */
    private handleWorldbook;
    /** TEMPORARY: report live agent-preset compositions for diagnosis. */
    private handleDebugPresets;
    /** Answer one failed tavern request with the closest status category. */
    private fail;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Tavern workspace marker registry. */
        tavernWorkspaces: TavernWorkspaceService;
    }
}
/**
 * Extract the player's latest utterance from a loop-built request.
 *
 * The loop appends harness-authored user messages after the player's own — the
 * runtime-context snapshot and skill-change reminders — so those are skipped by
 * content, never by position.
 * @param options - the intercepted request.
 * @returns the last player-authored message text, bounded to the accepted size.
 */
/**
 * Extract the player's latest utterance from a loop-built request.
 *
 * The loop appends harness-authored user messages after the player's own — the
 * runtime-context snapshot and skill-change reminders — so those are skipped by
 * kind rather than position.
 * @param options - the intercepted loop request.
 * @param max - longest prefix forwarded; defaults to the shipped limit.
 * @returns the player's text, or an empty string when the turn has none.
 */
export declare function lastUserText(options: GenerateOptions, max?: number): string;
/**
 * Whether this turn was started by the opening action.
 * @param options - the intercepted loop request.
 * @returns true when the beat must stage the opening script.
 */
export declare function isOpeningRequest(options: GenerateOptions): boolean;
/**
 * Whether this turn was started by the regenerate action rather than a prompt.
 *
 * The trigger carries its own source kind, so the check reads the newest
 * non-harness user message instead of matching text: the player could type the
 * same words.
 * @param options - the intercepted loop request.
 * @returns true when the beat must replay the previous one.
 */
export declare function isRegenerationRequest(options: GenerateOptions): boolean;
/**
 * Source kind of a turn-starter this plugin does not own.
 *
 * A tavern session is still a DSH session, so features that wake it on their own
 * schedule deliver their messages here too. Those are not the player speaking:
 * treating one as an utterance lets a cron reminder's prompt text become the
 * beat's input and drives the story in a direction nobody asked for.
 * @param options - the intercepted loop request.
 * @returns the kind (for example `schedule`), or `undefined` for a player turn
 *   and for the two triggers this plugin queues itself.
 */
export declare function externalTriggerKind(options: GenerateOptions): string | undefined;
/**
 * Build a single-text-block reply stream.
 *
 * Usage is forwarded as its own chunk before `finish`: the agent loop records
 * whatever usage chunk the stream carries, and the token-meter projection folds
 * it into the session totals.
 *
 * The text is emitted as one closed block, never as a token delta. DSH derives
 * output speed from the first token delta and the message settle time; this
 * reply is assembled after several sequential model calls, so a synthetic delta
 * emitted here would report hundreds of thousands of tok/s for a beat that
 * actually took seconds. Without a delta the loop records no decode window and
 * the speed pill stays absent, while token counts, cache rate, and the rendered
 * message are unaffected.
 * @param options - the intercepted request, used for provider attribution.
 * @param text - assistant text to emit.
 * @param usage - summed usage of every model call this beat made.
 * @returns the chunk stream.
 */
export declare function textReply(options: GenerateOptions, text: string, usage?: TokenUsage): AsyncGenerator<StreamChunk>;
export default TavernWorkspaceService;
