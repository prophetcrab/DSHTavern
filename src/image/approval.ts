/**
 * One-time prompt approvals.
 *
 * Approval and generation are deliberately separate actions. Approving stores
 * the exact request the user reviewed and returns an opaque id; generation can
 * only consume that id, never a prompt sent alongside it. The record expires
 * quickly and is deleted on first use, so a double click cannot spend twice.
 */
import { randomUUID } from 'node:crypto'
import type { ImageRequest, ProviderId } from './providers/types.js'

/** How long an approved prompt stays usable. */
export const APPROVAL_TTL_MS = 10 * 60_000

/** What an approved image is for. */
export type ImageApprovalTarget =
  | { readonly kind: 'scene'; readonly sessionId: string; readonly turn: number }
  | { readonly kind: 'portrait'; readonly cardId: string }

/** One approved image request. */
export interface ImageApproval {
  readonly id: string
  readonly workspaceId: string
  readonly provider: ProviderId
  readonly target: ImageApprovalTarget
  readonly request: ImageRequest
  readonly style: string
  readonly draftPrompt: string
  readonly refinedPrompt?: string
  readonly refineModel?: string
  readonly createdAt: number
  readonly expiresAt: number
}

/** What a caller supplies when approving. */
export interface CreateApprovalInput {
  readonly workspaceId: string
  readonly provider: ProviderId
  readonly target: ImageApprovalTarget
  readonly request: ImageRequest
  readonly style: string
  readonly draftPrompt: string
  readonly refinedPrompt?: string
  readonly refineModel?: string
}

/** In-memory, per-process approval table. */
export class ImageApprovalStore {
  private readonly approvals = new Map<string, ImageApproval>()

  /**
   * Store one approved request.
   * @param input - the exact request the user reviewed.
   * @param now - current epoch milliseconds; tests inject it.
   * @returns the stored approval.
   */
  create(input: CreateApprovalInput, now: number = Date.now()): ImageApproval {
    this.prune(now)
    const id = `apr_${randomUUID().replace(/-/g, '')}`
    const approval: ImageApproval = {
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
    }
    this.approvals.set(id, approval)
    return approval
  }

  /**
   * Consume one approval. A second call with the same id returns `undefined`.
   * @param id - approval id.
   * @param now - current epoch milliseconds; tests inject it.
   * @returns the approval, or `undefined` when missing, expired, or used.
   */
  take(id: string, now: number = Date.now()): ImageApproval | undefined {
    this.prune(now)
    const approval = this.approvals.get(id)
    if (approval === undefined) return undefined
    this.approvals.delete(id)
    if (approval.expiresAt <= now) return undefined
    return approval
  }

  /** Remove expired records. */
  private prune(now: number): void {
    for (const [id, approval] of this.approvals) {
      if (approval.expiresAt <= now) this.approvals.delete(id)
    }
  }

  /** @returns the number of live approvals; for tests. */
  get size(): number {
    return this.approvals.size
  }
}
