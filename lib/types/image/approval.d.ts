import type { ImageRequest, ProviderId } from './providers/types.js';
/** How long an approved prompt stays usable. */
export declare const APPROVAL_TTL_MS: number;
/** What an approved image is for. */
export type ImageApprovalTarget = {
    readonly kind: 'scene';
    readonly sessionId: string;
    readonly turn: number;
} | {
    readonly kind: 'portrait';
    readonly cardId: string;
};
/** One approved image request. */
export interface ImageApproval {
    readonly id: string;
    readonly workspaceId: string;
    readonly provider: ProviderId;
    readonly target: ImageApprovalTarget;
    readonly request: ImageRequest;
    readonly style: string;
    readonly draftPrompt: string;
    readonly refinedPrompt?: string;
    readonly refineModel?: string;
    readonly createdAt: number;
    readonly expiresAt: number;
}
/** What a caller supplies when approving. */
export interface CreateApprovalInput {
    readonly workspaceId: string;
    readonly provider: ProviderId;
    readonly target: ImageApprovalTarget;
    readonly request: ImageRequest;
    readonly style: string;
    readonly draftPrompt: string;
    readonly refinedPrompt?: string;
    readonly refineModel?: string;
}
/** In-memory, per-process approval table. */
export declare class ImageApprovalStore {
    private readonly approvals;
    /**
     * Store one approved request.
     * @param input - the exact request the user reviewed.
     * @param now - current epoch milliseconds; tests inject it.
     * @returns the stored approval.
     */
    create(input: CreateApprovalInput, now?: number): ImageApproval;
    /**
     * Consume one approval. A second call with the same id returns `undefined`.
     * @param id - approval id.
     * @param now - current epoch milliseconds; tests inject it.
     * @returns the approval, or `undefined` when missing, expired, or used.
     */
    take(id: string, now?: number): ImageApproval | undefined;
    /** Remove expired records. */
    private prune;
    /** @returns the number of live approvals; for tests. */
    get size(): number;
}
