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
import { Service } from '@deepseek-ai/cordis';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpRequestError, allowLoopback, methodNotAllowed, optionalString, readJsonObject, sendJson } from '../http.js';
import { listCharacterCards } from '../character-card.js';
import { readStage, readWorld, storyDirectory } from '../stage.js';
import { listBeats, readRegenerations } from '../regenerate.js';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { TRACKER_POLL_MS, TRACKER_SCHEMA, TrackerConfigInvalidError, defaultTrackerConfig, listTrackerSummaries, readTrackerConfig, readTrackerState, staleTurnsAfterWrite, trackerDue, trackedTurns, writeTrackerConfig, writeTrackerState, writeTrackerSummary, } from './summary.js';
import { buildTrackerMessage, buildTrackerSystem, parseTrackerReply, renderTranscript } from './prompt.js';
/** Service name this plugin publishes. */
export const TRACKER_SERVICE = 'tavernTracker';
/** Route serving the tracker snapshot and accepting actions. */
export const TRACKER_ROUTE = '/tavern-tracker/state';
/** Route the client probes to decide whether this sub-plugin is active. */
export const TRACKER_PING_ROUTE = '/tavern-tracker/ping';
/** Version stamped on every response, so the client can refuse a mismatch. */
export const TRACKER_API_SCHEMA = 1;
/**
 * Host plugin: schedules and runs progress tracking for one tavern workspace.
 *
 * Loads with `workspaceRegistry`; `webServer` and `llm` are injected optionally
 * so a profile without the Web layer or a model route still loads the plugin
 * and simply reports the feature as unavailable.
 */
export class TavernTrackerService extends Service {
    static inject = ['workspaceRegistry'];
    workspaces;
    /** Chats with a run in flight, so a slow model cannot stack requests. */
    running = new Set();
    /** Last failure per chat, cleared by the next successful run. */
    failures = new Map();
    /**
     * @param ctx - Cordis context carrying the workspace registry.
     */
    constructor(ctx) {
        super(ctx, TRACKER_SERVICE);
        this.workspaces = ctx.workspaceRegistry;
        this.registerRoutes();
        this.startScheduler();
    }
    /**
     * Read one workspace's tracker snapshot.
     * @param workspaceId - registered tavern workspace id.
     * @returns the panel's read model.
     * @throws Error when the workspace is not registered.
     */
    async snapshot(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (workspace === undefined)
            throw new Error(`工作区不存在：${workspaceId}`);
        const config = await readTrackerConfig(workspace.path);
        const chats = await this.listChats(workspace.path);
        const views = [];
        for (const sessionId of chats) {
            const [summaries, newestTurn, staleTurns] = await Promise.all([
                listTrackerSummaries(workspace.path, sessionId),
                this.newestTurnOf(workspace.path, sessionId),
                this.staleTurnsOf(workspace.path, sessionId),
            ]);
            const failure = this.failures.get(cacheKey(workspace.path, sessionId));
            views.push({
                sessionId,
                newestTurn,
                summaries,
                trackedTurns: trackedTurns(summaries),
                runCount: summaries.length,
                running: this.running.has(cacheKey(workspace.path, sessionId)),
                staleTurns,
                ...(failure === undefined ? {} : { lastError: failure }),
            });
        }
        views.sort((left, right) => right.newestTurn - left.newestTurn);
        return {
            schema: TRACKER_API_SCHEMA,
            workspaceId: workspace.id,
            workspaceTitle: workspace.title,
            workspacePath: workspace.path,
            config,
            defaults: defaultTrackerConfig(),
            chats: views,
            generatedAt: new Date().toISOString(),
        };
    }
    /**
     * Persist one workspace's tracker settings.
     * @param workspaceId - registered tavern workspace id.
     * @param value - full config payload, validated before writing.
     * @returns the stored config.
     */
    async saveConfig(workspaceId, value) {
        const workspace = this.workspaces.get(workspaceId);
        if (workspace === undefined)
            throw new Error(`工作区不存在：${workspaceId}`);
        return writeTrackerConfig(workspace.path, value);
    }
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
    async track(workspaceId, sessionId) {
        const workspace = this.workspaces.get(workspaceId);
        if (workspace === undefined)
            throw new Error(`工作区不存在：${workspaceId}`);
        const key = cacheKey(workspace.path, sessionId);
        if (this.running.has(key))
            return { started: false, reason: '这个会话已经在追踪中' };
        const newestTurn = await this.newestTurnOf(workspace.path, sessionId);
        if (newestTurn === 0)
            return { started: false, reason: '这个会话还没有可追踪的剧情' };
        const config = await readTrackerConfig(workspace.path);
        this.running.add(key);
        void this.runTracking(workspace.path, sessionId, config, newestTurn);
        return { started: true };
    }
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
    startScheduler() {
        this.ctx.effect(() => {
            const timer = setInterval(() => { void this.schedule(); }, TRACKER_POLL_MS);
            // A tracking run must never keep the process alive on its own.
            timer.unref?.();
            return () => { clearInterval(timer); };
        }, 'dshtavern-tracker: schedule');
    }
    /** One scheduler tick: start a run for every chat that is due. */
    async schedule() {
        for (const workspace of this.workspaces.list()) {
            let config;
            try {
                config = await readTrackerConfig(workspace.path);
            }
            catch (error) {
                this.ctx.logger.warn(`[dshtavern-tracker] cannot read config for '${workspace.path}': ${String(error)}`);
                continue;
            }
            if (!config.enabled)
                continue;
            let chats;
            try {
                chats = await this.listChats(workspace.path);
            }
            catch (error) {
                this.ctx.logger.warn(`[dshtavern-tracker] cannot list stories in '${workspace.path}': ${String(error)}`);
                continue;
            }
            for (const sessionId of chats) {
                const key = cacheKey(workspace.path, sessionId);
                if (this.running.has(key))
                    continue;
                try {
                    const [state, newestTurn] = await Promise.all([
                        readTrackerState(workspace.path, sessionId),
                        this.newestTurnOf(workspace.path, sessionId),
                    ]);
                    if (!trackerDue(config, state, newestTurn, Date.now()))
                        continue;
                    this.running.add(key);
                    void this.runTracking(workspace.path, sessionId, config, newestTurn);
                }
                catch (error) {
                    this.ctx.logger.warn(`[dshtavern-tracker] scheduling failed for '${sessionId}': ${String(error)}`);
                }
            }
        }
    }
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
    async runTracking(workspacePath, sessionId, config, newestTurn) {
        const key = cacheKey(workspacePath, sessionId);
        try {
            const state = await readTrackerState(workspacePath, sessionId);
            const [stage, world, cards] = await Promise.all([
                readStage(workspacePath, sessionId),
                readWorld(workspacePath, sessionId),
                listCharacterCards(workspacePath),
            ]);
            const transcript = renderTranscript(stage, config.maxTranscriptChars);
            if (transcript.chars === 0) {
                this.failures.set(key, '这个会话还没有写入舞台的剧情');
                return;
            }
            const selection = config.model ?? this.defaultSelection();
            if (selection === undefined) {
                this.failures.set(key, '当前部署没有可用的模型路由');
                return;
            }
            const llm = this.llm();
            if (llm === undefined) {
                this.failures.set(key, '当前部署没有 LLM 服务');
                return;
            }
            const system = buildTrackerSystem({ cards: cards.cards, world, lengths: config.lengths });
            const message = buildTrackerMessage(transcript.text, newestTurn);
            let reply = '';
            let usage;
            const stream = llm.stream({
                provider: selection.provider,
                model: selection.model,
                system,
                messages: [createUserMessage({ content: [{ type: 'text', text: message }], source: { kind: 'user' } })],
            });
            for await (const chunk of stream) {
                if (chunk.type === 'text-delta')
                    reply += chunk.text;
                else if (chunk.type === 'usage')
                    usage = chunk.usage;
                else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
                    throw new Error(chunk.reason.failure.message);
                }
            }
            const parsed = parseTrackerReply(reply, cards.cards, config.lengths);
            if (parsed === undefined) {
                this.failures.set(key, '模型没有返回可用的摘要 JSON');
                return;
            }
            const summary = {
                schema: TRACKER_SCHEMA,
                turn: newestTurn,
                at: new Date().toISOString(),
                model: `${selection.provider}/${selection.model}`,
                world: parsed.world,
                characters: parsed.characters,
                ...(parsed.user === undefined ? {} : { user: parsed.user }),
                transcriptChars: transcript.chars,
                ...(state.lastTurn > 0 ? { sinceTurn: state.lastTurn } : {}),
            };
            await writeTrackerSummary(workspacePath, sessionId, summary);
            await writeTrackerState(workspacePath, sessionId, {
                schema: TRACKER_SCHEMA,
                lastTurn: newestTurn,
                lastAt: summary.at,
            });
            this.failures.delete(key);
            this.ctx.logger.info(`[dshtavern-tracker] tracked '${sessionId}' through turn ${newestTurn} (${usage?.outputTokens ?? 0} output tokens)`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.failures.set(key, message);
            this.ctx.logger.warn(`[dshtavern-tracker] run failed for '${sessionId}': ${message}`);
        }
        finally {
            this.running.delete(key);
        }
    }
    /** @returns the LLM service when the profile has one. */
    llm() {
        return this.ctx.get('llm');
    }
    /**
     * Provider and model a run uses when the workspace names none.
     * @returns the deployment default, or `undefined` when unavailable.
     */
    defaultSelection() {
        const service = this.ctx.get('agentDefaultModel');
        const selection = service?.currentSelection?.();
        if (selection?.provider === undefined || selection.model === undefined)
            return undefined;
        return { provider: selection.provider, model: selection.model };
    }
    /**
     * Chats in one workspace that have a story on disk.
     * @param workspacePath - tavern workspace root.
     * @returns session ids.
     */
    async listChats(workspacePath) {
        // `storyDirectory(…, undefined)` is the state directory; its `stories/`
        // child holds one directory per chat.
        const storiesRoot = join(storyDirectory(workspacePath, undefined), 'stories');
        try {
            const entries = await readdir(storiesRoot, { withFileTypes: true });
            return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
        }
        catch {
            return [];
        }
    }
    /**
     * Turns covered by the newest ledger that a later regeneration replaced.
     * @param workspacePath - tavern workspace root.
     * @param sessionId - chat identity.
     * @returns superseded turns inside the ledger's range, ascending.
     */
    async staleTurnsOf(workspacePath, sessionId) {
        const directory = storyDirectory(workspacePath, sessionId);
        const [records, summaries] = await Promise.all([
            readRegenerations(directory),
            listTrackerSummaries(workspacePath, sessionId),
        ]);
        const newest = summaries[0];
        if (newest === undefined)
            return [];
        return staleTurnsAfterWrite(records, newest.turn, Date.parse(newest.at));
    }
    /**
     * Newest beat recorded for one chat.
     * @param workspacePath - tavern workspace root.
     * @param sessionId - chat identity.
     * @returns the newest turn, or 0 when the chat has no beat yet.
     */
    async newestTurnOf(workspacePath, sessionId) {
        const beats = await listBeats(storyDirectory(workspacePath, sessionId));
        const newest = beats[0];
        if (newest === undefined)
            return 0;
        return newest.record.turn ?? 0;
    }
    registerRoutes() {
        this.ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => webCtx.webServer.register({
                kind: 'exact',
                path: TRACKER_PING_ROUTE,
                handler: (req, res) => {
                    if (!allowLoopback(req, res))
                        return;
                    if (req.method !== 'GET') {
                        methodNotAllowed(res, 'GET');
                        return;
                    }
                    sendJson(res, 200, { ok: true, schema: TRACKER_API_SCHEMA });
                },
            }), 'dshtavern-tracker: ping');
            webCtx.effect(() => webCtx.webServer.register({
                kind: 'exact',
                path: TRACKER_ROUTE,
                handler: (req, res) => { void this.handleState(req, res); },
            }), 'dshtavern-tracker: state');
        });
    }
    /** Read the snapshot, save settings, or start a run. */
    async handleState(req, res) {
        if (!allowLoopback(req, res))
            return;
        try {
            const method = req.method ?? 'GET';
            if (method === 'GET') {
                const workspaceId = workspaceIdFromUrl(req);
                sendJson(res, 200, { ok: true, ...await this.snapshot(workspaceId) });
                return;
            }
            if (method !== 'POST') {
                res.setHeader('allow', 'GET, POST');
                sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' });
                return;
            }
            const body = await readJsonObject(req);
            const workspaceId = optionalString(body, 'workspaceId');
            if (workspaceId === undefined)
                throw new TrackerConfigInvalidError('缺少 workspaceId');
            const action = optionalString(body, 'action') ?? 'save';
            if (action === 'track') {
                const sessionId = optionalString(body, 'sessionId');
                if (sessionId === undefined)
                    throw new TrackerConfigInvalidError('缺少 sessionId');
                sendJson(res, 200, { ok: true, ...await this.track(workspaceId, sessionId) });
                return;
            }
            if (action !== 'save')
                throw new TrackerConfigInvalidError(`未知操作：${action}`);
            const config = body.reset === true
                ? await this.saveConfig(workspaceId, defaultTrackerConfig())
                : await this.saveConfig(workspaceId, body.config);
            sendJson(res, 200, { ok: true, config });
        }
        catch (error) {
            const status = error instanceof HttpRequestError
                ? error.status
                : error instanceof TrackerConfigInvalidError ? 400 : 500;
            if (status === 500)
                this.ctx.logger.warn(`[dshtavern-tracker] request failed: ${String(error)}`);
            sendJson(res, status, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
}
/** Cache key for one chat inside one workspace. */
function cacheKey(workspacePath, sessionId) {
    return `${workspacePath}\u0000${sessionId}`;
}
/** Read the `workspaceId` query parameter, rejecting a missing one. */
function workspaceIdFromUrl(req) {
    const workspaceId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('workspaceId');
    if (workspaceId === null || workspaceId.length === 0)
        throw new TrackerConfigInvalidError('缺少 workspaceId');
    return workspaceId;
}
export default TavernTrackerService;
