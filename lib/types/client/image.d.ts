import type { ReactElement } from 'react';
/** Aspect ratios the host understands. */
export type ImageAspect = '1:1' | '3:2' | '2:3' | '16:9';
/** Style preset ids. */
export type ImageStyleId = 'anime' | 'cinematic' | 'painterly' | 'dark-fantasy' | 'custom';
/** Provider capabilities as returned by the host. */
export interface ImageCapabilities {
    readonly negative: boolean;
    readonly seed: boolean;
    readonly aspects: readonly ImageAspect[];
    readonly referenceImages: boolean;
    readonly async: boolean;
    readonly maxCount: number;
    readonly promptMaxChars?: number;
}
/** One provider descriptor. */
export interface ImageProviderView {
    readonly id: string;
    readonly label: string;
    readonly capabilities: ImageCapabilities;
}
/** One prompt preset. */
export interface ImagePresetView {
    readonly aspect: ImageAspect;
    readonly style: ImageStyleId;
    readonly customStyle: string;
    readonly template: string;
    readonly negative: string;
}
/** Provider config blocks. */
export interface ImageConfigData {
    readonly schema: number;
    readonly enabled: boolean;
    readonly provider: string;
    readonly providers: {
        readonly 'openai-images': {
            readonly baseUrl: string;
            readonly model: string;
            readonly quality: string;
        };
        readonly jimeng: {
            readonly endpoint: string;
            readonly region: string;
            readonly reqKey: string;
            readonly promptExpansion: boolean;
        };
    };
    readonly refineModel?: {
        readonly provider: string;
        readonly model: string;
        readonly reasoningEffort?: string;
    } | null;
    readonly scene: ImagePresetView;
    readonly portrait: ImagePresetView;
    readonly timeoutMs: number;
    readonly maxImageBytes: number;
}
/** One credential field's presence. */
export interface CredentialFieldView {
    readonly key: string;
    readonly label: string;
    readonly configured: boolean;
    readonly source?: string;
}
/** One provider's credential status. */
export interface CredentialStatusView {
    readonly provider: string;
    readonly configured: boolean;
    readonly fields: readonly CredentialFieldView[];
}
/** The panel config response. */
export interface ImageConfigResponse {
    readonly schema: number;
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    readonly config: ImageConfigData;
    readonly defaults: ImageConfigData;
    readonly provider: string;
    readonly providerLabel: string;
    readonly capabilities: ImageCapabilities;
    readonly providers: readonly ImageProviderView[];
    readonly credential: CredentialStatusView;
    readonly configured: boolean;
    readonly refineAvailable: boolean;
    readonly approvalTtlMs: number;
    readonly sessionModel?: {
        readonly provider: string;
        readonly model: string;
    };
}
/** Scene preview. */
export interface ScenePreviewResponse {
    readonly mode: 'scene';
    readonly turn: number;
    readonly scene: string;
    readonly characters: readonly {
        readonly id: string;
        readonly name: string;
        readonly appearance: string;
    }[];
    readonly draft: string;
    readonly negative: string;
    readonly aspect: ImageAspect;
    readonly style: ImageStyleId;
    readonly preset: ImagePresetView;
    readonly provider: string;
    readonly providerLabel: string;
    readonly capabilities: ImageCapabilities;
    readonly configured: boolean;
    readonly enabled: boolean;
    readonly approvalTtlMs: number;
}
/** Portrait preview. */
export interface PortraitPreviewResponse {
    readonly mode: 'portrait';
    readonly cardId: string;
    readonly cardName: string;
    readonly appearance: string;
    readonly personality: string;
    readonly scenario: string;
    readonly draft: string;
    readonly negative: string;
    readonly aspect: ImageAspect;
    readonly style: ImageStyleId;
    readonly preset: ImagePresetView;
    readonly provider: string;
    readonly providerLabel: string;
    readonly capabilities: ImageCapabilities;
    readonly configured: boolean;
    readonly enabled: boolean;
    readonly approvalTtlMs: number;
}
/** Refinement response. */
export interface RefineResponse {
    readonly prompt: string;
    readonly negative?: string;
    readonly model: string;
    readonly parsed: boolean;
}
/** Approval response. */
export interface ApproveResponse {
    readonly approvalId: string;
    readonly expiresAt: string;
}
/** Scene image metadata. */
export interface SceneImageView {
    readonly id: string;
    readonly turn: number;
    readonly mime: string;
    readonly draftPrompt: string;
    readonly refinedPrompt?: string;
    readonly finalPrompt: string;
    readonly provider: string;
    readonly model: string;
    readonly seed?: number;
    readonly aspect: string;
    readonly style: string;
    readonly refineModel?: string;
    readonly approvedAt: string;
    readonly createdAt: string;
}
/** Portrait metadata. */
export interface PortraitView {
    readonly id: string;
    readonly cardId: string;
    readonly mime: string;
    readonly draftPrompt: string;
    readonly refinedPrompt?: string;
    readonly finalPrompt: string;
    readonly provider: string;
    readonly model: string;
    readonly seed?: number;
    readonly aspect: string;
    readonly style: string;
    readonly refineModel?: string;
    readonly approvedAt: string;
    readonly createdAt: string;
}
/** Scene list response. */
export interface SceneListResponse {
    readonly images: readonly SceneImageView[];
}
/** Portrait list response. */
export interface PortraitListResponse {
    readonly cardId: string;
    readonly index: {
        readonly activeId?: string;
        readonly items: readonly PortraitView[];
    };
    readonly active?: PortraitView;
}
/** Image generation response. */
export interface GenerateResponse {
    readonly image: SceneImageView | PortraitView;
}
/** Availability of the sub-plugin row. */
export type ImageAvailability = 'unknown' | 'on' | 'off';
/** Ask the host whether the image row is mounted. */
export declare function ensureImageAvailability(force?: boolean): void;
/** Subscribe to the availability probe. */
export declare function subscribeImageAvailability(listener: () => void): () => void;
/** @returns the latest availability snapshot. */
export declare function imageAvailabilitySnapshot(): ImageAvailability;
/** React binding for the row availability. */
export declare function useImageAvailability(): ImageAvailability;
/** One config cache entry. */
interface ConfigEntry {
    readonly data?: ImageConfigResponse;
    readonly error?: string;
    readonly loading: boolean;
}
/** Refresh one workspace's image config. */
export declare function ensureImageConfig(workspaceId: string, sessionId?: string, force?: boolean): void;
/** Replace one workspace's cached config from a save response. */
export declare function storeImageConfig(data: ImageConfigResponse): void;
/** Subscribe to config changes. */
export declare function subscribeImageConfig(listener: () => void): () => void;
/** @returns one workspace's config cache entry. */
export declare function imageConfigSnapshot(workspaceId: string): ConfigEntry;
/** React binding for one workspace's config. */
export declare function useImageConfig(workspaceId: string, sessionId?: string): ConfigEntry;
/** One scene-image cache entry. */
interface SceneImagesEntry {
    readonly data?: SceneListResponse;
    readonly error?: string;
    readonly loading: boolean;
}
/** Refresh one chat's scene-image list. */
export declare function ensureSceneImages(workspaceId: string, sessionId: string, force?: boolean): void;
/** Subscribe to scene-image changes. */
export declare function subscribeSceneImages(listener: () => void): () => void;
/** @returns one chat's scene-image cache entry. */
export declare function sceneImagesSnapshot(workspaceId: string, sessionId: string): SceneImagesEntry;
/** React binding for one chat's scene images. */
export declare function useSceneImages(workspaceId: string, sessionId: string): SceneImagesEntry;
/** Tell every mounted view that image state changed. */
export declare function emitImagesChanged(): void;
/** Tell the avatar decorator that a character's active portrait moved. */
export declare function emitPortraitsChanged(): void;
/** Build one scene image URL. */
export declare function sceneImageUrl(workspaceId: string, sessionId: string, image: {
    readonly id: string;
}): string;
/** Build one portrait URL. */
export declare function portraitImageUrl(workspaceId: string, cardId: string, image: {
    readonly id: string;
}): string;
/** Props shared by the workshop. */
export interface ImageWorkshopProps {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly mode: 'scene' | 'portrait';
    readonly turn?: number;
    readonly cardId?: string;
    readonly cardName?: string;
    readonly compact?: boolean;
    readonly onGenerated?: (image: SceneImageView | PortraitView) => void;
}
/**
 * The prompt workshop: draft, optional LLM refinement, approval, generation.
 *
 * The generate button only exists after approval, and editing any field that
 * reaches the provider drops the approval. The Host enforces the same rule by
 * storing the approved request under a one-time id.
 */
export declare function ImageWorkshop(props: ImageWorkshopProps): ReactElement;
/** Props of the toolbox image panel. */
export interface TavernImagePanelProps {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    readonly workspacePath: string;
    readonly sessionId: string;
}
/** The toolbox image panel. */
export declare function TavernImagePanel(props: TavernImagePanelProps): ReactElement;
/** Props of the character portrait section. */
export interface TavernPortraitSectionProps {
    readonly workspaceId: string;
    readonly cardId: string;
    readonly cardName: string;
}
/** Portrait section embedded in the character-card editor. */
export declare function TavernPortraitSection(props: TavernPortraitSectionProps): ReactElement;
export {};
