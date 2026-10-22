import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCharacterCards } from '../src/client/characters.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

function mockFetch(payload: unknown, status = 200): string[] {
  const calls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input))
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as Response
  }) as typeof fetch
  return calls
}

describe('fetchCharacterCards', () => {
  it('returns the workspace cards with their real names', async () => {
    const calls = mockFetch({
      ok: true,
      cards: [
        { id: 'a4f6540e-e289-4fd9-89e3-1653408cc286', name: '林见夏' },
        { id: 'acadf9ff-a752-45e0-a143-4c10590d6da7', name: '沈砚舟' },
      ],
      problems: [],
    })
    const cards = await fetchCharacterCards('ws-1')
    expect(cards.map(card => card.name)).toEqual(['林见夏', '沈砚舟'])
    expect(calls[0]).toContain('/tavern/characters?workspaceId=ws-1')
  })

  it('returns an empty list when the workspace has no cards', async () => {
    mockFetch({ ok: true, cards: [], problems: [] })
    expect(await fetchCharacterCards('ws-2')).toEqual([])
  })

  it('throws on a failed response instead of showing stale cards', async () => {
    mockFetch({ ok: false, error: '工作区不存在' })
    await expect(fetchCharacterCards('ws-3')).rejects.toThrow('工作区不存在')
  })
})
