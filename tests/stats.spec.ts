import { describe, expect, it } from 'vitest'
import type { Session } from '@deepseek-ai/dsh-session'
import { buildUsageSnapshot, isInsideWorkspace, readSessionUsage } from '../src/stats/index.ts'

interface FakeSessionInput {
  readonly id: string
  readonly cwd?: string
  readonly createdAt?: number
  readonly usage?: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly cacheReadTokens?: number
    readonly cacheWriteTokens?: number
  }
  readonly pressure?: { readonly projectedTokens?: number; readonly contextWindow?: number }
  readonly title?: string
}

/** A session-shaped value: the plugin reads only `id`, `header`, and projections. */
function fakeSession(input: FakeSessionInput): Session {
  return {
    id: input.id,
    header: {
      id: input.id,
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    },
  } as unknown as Session
}

/** Projection reader returning fixed values keyed by session id. */
function reader(values: Record<string, Record<string, unknown>>) {
  return {
    snapshot: (session: Session) => ({ values: values[String(session.id)] ?? {} }),
  }
}

function usageOf(input: FakeSessionInput): Record<string, unknown> {
  return {
    ...(input.usage === undefined
      ? {}
      : {
        tokenUsage: {
          uncachedInputTokens: input.usage.inputTokens,
          outputTokens: input.usage.outputTokens,
          cacheReadTokens: input.usage.cacheReadTokens ?? 0,
          cacheWriteTokens: input.usage.cacheWriteTokens ?? 0,
        },
      }),
    ...(input.pressure === undefined ? {} : { contextPressure: input.pressure }),
    ...(input.title === undefined ? {} : { title: input.title }),
  }
}

describe('isInsideWorkspace', () => {
  it('accepts the workspace root and its descendants', () => {
    expect(isInsideWorkspace('C:\\taverns\\one', 'C:\\taverns\\one')).toBe(true)
    expect(isInsideWorkspace('C:\\taverns\\one\\sub', 'C:\\taverns\\one')).toBe(true)
    expect(isInsideWorkspace('/home/me/taverns/one', '/home/me/taverns/one')).toBe(true)
  })

  it('rejects siblings, parents, and absent directories', () => {
    expect(isInsideWorkspace('C:\\taverns\\two', 'C:\\taverns\\one')).toBe(false)
    expect(isInsideWorkspace('C:\\taverns', 'C:\\taverns\\one')).toBe(false)
    expect(isInsideWorkspace('C:\\taverns\\one-extra', 'C:\\taverns\\one')).toBe(false)
    expect(isInsideWorkspace(undefined, 'C:\\taverns\\one')).toBe(false)
  })
})

describe('readSessionUsage', () => {
  it('sums the four disjoint buckets and derives the cache-hit rate', () => {
    const session = fakeSession({
      id: 's1',
      usage: { inputTokens: 300, outputTokens: 100, cacheReadTokens: 700, cacheWriteTokens: 50 },
    })
    const view = readSessionUsage(session, reader({ s1: usageOf({
      id: 's1',
      usage: { inputTokens: 300, outputTokens: 100, cacheReadTokens: 700, cacheWriteTokens: 50 },
    }) }))
    expect(view.totalTokens).toBe(1150)
    expect(view.buckets.cacheReadTokens).toBe(700)
    // 700 / (700 + 300)
    expect(view.cacheHitRate).toBeCloseTo(0.7)
  })

  it('reports no cache-hit rate before any prompt token is seen', () => {
    const session = fakeSession({ id: 's2' })
    const view = readSessionUsage(session, reader({}))
    expect(view.totalTokens).toBe(0)
    expect(view.cacheHitRate).toBeUndefined()
  })

  it('derives context ratio from the pressure projection', () => {
    const session = fakeSession({ id: 's3', pressure: { projectedTokens: 32_000, contextWindow: 128_000 } })
    const view = readSessionUsage(session, reader({ s3: usageOf({
      id: 's3',
      pressure: { projectedTokens: 32_000, contextWindow: 128_000 },
    }) }))
    expect(view.context.usedTokens).toBe(32_000)
    expect(view.context.contextWindow).toBe(128_000)
    expect(view.context.ratio).toBeCloseTo(0.25)
  })

  it('omits the ratio when the route declares no context window', () => {
    const session = fakeSession({ id: 's4', pressure: { projectedTokens: 900 } })
    const view = readSessionUsage(session, reader({ s4: usageOf({ id: 's4', pressure: { projectedTokens: 900 } }) }))
    expect(view.context.usedTokens).toBe(900)
    expect(view.context.ratio).toBeUndefined()
  })

  it('falls back to pressureTokens when no projection is available', () => {
    const view = readSessionUsage(fakeSession({ id: 's5' }), undefined)
    expect(view.totalTokens).toBe(0)
    expect(view.context.usedTokens).toBeUndefined()
  })
})

describe('buildUsageSnapshot', () => {
  const root = 'C:\\taverns\\one'

  it('aggregates only the sessions inside the workspace', () => {
    const inside = fakeSession({ id: 'in', cwd: root, createdAt: 2, usage: { inputTokens: 100, outputTokens: 20 } })
    const nested = fakeSession({ id: 'nested', cwd: `${root}\\chat`, createdAt: 1, usage: { inputTokens: 50, outputTokens: 10 } })
    const outside = fakeSession({ id: 'out', cwd: 'C:\\taverns\\two', createdAt: 3, usage: { inputTokens: 999, outputTokens: 999 } })
    const snapshot = buildUsageSnapshot({
      workspaceId: 'w1',
      workspaceTitle: 'one',
      workspacePath: root,
      sessions: [inside, nested, outside],
      projections: reader({
        in: usageOf({ id: 'in', usage: { inputTokens: 100, outputTokens: 20 } }),
        nested: usageOf({ id: 'nested', usage: { inputTokens: 50, outputTokens: 10 } }),
        out: usageOf({ id: 'out', usage: { inputTokens: 999, outputTokens: 999 } }),
      }),
    })
    expect(snapshot.totals.sessionCount).toBe(2)
    expect(snapshot.totals.totalTokens).toBe(180)
    expect(snapshot.sessions.map(session => session.sessionId)).toEqual(['in', 'nested'])
  })

  it('picks the current session out of the aggregate', () => {
    const current = fakeSession({ id: 'cur', cwd: root, usage: { inputTokens: 10, outputTokens: 1 } })
    const other = fakeSession({ id: 'other', cwd: root, usage: { inputTokens: 90, outputTokens: 9 } })
    const snapshot = buildUsageSnapshot({
      workspaceId: 'w1',
      workspaceTitle: 'one',
      workspacePath: root,
      sessions: [current, other],
      currentSessionId: 'cur',
      projections: reader({
        cur: usageOf({ id: 'cur', usage: { inputTokens: 10, outputTokens: 1 }, title: '当前' }),
        other: usageOf({ id: 'other', usage: { inputTokens: 90, outputTokens: 9 } }),
      }),
    })
    expect(snapshot.current?.totalTokens).toBe(11)
    expect(snapshot.current?.title).toBe('当前')
    expect(snapshot.totals.totalTokens).toBe(110)
  })

  it('leaves current undefined when the session is not in this workspace', () => {
    const snapshot = buildUsageSnapshot({
      workspaceId: 'w1',
      workspaceTitle: 'one',
      workspacePath: root,
      sessions: [fakeSession({ id: 'x', cwd: 'C:\\taverns\\two' })],
      currentSessionId: 'x',
      projections: reader({}),
    })
    expect(snapshot.current).toBeUndefined()
    expect(snapshot.totals.sessionCount).toBe(0)
  })

  it('flags a missing projection registry instead of reporting fake zeros', () => {
    const snapshot = buildUsageSnapshot({
      workspaceId: 'w1',
      workspaceTitle: 'one',
      workspacePath: root,
      sessions: [fakeSession({ id: 'a', cwd: root })],
    })
    expect(snapshot.projectionsAvailable).toBe(false)
    expect(snapshot.totals.totalTokens).toBe(0)
  })

  it('sorts sessions newest first', () => {
    const snapshot = buildUsageSnapshot({
      workspaceId: 'w1',
      workspaceTitle: 'one',
      workspacePath: root,
      sessions: [
        fakeSession({ id: 'old', cwd: root, createdAt: 1 }),
        fakeSession({ id: 'new', cwd: root, createdAt: 9 }),
        fakeSession({ id: 'mid', cwd: root, createdAt: 5 }),
      ],
      projections: reader({}),
    })
    expect(snapshot.sessions.map(session => session.sessionId)).toEqual(['new', 'mid', 'old'])
  })
})
