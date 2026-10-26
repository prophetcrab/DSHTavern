/**
 * One-time prompt approvals.
 *
 * Approval and generation are deliberately separate actions. Approving stores
 * the exact request the user reviewed and returns an opaque id; generation can
 * only consume that id, never a prompt sent alongside it. The record expires
 * quickly and is deleted on first use, so a double click cannot spend twice.
 */
import { randomUUID } from 'node:crypto';
/** How long an approved prompt stays usable. */
export const APPROVAL_TTL_MS = 10 * 60_000;
/** In-memory, per-process approval table. */
export class ImageApprovalStore {
    approvals = new Map();
    /**
     * Store one approved request.
     * @param input - the exact request the user reviewed.
     * @param now - current epoch milliseconds; tests inject it.
     * @returns the stored approval.
     */
    create(input, now = Date.now()) {
        this.prune(now);
        const id = `apr_${randomUUID().replace(/-/g, '')}`;
        const approval = {
            id,
            workspaceId: input.workspaceId,
            provider: input.provider,
            target: input.target,
            request: input.request,
            style: input.style,
            draftPrompt: input.draftPrompt,
            ...(input.refinedPrompt === undefined ? {} : { refinedPrompt: input.refinedPrompt }),
            ...(input.refineModel === undefined ? {} : { refineModel: input.refineModel }),
            createdAt: now,
            expiresAt: now + APPROVAL_TTL_MS,
        };
        this.approvals.set(id, approval);
        return approval;
    }
    /**
     * Consume one approval. A second call with the same id returns `undefined`.
     * @param id - approval id.
     * @param now - current epoch milliseconds; tests inject it.
     * @returns the approval, or `undefined` when missing, expired, or used.
     */
    take(id, now = Date.now()) {
        this.prune(now);
        const approval = this.approvals.get(id);
        if (approval === undefined)
            return undefined;
        this.approvals.delete(id);
        if (approval.expiresAt <= now)
            return undefined;
        return approval;
    }
    /** Remove expired records. */
    prune(now) {
        for (const [id, approval] of this.approvals) {
            if (approval.expiresAt <= now)
                this.approvals.delete(id);
        }
    }
    /** @returns the number of live approvals; for tests. */
    get size() {
        return this.approvals.size;
    }
}
