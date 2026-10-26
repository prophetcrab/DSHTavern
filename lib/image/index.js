/**
 * DSH-Tavern image generation sub-plugin.
 *
 * A separate plugin row (`dshtavern-image`) that owns the prompt workshop, the
 * provider adapters, scene images and character portraits. It is deliberately
 * outside the beat loop: nothing here runs unless the player clicks a button,
 * and the only third-party image call happens after a one-time approval id.
 *
 * Routes are loopback-only and split by resource. The client never sees an API
 * key; the workspace config never stores one.
 */
import { Service } from '@deepseek-ai/cordis';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { HttpRequestError, allowLoopback, methodNotAllowed, optionalString, readJsonObject, sendJson } from '../http.js';
import { listCharacterCards, readCharacterCard } from '../character-card.js';
import { ImageApprovalStore, APPROVAL_TTL_MS } from './approval.js';
import { IMAGE_ASPECTS, IMAGE_CONFIG_LIMITS, IMAGE_STYLES, ImageConfigInvalidError, defaultImageConfig, presetFor, readImageConfig, writeImageConfig, } from './config.js';
import { ImageCredentialError, clearProviderCredentials, credentialService, providerCredentialStatus, resolveProviderCredentials, writeProviderCredentials, } from './credentials.js';
import { ImagePromptError, buildRefineMessage, buildRefineSystem, findBeat, parseRefineReply, portraitPreview as buildPortraitPreview, scenePreview as buildScenePreview, } from './prompt.js';
import { IMAGE_PROVIDERS, imageProvider, providerCapabilities, providerLabel } from './providers/index.js';
import { ImageProviderError } from './providers/types.js';
import { ImageStoreError, activePortrait, listSceneImages, readPortraitFile, readPortraitIndex, readSceneImageFile, setActivePortrait, writePortrait, writeSceneImage, } from './store.js';
/** Service name this plugin publishes. */
export const IMAGE_SERVICE = 'tavernImage';
/** Routes owned by this sub-plugin. */
export const IMAGE_PING_ROUTE = '/tavern-image/ping';
export const IMAGE_CONFIG_ROUTE = '/tavern-image/config';
export const IMAGE_CREDENTIALS_ROUTE = '/tavern-image/credentials';
export const IMAGE_PREVIEW_ROUTE = '/tavern-image/preview';
export const IMAGE_REFINE_ROUTE = '/tavern-image/refine';
export const IMAGE_APPROVE_ROUTE = '/tavern-image/approve';
export const IMAGE_GENERATE_ROUTE = '/tavern-image/generate';
export const IMAGE_LIST_ROUTE = '/tavern-image/list';
export const IMAGE_PORTRAITS_ROUTE = '/tavern-image/portraits';
export const IMAGE_ACTIVE_ROUTE = '/tavern-image/portrait-active';
export const IMAGE_FILE_ROUTE = '/tavern-image/file';
/** Version stamped on JSON responses. */
export const IMAGE_API_SCHEMA = 1;
/** Longest prompt the host accepts. */
export const IMAGE_PROMPT_MAX = 8_000;
/** Longest negative prompt the host accepts. */
export const IMAGE_NEGATIVE_MAX = 2_000;
/** Longest draft/refined prompt the host stores. */
export const IMAGE_DRAFT_MAX = 8_000;
/** Largest request body this route family accepts. */
export const IMAGE_BODY_MAX_BYTES = 128 * 1024;
/** A request is structurally invalid. */
export class ImageInputError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.status = status;
        this.name = 'ImageInputError';
    }
}
/** Image sub-plugin service. */
export class TavernImageService extends Service {
    static inject = ['workspaceRegistry'];
    workspaces;
    approvals = new ImageApprovalStore();
    /** Workspaces with a provider call in flight; one image at a time per tavern. */
    generating = new Set();
    /**
     * @param ctx - Cordis context carrying the workspace registry.
     */
    constructor(ctx) {
        super(ctx, IMAGE_SERVICE);
        this.workspaces = ctx.workspaceRegistry;
        this.registerRoutes();
    }
    /** @returns the optional credential service. */
    credentials() {
        return credentialService(this.ctx);
    }
    /** @returns the optional LLM service. */
    llm() {
        return this.ctx.get('llm');
    }
    /** @returns the deployment default model. */
    defaultSelection() {
        const service = this.ctx.get('agentDefaultModel');
        const selection = service?.currentSelection?.();
        if (selection?.provider === undefined || selection.model === undefined)
            return undefined;
        return { provider: selection.provider, model: selection.model };
    }
    /** Resolve the model the current session is using, when the host can see it. */
    sessionModel(sessionId) {
        if (sessionId === undefined)
            return undefined;
        const sessions = this.ctx.get('sessions');
        const session = sessions?.get?.(sessionId);
        const request = session?.requestContext?.();
        if (request?.provider !== undefined && request.model !== undefined) {
            return { provider: request.provider, model: request.model };
        }
        const projections = this.ctx.get('sessionProjections');
        const state = session === undefined ? undefined : projections?.stateOf?.(session, 'modelSelection');
        const choice = state?.next ?? state?.lastUsed;
        if (choice?.provider !== undefined && choice.model !== undefined) {
            return {
                provider: choice.provider,
                model: choice.model,
                ...(choice.reasoningEffort === undefined ? {} : { reasoningEffort: choice.reasoningEffort }),
            };
        }
        return undefined;
    }
    /** Resolve one registered tavern workspace. */
    async requireWorkspace(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (workspace === undefined)
            throw new ImageInputError('工作区不存在', 404);
        try {
            await readFile(join(workspace.path, '.dshtavern', 'tavern.json'), 'utf8');
        }
        catch {
            throw new ImageInputError('该工作区不是酒馆', 404);
        }
        return workspace;
    }
    /** Resolve the selected provider, refusing an unimplemented one. */
    selectedProvider(config) {
        return config.provider === 'jimeng' ? 'jimeng' : 'openai-images';
    }
    /** Whether the selected provider has enough settings and credentials. */
    async configured(config) {
        const provider = this.selectedProvider(config);
        if (imageProvider(provider) === undefined)
            return false;
        const credentials = await providerCredentialStatus(this.credentials(), provider);
        if (!credentials.configured)
            return false;
        if (provider === 'openai-images') {
            const block = config.providers['openai-images'];
            return block.baseUrl.trim().length > 0 && block.model.trim().length > 0;
        }
        if (provider === 'jimeng') {
            const block = config.providers.jimeng;
            return block.endpoint.trim().length > 0 && block.reqKey.trim().length > 0;
        }
        return false;
    }
    /** Build the config read model. */
    async configView(workspaceId, sessionId) {
        const workspace = await this.requireWorkspace(workspaceId);
        const config = await readImageConfig(workspace.path);
        const provider = this.selectedProvider(config);
        const credential = await providerCredentialStatus(this.credentials(), provider);
        const sessionModel = this.sessionModel(sessionId);
        const providers = Object.keys(IMAGE_PROVIDERS).map(id => ({
            id: id,
            label: providerLabel(id),
            capabilities: providerCapabilities(id),
        }));
        return {
            schema: IMAGE_API_SCHEMA,
            workspaceId: workspace.id,
            workspaceTitle: workspace.title,
            workspacePath: workspace.path,
            config,
            defaults: defaultImageConfig(),
            provider,
            providerLabel: providerLabel(provider),
            capabilities: providerCapabilities(provider),
            providers,
            credential,
            configured: await this.configured(config),
            refineAvailable: this.llm() !== undefined,
            approvalTtlMs: APPROVAL_TTL_MS,
            ...(sessionModel === undefined ? {} : { sessionModel }),
        };
    }
    /** Save config; secrets are rejected because they belong in the credential store. */
    async saveConfig(workspaceId, value) {
        const workspace = await this.requireWorkspace(workspaceId);
        await writeImageConfig(workspace.path, value);
        return this.configView(workspaceId);
    }
    /** Store credentials for the selected provider. */
    async saveCredentials(workspaceId, values) {
        const workspace = await this.requireWorkspace(workspaceId);
        const config = await readImageConfig(workspace.path);
        await writeProviderCredentials(this.credentials(), this.selectedProvider(config), values);
        return this.configView(workspaceId);
    }
    /** Clear credentials for the selected provider. */
    async clearCredentials(workspaceId) {
        const workspace = await this.requireWorkspace(workspaceId);
        const config = await readImageConfig(workspace.path);
        await clearProviderCredentials(this.credentials(), this.selectedProvider(config));
        return this.configView(workspaceId);
    }
    /** Build a scene or portrait preview. */
    async preview(workspaceId, input) {
        const workspace = await this.requireWorkspace(workspaceId);
        const config = await readImageConfig(workspace.path);
        const provider = this.selectedProvider(config);
        const capabilities = providerCapabilities(provider);
        const common = {
            provider,
            providerLabel: providerLabel(provider),
            capabilities,
            configured: await this.configured(config),
            enabled: config.enabled,
            approvalTtlMs: APPROVAL_TTL_MS,
        };
        if (input.mode === 'portrait') {
            const cardId = input.cardId ?? '';
            const card = await readCharacterCard(workspace.path, cardId);
            if (card === undefined)
                throw new ImageInputError('角色卡不存在', 404);
            return { ...buildPortraitPreview(card, config), ...common };
        }
        if (input.sessionId === undefined)
            throw new ImageInputError('缺少 sessionId');
        const cards = await listCharacterCards(workspace.path);
        const beat = await findBeat(workspace.path, input.sessionId, input.turn);
        if (beat === undefined)
            throw new ImageInputError('这一轮没有可用的剧情记录', 404);
        return { ...buildScenePreview(beat, cards.cards, config), ...common };
    }
    /** Refine a draft with one LLM call; never generates an image. */
    async refine(workspaceId, input) {
        const workspace = await this.requireWorkspace(workspaceId);
        const config = await readImageConfig(workspace.path);
        const provider = this.selectedProvider(config);
        if (input.provider !== undefined && input.provider !== provider) {
            throw new ImageInputError('细化 provider 与工作区设置不一致');
        }
        const llm = this.llm();
        if (llm === undefined)
            throw new ImageInputError('当前部署没有可用的模型服务，无法细化', 503);
        const capabilities = providerCapabilities(provider);
        const preset = presetFor(input.mode, config);
        let context;
        let modeCapabilities = capabilities;
        if (input.mode === 'portrait') {
            const card = await readCharacterCard(workspace.path, input.cardId ?? '');
            if (card === undefined)
                throw new ImageInputError('角色卡不存在', 404);
            const preview = buildPortraitPreview(card, config);
            context = [
                `角色：${preview.cardName}`,
                `外观：${preview.appearance}`,
                `气质：${preview.personality}`,
                `背景：${preview.scenario}`,
            ].join('\n');
        }
        else {
            if (input.sessionId === undefined)
                throw new ImageInputError('缺少 sessionId');
            const cards = await listCharacterCards(workspace.path);
            const beat = await findBeat(workspace.path, input.sessionId, input.turn);
            if (beat === undefined)
                throw new ImageInputError('这一轮没有可用的剧情记录', 404);
            const preview = buildScenePreview(beat, cards.cards, config);
            context = [
                `场景：${preview.scene}`,
                `出场角色：${preview.characters.map(character => `${character.name}：${character.appearance}`).join('；') || '（无）'}`,
            ].join('\n');
        }
        modeCapabilities = capabilities;
        const model = config.refineModel ?? this.sessionModel(input.sessionId) ?? this.defaultSelection();
        if (model === undefined)
            throw new ImageInputError('找不到可用于细化的模型，请在生图设置里指定', 400);
        if (model.provider.length === 0 || model.model.length === 0) {
            throw new ImageInputError('细化模型缺少 provider/model');
        }
        const system = buildRefineSystem({
            mode: input.mode,
            providerLabel: providerLabel(provider),
            capabilities: modeCapabilities,
            preset,
        });
        const message = buildRefineMessage({
            context,
            draft: input.draftPrompt,
            preset,
        });
        const stream = llm.stream({
            provider: model.provider,
            model: model.model,
            system,
            messages: [createUserMessage({
                    content: [{ type: 'text', text: message }],
                    source: { kind: 'user' },
                })],
            maxTokens: 1600,
            ...(model.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: ReasoningEffortId(model.reasoningEffort) }),
            signal: AbortSignal.timeout(60_000),
        });
        let text = '';
        for await (const chunk of stream) {
            if (chunk.type === 'text-delta')
                text += chunk.text;
            else if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
                throw new ImageInputError(`细化失败：${chunk.reason.failure.message}`, 502);
            }
            else if (chunk.type === 'finish' && chunk.reason.kind === 'aborted') {
                throw new ImageInputError('细化已取消', 499);
            }
        }
        const parsed = parseRefineReply(text, modeCapabilities.promptMaxChars);
        return {
            prompt: parsed.prompt,
            ...(parsed.negative === undefined ? {} : { negative: parsed.negative }),
            model: `${model.provider}/${model.model}`,
            parsed: parsed.parsed,
        };
    }
    /** Approve one exact image request and return a one-time id. */
    async approve(workspaceId, input) {
        const workspace = await this.requireWorkspace(workspaceId);
        const config = await readImageConfig(workspace.path);
        if (!config.enabled)
            throw new ImageInputError('请先在生图设置里启用生图');
        const provider = this.selectedProvider(config);
        if (imageProvider(provider) === undefined)
            throw new ImageInputError(`provider ${provider} 未接入`);
        if (!(await this.configured(config))) {
            throw new ImageInputError('provider 配置或密钥不完整，请先在生图设置里补齐');
        }
        const prompt = input.prompt.trim();
        if (prompt.length === 0)
            throw new ImageInputError('提示词不能为空');
        if (prompt.length > IMAGE_PROMPT_MAX)
            throw new ImageInputError(`提示词超过 ${IMAGE_PROMPT_MAX} 字`);
        const negative = input.negative?.trim() ?? '';
        if (negative.length > IMAGE_NEGATIVE_MAX)
            throw new ImageInputError(`负向词超过 ${IMAGE_NEGATIVE_MAX} 字`);
        const aspect = (input.aspect ?? presetFor(input.mode, config).aspect);
        if (!IMAGE_ASPECTS.includes(aspect))
            throw new ImageInputError(`未知比例：${aspect}`);
        if (!providerCapabilities(provider).aspects.includes(aspect)) {
            throw new ImageInputError(`${providerLabel(provider)} 不支持比例 ${aspect}`);
        }
        const style = (input.style ?? presetFor(input.mode, config).style);
        if (!IMAGE_STYLES.includes(style))
            throw new ImageInputError(`未知风格：${style}`);
        if (input.seed !== undefined && (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 2_147_483_647)) {
            throw new ImageInputError('seed 必须是 0–2147483647 的整数');
        }
        let target;
        if (input.mode === 'portrait') {
            const cardId = input.cardId ?? '';
            const card = await readCharacterCard(workspace.path, cardId);
            if (card === undefined)
                throw new ImageInputError('角色卡不存在', 404);
            target = { kind: 'portrait', cardId: card.id };
        }
        else {
            if (input.sessionId === undefined)
                throw new ImageInputError('缺少 sessionId');
            if (input.turn === undefined || !Number.isInteger(input.turn) || input.turn <= 0) {
                throw new ImageInputError('缺少有效的 turn');
            }
            const beat = await findBeat(workspace.path, input.sessionId, input.turn);
            if (beat === undefined)
                throw new ImageInputError('这一轮没有可用的剧情记录', 404);
            target = { kind: 'scene', sessionId: input.sessionId, turn: input.turn };
        }
        const request = {
            mode: input.mode,
            prompt,
            ...(negative.length === 0 ? {} : { negative }),
            aspect,
            count: 1,
            ...(input.seed === undefined ? {} : { seed: input.seed }),
        };
        const approval = this.approvals.create({
            workspaceId: workspace.id,
            provider,
            target,
            request,
            style,
            draftPrompt: (input.draftPrompt ?? prompt).slice(0, IMAGE_DRAFT_MAX),
            ...(input.refinedPrompt === undefined ? {} : { refinedPrompt: input.refinedPrompt.slice(0, IMAGE_DRAFT_MAX) }),
            ...(input.refineModel === undefined ? {} : { refineModel: input.refineModel.slice(0, 200) }),
        });
        return {
            approvalId: approval.id,
            expiresAt: new Date(approval.expiresAt).toISOString(),
        };
    }
    /** Generate one image from an approved request. */
    async generate(workspaceId, approvalId) {
        const workspace = await this.requireWorkspace(workspaceId);
        if (this.generating.has(workspace.id)) {
            throw new ImageInputError('上一张还在生成，请稍候', 409);
        }
        const approval = this.approvals.take(approvalId);
        if (approval === undefined || approval.workspaceId !== workspace.id) {
            throw new ImageInputError('审批已过期或已使用，请重新批准', 409);
        }
        const config = await readImageConfig(workspace.path);
        if (!config.enabled)
            throw new ImageInputError('请先在生图设置里启用生图');
        const provider = this.selectedProvider(config);
        if (provider !== approval.provider)
            throw new ImageInputError('provider 已更改，请重新批准');
        const implementation = imageProvider(provider);
        if (implementation === undefined)
            throw new ImageInputError(`provider ${provider} 未接入`);
        const credentials = await resolveProviderCredentials(this.credentials(), provider);
        this.generating.add(workspace.id);
        try {
            const result = await implementation.generate({
                config: config.providers[provider],
                credentials,
                request: approval.request,
                signal: AbortSignal.timeout(config.timeoutMs),
                timeoutMs: config.timeoutMs,
                maxImageBytes: config.maxImageBytes,
            });
            const image = result.images[0];
            if (image === undefined)
                throw new ImageProviderError('provider 没有返回图片', provider, 502);
            const common = {
                bytes: image.bytes,
                mime: image.mime,
                draftPrompt: approval.draftPrompt,
                ...(approval.refinedPrompt === undefined ? {} : { refinedPrompt: approval.refinedPrompt }),
                finalPrompt: approval.request.prompt,
                provider,
                model: result.model,
                ...(result.seed === undefined && approval.request.seed === undefined
                    ? {}
                    : { seed: result.seed ?? approval.request.seed }),
                aspect: approval.request.aspect,
                style: approval.style,
                ...(approval.refineModel === undefined ? {} : { refineModel: approval.refineModel }),
                approvedAt: new Date(approval.createdAt).toISOString(),
            };
            if (approval.target.kind === 'portrait') {
                return { image: await writePortrait(workspace.path, { ...common, cardId: approval.target.cardId }) };
            }
            return {
                image: await writeSceneImage(workspace.path, approval.target.sessionId, {
                    ...common,
                    turn: approval.target.turn,
                }),
            };
        }
        finally {
            this.generating.delete(workspace.id);
        }
    }
    /** List scene images for one chat. */
    async listScene(workspaceId, sessionId, turn) {
        const workspace = await this.requireWorkspace(workspaceId);
        return { images: await listSceneImages(workspace.path, sessionId, turn) };
    }
    /** List one character's portraits, or the workspace's active-portrait map. */
    async portraits(workspaceId, cardId) {
        const workspace = await this.requireWorkspace(workspaceId);
        if (cardId !== undefined) {
            const card = await readCharacterCard(workspace.path, cardId);
            if (card === undefined)
                throw new ImageInputError('角色卡不存在', 404);
            const index = await readPortraitIndex(workspace.path, card.id);
            const active = index.activeId === undefined
                ? undefined
                : index.items.find(item => item.id === index.activeId);
            return { cardId: card.id, index, ...(active === undefined ? {} : { active }) };
        }
        const cards = await listCharacterCards(workspace.path);
        const entries = [];
        for (const card of cards.cards) {
            const active = await activePortrait(workspace.path, card.id);
            entries.push({
                cardId: card.id,
                name: card.name,
                ...(active === undefined ? {} : {
                    activeId: active.id,
                    url: `/tavern-image/file?workspaceId=${encodeURIComponent(workspace.id)}&kind=portrait&cardId=${encodeURIComponent(card.id)}&id=${encodeURIComponent(active.id)}`,
                }),
            });
        }
        return { cards: entries };
    }
    /** Switch one character's active portrait. */
    async activatePortrait(workspaceId, cardId, id) {
        const workspace = await this.requireWorkspace(workspaceId);
        const card = await readCharacterCard(workspace.path, cardId);
        if (card === undefined)
            throw new ImageInputError('角色卡不存在', 404);
        await setActivePortrait(workspace.path, card.id, id);
        const index = await readPortraitIndex(workspace.path, card.id);
        const active = index.activeId === undefined
            ? undefined
            : index.items.find(item => item.id === index.activeId);
        return { cardId: card.id, index, ...(active === undefined ? {} : { active }) };
    }
    /** Stream one image file after validating both the id and its container. */
    async sendFile(req, res) {
        if (!allowLoopback(req, res))
            return;
        if ((req.method ?? 'GET') !== 'GET') {
            methodNotAllowed(res, 'GET');
            return;
        }
        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const workspaceId = url.searchParams.get('workspaceId') ?? '';
            const kind = url.searchParams.get('kind') ?? '';
            const id = url.searchParams.get('id') ?? '';
            if (workspaceId.length === 0 || id.length === 0)
                throw new ImageInputError('缺少 workspaceId 或 id');
            const workspace = await this.requireWorkspace(workspaceId);
            let file;
            if (kind === 'portrait') {
                const cardId = url.searchParams.get('cardId') ?? '';
                if (cardId.length === 0)
                    throw new ImageInputError('缺少 cardId');
                file = await readPortraitFile(workspace.path, cardId, id);
            }
            else if (kind === 'scene') {
                const sessionId = url.searchParams.get('sessionId') ?? '';
                if (sessionId.length === 0)
                    throw new ImageInputError('缺少 sessionId');
                file = await readSceneImageFile(workspace.path, sessionId, id);
            }
            else {
                throw new ImageInputError('未知图片类型');
            }
            const info = await stat(file.path);
            res.statusCode = 200;
            res.setHeader('content-type', file.record.mime);
            res.setHeader('content-length', String(info.size));
            res.setHeader('cache-control', 'private, max-age=31536000, immutable');
            res.setHeader('x-content-type-options', 'nosniff');
            const stream = createReadStream(file.path);
            stream.on('error', () => { try {
                res.destroy();
            }
            catch { /* already gone */ } });
            stream.pipe(res);
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    /** Register every exact route as an effect, so unloading removes it. */
    registerRoutes() {
        this.ctx.inject(['webServer'], (webCtx) => {
            const route = (path, handler) => {
                webCtx.effect(() => webCtx.webServer.register({ kind: 'exact', path, handler }), `dshtavern-image: ${path}`);
            };
            route(IMAGE_PING_ROUTE, (req, res) => {
                if (!allowLoopback(req, res))
                    return;
                if (req.method !== 'GET') {
                    methodNotAllowed(res, 'GET');
                    return;
                }
                sendJson(res, 200, { ok: true, schema: IMAGE_API_SCHEMA });
            });
            route(IMAGE_CONFIG_ROUTE, (req, res) => { void this.handleConfig(req, res); });
            route(IMAGE_CREDENTIALS_ROUTE, (req, res) => { void this.handleCredentials(req, res); });
            route(IMAGE_PREVIEW_ROUTE, (req, res) => { void this.handlePreview(req, res); });
            route(IMAGE_REFINE_ROUTE, (req, res) => { void this.handleRefine(req, res); });
            route(IMAGE_APPROVE_ROUTE, (req, res) => { void this.handleApprove(req, res); });
            route(IMAGE_GENERATE_ROUTE, (req, res) => { void this.handleGenerate(req, res); });
            route(IMAGE_LIST_ROUTE, (req, res) => { void this.handleList(req, res); });
            route(IMAGE_PORTRAITS_ROUTE, (req, res) => { void this.handlePortraits(req, res); });
            route(IMAGE_ACTIVE_ROUTE, (req, res) => { void this.handleActive(req, res); });
            route(IMAGE_FILE_ROUTE, (req, res) => { void this.sendFile(req, res); });
        });
    }
    async handleConfig(req, res) {
        if (!allowLoopback(req, res))
            return;
        try {
            if ((req.method ?? 'GET') === 'GET') {
                const workspaceId = workspaceIdFromUrl(req);
                const url = new URL(req.url ?? '/', 'http://localhost');
                sendJson(res, 200, { ok: true, ...await this.configView(workspaceId, url.searchParams.get('sessionId') ?? undefined) });
                return;
            }
            if (req.method !== 'POST') {
                res.setHeader('allow', 'GET, POST');
                sendJson(res, 405, { ok: false, error: 'method not allowed; use GET or POST' });
                return;
            }
            const body = await readJsonObject(req, IMAGE_BODY_MAX_BYTES);
            const workspaceId = optionalString(body, 'workspaceId');
            if (workspaceId === undefined)
                throw new ImageInputError('缺少 workspaceId');
            sendJson(res, 200, { ok: true, ...await this.saveConfig(workspaceId, body.config) });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    async handleCredentials(req, res) {
        if (!allowLoopback(req, res))
            return;
        try {
            const method = req.method ?? 'GET';
            if (method !== 'POST' && method !== 'DELETE') {
                res.setHeader('allow', 'POST, DELETE');
                sendJson(res, 405, { ok: false, error: 'method not allowed; use POST or DELETE' });
                return;
            }
            const body = await readJsonObject(req, IMAGE_BODY_MAX_BYTES);
            const workspaceId = optionalString(body, 'workspaceId');
            if (workspaceId === undefined)
                throw new ImageInputError('缺少 workspaceId');
            if (method === 'DELETE') {
                sendJson(res, 200, { ok: true, ...await this.clearCredentials(workspaceId) });
                return;
            }
            const values = body.values;
            if (typeof values !== 'object' || values === null || Array.isArray(values)) {
                throw new ImageInputError('缺少凭据内容');
            }
            sendJson(res, 200, { ok: true, ...await this.saveCredentials(workspaceId, values) });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    async handlePreview(req, res) {
        if (!allowLoopback(req, res))
            return;
        if ((req.method ?? 'GET') !== 'GET') {
            methodNotAllowed(res, 'GET');
            return;
        }
        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const workspaceId = url.searchParams.get('workspaceId') ?? '';
            if (workspaceId.length === 0)
                throw new ImageInputError('缺少 workspaceId');
            const mode = imageModeOf(url.searchParams.get('mode'));
            const turnRaw = url.searchParams.get('turn');
            const turn = turnRaw === null ? undefined : Number(turnRaw);
            sendJson(res, 200, {
                ok: true,
                ...await this.preview(workspaceId, {
                    mode,
                    ...(url.searchParams.get('sessionId') === null ? {} : { sessionId: url.searchParams.get('sessionId') }),
                    ...(turn === undefined || !Number.isInteger(turn) ? {} : { turn }),
                    ...(url.searchParams.get('cardId') === null ? {} : { cardId: url.searchParams.get('cardId') }),
                }),
            });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    async handleRefine(req, res) {
        if (!allowLoopback(req, res))
            return;
        if (req.method !== 'POST') {
            methodNotAllowed(res, 'POST');
            return;
        }
        try {
            const body = await readJsonObject(req, IMAGE_BODY_MAX_BYTES);
            const workspaceId = optionalString(body, 'workspaceId');
            if (workspaceId === undefined)
                throw new ImageInputError('缺少 workspaceId');
            const draftPrompt = optionalString(body, 'draftPrompt');
            if (draftPrompt === undefined || draftPrompt.trim().length === 0)
                throw new ImageInputError('草稿提示词不能为空');
            if (draftPrompt.length > IMAGE_DRAFT_MAX)
                throw new ImageInputError('草稿提示词过长');
            const turnRaw = body.turn;
            if (turnRaw !== undefined && (typeof turnRaw !== 'number' || !Number.isInteger(turnRaw))) {
                throw new ImageInputError('turn 必须是整数');
            }
            sendJson(res, 200, {
                ok: true,
                ...await this.refine(workspaceId, {
                    mode: imageModeOf(optionalString(body, 'mode')),
                    ...(optionalString(body, 'sessionId') === undefined ? {} : { sessionId: optionalString(body, 'sessionId') }),
                    ...(turnRaw === undefined ? {} : { turn: turnRaw }),
                    ...(optionalString(body, 'cardId') === undefined ? {} : { cardId: optionalString(body, 'cardId') }),
                    draftPrompt,
                    ...(optionalString(body, 'provider') === undefined ? {} : { provider: optionalString(body, 'provider') }),
                }),
            });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    async handleApprove(req, res) {
        if (!allowLoopback(req, res))
            return;
        if (req.method !== 'POST') {
            methodNotAllowed(res, 'POST');
            return;
        }
        try {
            const body = await readJsonObject(req, IMAGE_BODY_MAX_BYTES);
            const workspaceId = optionalString(body, 'workspaceId');
            if (workspaceId === undefined)
                throw new ImageInputError('缺少 workspaceId');
            const prompt = optionalString(body, 'prompt');
            if (prompt === undefined)
                throw new ImageInputError('缺少提示词');
            const turnRaw = body.turn;
            if (turnRaw !== undefined && (typeof turnRaw !== 'number' || !Number.isInteger(turnRaw))) {
                throw new ImageInputError('turn 必须是整数');
            }
            const seedRaw = body.seed;
            if (seedRaw !== undefined && (typeof seedRaw !== 'number' || !Number.isInteger(seedRaw))) {
                throw new ImageInputError('seed 必须是整数');
            }
            sendJson(res, 200, {
                ok: true,
                ...await this.approve(workspaceId, {
                    mode: imageModeOf(optionalString(body, 'mode')),
                    ...(optionalString(body, 'sessionId') === undefined ? {} : { sessionId: optionalString(body, 'sessionId') }),
                    ...(turnRaw === undefined ? {} : { turn: turnRaw }),
                    ...(optionalString(body, 'cardId') === undefined ? {} : { cardId: optionalString(body, 'cardId') }),
                    prompt,
                    ...(optionalString(body, 'negative') === undefined ? {} : { negative: optionalString(body, 'negative') }),
                    ...(optionalString(body, 'draftPrompt') === undefined ? {} : { draftPrompt: optionalString(body, 'draftPrompt') }),
                    ...(optionalString(body, 'refinedPrompt') === undefined ? {} : { refinedPrompt: optionalString(body, 'refinedPrompt') }),
                    ...(optionalString(body, 'refineModel') === undefined ? {} : { refineModel: optionalString(body, 'refineModel') }),
                    ...(optionalString(body, 'aspect') === undefined ? {} : { aspect: optionalString(body, 'aspect') }),
                    ...(optionalString(body, 'style') === undefined ? {} : { style: optionalString(body, 'style') }),
                    ...(seedRaw === undefined ? {} : { seed: seedRaw }),
                }),
            });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    async handleGenerate(req, res) {
        if (!allowLoopback(req, res))
            return;
        if (req.method !== 'POST') {
            methodNotAllowed(res, 'POST');
            return;
        }
        try {
            const body = await readJsonObject(req, IMAGE_BODY_MAX_BYTES);
            const workspaceId = optionalString(body, 'workspaceId');
            const approvalId = optionalString(body, 'approvalId');
            if (workspaceId === undefined)
                throw new ImageInputError('缺少 workspaceId');
            if (approvalId === undefined)
                throw new ImageInputError('缺少 approvalId');
            sendJson(res, 200, { ok: true, ...await this.generate(workspaceId, approvalId) });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    async handleList(req, res) {
        if (!allowLoopback(req, res))
            return;
        if ((req.method ?? 'GET') !== 'GET') {
            methodNotAllowed(res, 'GET');
            return;
        }
        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const workspaceId = url.searchParams.get('workspaceId') ?? '';
            const sessionId = url.searchParams.get('sessionId') ?? '';
            if (workspaceId.length === 0 || sessionId.length === 0)
                throw new ImageInputError('缺少 workspaceId 或 sessionId');
            const turnRaw = url.searchParams.get('turn');
            const turn = turnRaw === null ? undefined : Number(turnRaw);
            sendJson(res, 200, {
                ok: true,
                ...await this.listScene(workspaceId, sessionId, turn === undefined || !Number.isInteger(turn) ? undefined : turn),
            });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    async handlePortraits(req, res) {
        if (!allowLoopback(req, res))
            return;
        if ((req.method ?? 'GET') !== 'GET') {
            methodNotAllowed(res, 'GET');
            return;
        }
        try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const workspaceId = url.searchParams.get('workspaceId') ?? '';
            if (workspaceId.length === 0)
                throw new ImageInputError('缺少 workspaceId');
            const cardId = url.searchParams.get('cardId') ?? undefined;
            sendJson(res, 200, { ok: true, ...await this.portraits(workspaceId, cardId) });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    async handleActive(req, res) {
        if (!allowLoopback(req, res))
            return;
        if (req.method !== 'POST') {
            methodNotAllowed(res, 'POST');
            return;
        }
        try {
            const body = await readJsonObject(req, IMAGE_BODY_MAX_BYTES);
            const workspaceId = optionalString(body, 'workspaceId');
            const cardId = optionalString(body, 'cardId');
            if (workspaceId === undefined)
                throw new ImageInputError('缺少 workspaceId');
            if (cardId === undefined)
                throw new ImageInputError('缺少 cardId');
            const id = optionalString(body, 'id');
            sendJson(res, 200, { ok: true, ...await this.activatePortrait(workspaceId, cardId, id) });
        }
        catch (error) {
            this.fail(res, error);
        }
    }
    /** Send the failure in the shape every panel expects. */
    fail(res, error) {
        if (res.headersSent) {
            try {
                res.destroy();
            }
            catch { /* already gone */ }
            return;
        }
        const status = error instanceof HttpRequestError
            ? error.status
            : error instanceof ImageProviderError
                ? error.status ?? 502
                : error instanceof ImageInputError
                    ? error.status
                    : error instanceof ImageConfigInvalidError
                        || error instanceof ImageCredentialError
                        || error instanceof ImagePromptError
                        || error instanceof ImageStoreError
                        ? 400
                        : 500;
        if (status >= 500)
            this.ctx.logger.warn(`[dshtavern-image] request failed: ${String(error)}`);
        sendJson(res, status, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
/** @param req - incoming request. @returns its `workspaceId` query, required. */
function workspaceIdFromUrl(req) {
    const workspaceId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('workspaceId');
    if (workspaceId === null || workspaceId.length === 0)
        throw new ImageInputError('缺少 workspaceId');
    return workspaceId;
}
/** @param value - mode field. @returns validated mode. */
function imageModeOf(value) {
    if (value === 'portrait')
        return 'portrait';
    if (value === 'scene' || value === undefined || value === null)
        return 'scene';
    throw new ImageInputError(`未知生图模式：${value}`);
}
export default TavernImageService;
