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
import { Service, type Context } from '@deepseek-ai/cordis';
import type { CharacterCard } from '../character-card.js';
import type { ImageConfig } from './config.js';
import type { ProviderCredentialStatus } from './credentials.js';
import type { PortraitPreview, ScenePreview } from './prompt.js';
import { providerCapabilities } from './providers/index.js';
import type { ImageMode, ProviderId } from './providers/types.js';
import type { PortraitIndex, PortraitRecord, SceneImageRecord } from './store.js';
/** Service name this plugin publishes. */
export declare const IMAGE_SERVICE = "tavernImage";
/** Routes owned by this sub-plugin. */
export declare const IMAGE_PING_ROUTE = "/tavern-image/ping";
export declare const IMAGE_CONFIG_ROUTE = "/tavern-image/config";
export declare const IMAGE_CREDENTIALS_ROUTE = "/tavern-image/credentials";
export declare const IMAGE_PREVIEW_ROUTE = "/tavern-image/preview";
export declare const IMAGE_REFINE_ROUTE = "/tavern-image/refine";
export declare const IMAGE_APPROVE_ROUTE = "/tavern-image/approve";
export declare const IMAGE_GENERATE_ROUTE = "/tavern-image/generate";
export declare const IMAGE_LIST_ROUTE = "/tavern-image/list";
export declare const IMAGE_PORTRAITS_ROUTE = "/tavern-image/portraits";
export declare const IMAGE_ACTIVE_ROUTE = "/tavern-image/portrait-active";
export declare const IMAGE_FILE_ROUTE = "/tavern-image/file";
/** Version stamped on JSON responses. */
export declare const IMAGE_API_SCHEMA = 1;
/** Longest prompt the host accepts. */
export declare const IMAGE_PROMPT_MAX = 8000;
/** Longest negative prompt the host accepts. */
export declare const IMAGE_NEGATIVE_MAX = 2000;
/** Longest draft/refined prompt the host stores. */
export declare const IMAGE_DRAFT_MAX = 8000;
/** Largest request body this route family accepts. */
export declare const IMAGE_BODY_MAX_BYTES: number;
/** A request is structurally invalid. */
export declare class ImageInputError extends Error {
    readonly status: number;
    constructor(message: string, status?: number);
}
/** One provider descriptor shown by the client. */
export interface ImageProviderView {
    readonly id: ProviderId;
    readonly label: string;
    readonly capabilities: ReturnType<typeof providerCapabilities>;
}
/** The panel's config read model. */
export interface ImageConfigView {
    readonly schema: number;
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    readonly config: ImageConfig;
    readonly defaults: ImageConfig;
    readonly provider: ProviderId;
    readonly providerLabel: string;
    readonly capabilities: ReturnType<typeof providerCapabilities>;
    readonly providers: readonly ImageProviderView[];
    readonly credential: ProviderCredentialStatus;
    readonly configured: boolean;
    readonly refineAvailable: boolean;
    readonly approvalTtlMs: number;
    readonly sessionModel?: {
        readonly provider: string;
        readonly model: string;
    };
}
/** Scene preview returned to the workshop. */
export interface ScenePreviewView extends ScenePreview {
    readonly provider: ProviderId;
    readonly providerLabel: string;
    readonly capabilities: ReturnType<typeof providerCapabilities>;
    readonly configured: boolean;
    readonly enabled: boolean;
    readonly approvalTtlMs: number;
}
/** Portrait preview returned to the workshop. */
export interface PortraitPreviewView extends PortraitPreview {
    readonly provider: ProviderId;
    readonly providerLabel: string;
    readonly capabilities: ReturnType<typeof providerCapabilities>;
    readonly configured: boolean;
    readonly enabled: boolean;
    readonly approvalTtlMs: number;
}
/** Refinement response. */
export interface RefineView {
    readonly prompt: string;
    readonly negative?: string;
    readonly model: string;
    readonly parsed: boolean;
}
/** Approval response. */
export interface ApproveView {
    readonly approvalId: string;
    readonly expiresAt: string;
}
/** One scene image list response. */
export interface SceneListView {
    readonly images: readonly SceneImageRecord[];
}
/** One character's portrait response. */
export interface PortraitListView {
    readonly cardId: string;
    readonly index: PortraitIndex;
    readonly active?: PortraitRecord;
}
/** Workspace portrait map used by the chat-avatar decorator. */
export interface PortraitMapView {
    readonly cards: readonly {
        readonly cardId: string;
        readonly name: string;
        readonly activeId?: string;
        readonly url?: string;
    }[];
}
/** Image sub-plugin service. */
export declare class TavernImageService extends Service {
    static inject: string[];
    private readonly workspaces;
    private readonly approvals;
    /** Workspaces with a provider call in flight; one image at a time per tavern. */
    private readonly generating;
    /**
     * @param ctx - Cordis context carrying the workspace registry.
     */
    constructor(ctx: Context);
    /** @returns the optional credential service. */
    private credentials;
    /** @returns the optional LLM service. */
    private llm;
    /** @returns the deployment default model. */
    private defaultSelection;
    /** Resolve the model the current session is using, when the host can see it. */
    private sessionModel;
    /** Resolve one registered tavern workspace. */
    private requireWorkspace;
    /** Resolve the selected provider, refusing an unimplemented one. */
    private selectedProvider;
    /** Whether the selected provider has enough settings and credentials. */
    private configured;
    /** Build the config read model. */
    configView(workspaceId: string, sessionId?: string): Promise<ImageConfigView>;
    /** Save config; secrets are rejected because they belong in the credential store. */
    saveConfig(workspaceId: string, value: unknown): Promise<ImageConfigView>;
    /** Store credentials for the selected provider. */
    saveCredentials(workspaceId: string, values: Readonly<Record<string, unknown>>): Promise<ImageConfigView>;
    /** Clear credentials for the selected provider. */
    clearCredentials(workspaceId: string): Promise<ImageConfigView>;
    /** Build a scene or portrait preview. */
    preview(workspaceId: string, input: {
        mode: ImageMode;
        sessionId?: string;
        turn?: number;
        cardId?: string;
    }): Promise<ScenePreviewView | PortraitPreviewView>;
    /** Refine a draft with one LLM call; never generates an image. */
    refine(workspaceId: string, input: {
        mode: ImageMode;
        sessionId?: string;
        turn?: number;
        cardId?: string;
        draftPrompt: string;
        provider?: ProviderId;
    }): Promise<RefineView>;
    /** Approve one exact image request and return a one-time id. */
    approve(workspaceId: string, input: {
        mode: ImageMode;
        sessionId?: string;
        turn?: number;
        cardId?: string;
        prompt: string;
        negative?: string;
        draftPrompt?: string;
        refinedPrompt?: string;
        refineModel?: string;
        aspect?: string;
        style?: string;
        seed?: number;
    }): Promise<ApproveView>;
    /** Generate one image from an approved request. */
    generate(workspaceId: string, approvalId: string): Promise<{
        image: SceneImageRecord | PortraitRecord;
    }>;
    /** List scene images for one chat. */
    listScene(workspaceId: string, sessionId: string, turn?: number): Promise<SceneListView>;
    /** List one character's portraits, or the workspace's active-portrait map. */
    portraits(workspaceId: string, cardId?: string): Promise<PortraitListView | PortraitMapView>;
    /** Switch one character's active portrait. */
    activatePortrait(workspaceId: string, cardId: string, id: string | undefined): Promise<PortraitListView>;
    /** Stream one image file after validating both the id and its container. */
    private sendFile;
    /** Register every exact route as an effect, so unloading removes it. */
    private registerRoutes;
    private handleConfig;
    private handleCredentials;
    private handlePreview;
    private handleRefine;
    private handleApprove;
    private handleGenerate;
    private handleList;
    private handlePortraits;
    private handleActive;
    /** Send the failure in the shape every panel expects. */
    private fail;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Tavern image generation. */
        tavernImage: TavernImageService;
    }
}
export type { CharacterCard };
export default TavernImageService;
