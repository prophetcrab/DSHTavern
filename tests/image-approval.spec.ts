import { describe, expect, it } from 'vitest'
import { APPROVAL_TTL_MS, ImageApprovalStore } from '../src/image/approval.ts'

const request = {
  mode: 'scene' as const,
  prompt: '雨夜车厢',
  aspect: '3:2' as const,
  count: 1 as const,
}

describe('image approvals', () => {
  it('returns an id once and deletes the record on use', () => {
    const store = new ImageApprovalStore()
    const now = 1_000_000
    const approval = store.create({
      workspaceId: 'w1',
      provider: 'openai-images',
      target: { kind: 'scene', sessionId: 's1', turn: 2 },
      request,
      style: 'anime',
      draftPrompt: '草稿',
    }, now)
    expect(approval.id.startsWith('apr_')).toBe(true)
    expect(store.take(approval.id, now + 100)?.request.prompt).toBe('雨夜车厢')
    expect(store.take(approval.id, now + 100)).toBeUndefined()
  })

  it('expires after the documented window', () => {
    const store = new ImageApprovalStore()
    const now = 1_000_000
    const approval = store.create({
      workspaceId: 'w1',
      provider: 'jimeng',
      target: { kind: 'portrait', cardId: 'card-1' },
      request: { ...request, mode: 'portrait' },
      style: 'anime',
      draftPrompt: '草稿',
    }, now)
    expect(store.take(approval.id, now + APPROVAL_TTL_MS)).toBeUndefined()
  })
})
