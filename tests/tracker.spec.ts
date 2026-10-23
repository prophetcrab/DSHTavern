import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TRACKER_SCHEMA,
  TrackerConfigInvalidError,
  defaultTrackerConfig,
  listTrackerSummaries,
  normalizeTrackerConfig,
  readTrackerConfig,
  readTrackerState,
  trackerDue,
  trackedTurns,
  writeTrackerConfig,
  writeTrackerState,
  writeTrackerSummary,
} from '../src/tracker/summary.ts'
import type { TrackerConfig, TrackerState } from '../src/tracker/summary.ts'
import { buildTrackerMessage, buildTrackerSystem, parseTrackerReply, renderTranscript } from '../src/tracker/prompt.ts'
import type { CharacterCard } from '../src/character-card.ts'
import type { StageEntry } from '../src/stage.ts'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-tracker-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  const now = '2026-10-23T00:00:00.000Z'
  return {
    schema: 1,
    kind: 'dshtavern.character',
    id: 'card-00000001',
    name: '极光',
    description: '守夜人',
    personality: '',
    scenario: '',
    systemPrompt: '',
    exampleDialogues: '',
    greetings: { first: '', alternates: [] },
    tags: [],
    entries: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function line(seq: number, kind: 'narration' | 'speech', text: string, speakerName?: string): StageEntry {
  return {
    seq,
    at: '',
    kind,
    text,
    scope: 'observable',
    ...(kind === 'speech' ? { speaker: 'card-00000001', speakerName: speakerName ?? '极光' } : {}),
  }
}

describe('tracker config', () => {
  it('starts disabled with the turn trigger as the only schedule', () => {
    const config = defaultTrackerConfig()
    expect(config.enabled).toBe(false)
    expect(config.everyTurns).toBeGreaterThan(0)
    expect(config.everyMinutes).toBe(0)
  })

  it('rejects out-of-range and half-filled values', () => {
    expect(() => normalizeTrackerConfig({ everyTurns: -1 })).toThrow(TrackerConfigInvalidError)
    expect(() => normalizeTrackerConfig({ everyMinutes: 999_999 })).toThrow(TrackerConfigInvalidError)
    expect(() => normalizeTrackerConfig({ model: { provider: 'p' } })).toThrow(TrackerConfigInvalidError)
    expect(() => normalizeTrackerConfig({ schema: TRACKER_SCHEMA + 1 })).toThrow(/高于支持版本/)
  })

  it('reads defaults when no file exists and round-trips a stored config', async () => {
    const directory = await workspace()
    expect(await readTrackerConfig(directory)).toEqual(defaultTrackerConfig())
    const written = await writeTrackerConfig(directory, {
      enabled: true, everyTurns: 4, everyMinutes: 30, maxTranscriptChars: 12_000,
    })
    expect(written.enabled).toBe(true)
    expect((await readTrackerConfig(directory)).everyTurns).toBe(4)
  })
})

describe('tracker scheduling', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z')
  const base: TrackerConfig = { ...defaultTrackerConfig(), enabled: true, everyTurns: 5, everyMinutes: 0 }
  const fresh: TrackerState = { schema: TRACKER_SCHEMA, lastTurn: 0 }

  it('stays idle while disabled', () => {
    expect(trackerDue({ ...base, enabled: false }, fresh, 100, now)).toBe(false)
  })

  it('fires after enough new beats', () => {
    expect(trackerDue(base, fresh, 4, now)).toBe(false)
    expect(trackerDue(base, fresh, 5, now)).toBe(true)
    expect(trackerDue(base, { schema: TRACKER_SCHEMA, lastTurn: 5 }, 9, now)).toBe(false)
    expect(trackerDue(base, { schema: TRACKER_SCHEMA, lastTurn: 5 }, 10, now)).toBe(true)
  })

  it('does not fire when no new beat arrived', () => {
    expect(trackerDue(base, { schema: TRACKER_SCHEMA, lastTurn: 7 }, 7, now)).toBe(false)
  })

  it('fires on elapsed time independently of the beat count', () => {
    const timed: TrackerConfig = { ...base, everyTurns: 0, everyMinutes: 30 }
    const lastAt = new Date(now - 29 * 60_000).toISOString()
    expect(trackerDue(timed, { schema: TRACKER_SCHEMA, lastTurn: 1, lastAt }, 2, now)).toBe(false)
    const older = new Date(now - 31 * 60_000).toISOString()
    expect(trackerDue(timed, { schema: TRACKER_SCHEMA, lastTurn: 1, lastAt: older }, 2, now)).toBe(true)
  })

  it('treats a never-tracked chat as due on the time trigger', () => {
    const timed: TrackerConfig = { ...base, everyTurns: 0, everyMinutes: 60 }
    expect(trackerDue(timed, fresh, 1, now)).toBe(true)
  })

  it('never fires with both triggers off', () => {
    expect(trackerDue({ ...base, everyTurns: 0, everyMinutes: 0 }, fresh, 100, now)).toBe(false)
  })
})

describe('tracker storage', () => {
  it('keeps each chat’s state separate', async () => {
    const directory = await workspace()
    await writeTrackerState(directory, 'session-a', { schema: TRACKER_SCHEMA, lastTurn: 12 })
    expect((await readTrackerState(directory, 'session-a')).lastTurn).toBe(12)
    expect((await readTrackerState(directory, 'session-b')).lastTurn).toBe(0)
  })

  it('lists ledgers newest first and reports their turns', async () => {
    const directory = await workspace()
    for (const turn of [5, 12, 3]) {
      await writeTrackerSummary(directory, 'session-a', {
        schema: TRACKER_SCHEMA, turn, at: '2026-10-23T00:00:00.000Z',
        world: '雨夜', characters: [], transcriptChars: 100,
      })
    }
    const summaries = await listTrackerSummaries(directory, 'session-a')
    expect(summaries.map(summary => summary.turn)).toEqual([12, 5, 3])
    expect(trackedTurns(summaries)).toEqual([3, 5, 12])
  })

  it('skips a damaged ledger instead of failing the listing', async () => {
    const directory = await workspace()
    await writeTrackerSummary(directory, 'session-a', {
      schema: TRACKER_SCHEMA, turn: 2, at: '2026-10-23T00:00:00.000Z', world: '雨夜', characters: [], transcriptChars: 10,
    })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(directory, '.dshtavern', 'tracker', 'summaries', 'session-a', '000009.json'), '{not json', 'utf8')
    expect((await listTrackerSummaries(directory, 'session-a')).map(summary => summary.turn)).toEqual([2])
  })
})

describe('tracker transcript', () => {
  it('renders staged lines with their speaker in story order', () => {
    const stage = [
      line(1, 'narration', '风停了。'),
      line(2, 'speech', '灯还亮着。', '极光'),
    ]
    expect(renderTranscript(stage, 10_000).text).toBe('[旁白] 风停了。\n[极光] 灯还亮着。')
  })

  it('drops the oldest lines when the budget is tight but keeps the newest', () => {
    const stage = [
      line(1, 'narration', 'A'.repeat(50)),
      line(2, 'narration', 'B'.repeat(50)),
      line(3, 'narration', 'C'.repeat(50)),
    ]
    const rendered = renderTranscript(stage, 120)
    expect(rendered.text).not.toContain('A'.repeat(50))
    expect(rendered.text).toContain('C'.repeat(50))
    expect(rendered.chars).toBeLessThanOrEqual(120)
  })

  it('keeps the newest line even when it alone exceeds the budget', () => {
    const stage = [line(1, 'narration', 'X'.repeat(500))]
    expect(renderTranscript(stage, 100).text).toContain('X'.repeat(500))
  })
})

describe('tracker prompt', () => {
  it('gives the model the cast, hidden plot, and previous ledger', () => {
    const system = buildTrackerSystem({
      cards: [card()],
      world: { scene: '灯塔', facts: [], hidden: ['轴撑不到天亮'] },
      previous: {
        schema: TRACKER_SCHEMA, turn: 4, at: '', world: '上一版的雨夜', transcriptChars: 100,
        characters: [{ name: '极光', progress: '他已经开始怀疑灯芯' }],
      },
    })
    expect(system).toContain('极光')
    expect(system).toContain('轴撑不到天亮')
    expect(system).toContain('上一版的雨夜')
    expect(system).toContain('他已经开始怀疑灯芯')
    expect(system).toContain('{"world"')
    expect(system).toContain('不要复述他说过的台词')
  })

  it('says so when there is no previous ledger', () => {
    const system = buildTrackerSystem({ cards: [], world: { scene: '', facts: [], hidden: [] } })
    expect(system).toContain('第一次追踪')
    expect(system).toContain('没有角色卡')
  })

  it('labels the transcript with the turn it reaches', () => {
    expect(buildTrackerMessage('[旁白] 风停了。', 7)).toContain('写到第 7 轮')
    expect(buildTrackerMessage('', 3)).toContain('还没有写入舞台')
  })
})

describe('tracker reply parsing', () => {
  it('reads the world entry and per-character progress', () => {
    const ledger = parseTrackerReply(JSON.stringify({
      world: '灯塔的灯又闪了一下。',
      characters: [
        { name: '极光', progress: '他把备用灯芯让了出来。' },
        { name: '白鹭', progress: '她开始怀疑轴有问题。' },
      ],
    }), [card()])
    expect(ledger?.world).toContain('闪了一下')
    expect(ledger?.characters.map(entry => entry.name)).toEqual(['极光', '白鹭'])
    // A known name resolves back to its card id, so the panel can link it.
    expect(ledger?.characters[0]?.id).toBe('card-00000001')
    expect(ledger?.characters[1]?.id).toBeUndefined()
  })

  it('accepts a fenced reply', () => {
    const ledger = parseTrackerReply('```json\n{"world":"雨停了。","characters":[]}\n```', [])
    expect(ledger?.world).toBe('雨停了。')
  })

  it('rejects prose and an empty ledger instead of marking the range tracked', () => {
    expect(parseTrackerReply('雨下大了。', [])).toBeUndefined()
    expect(parseTrackerReply(JSON.stringify({ world: '   ', characters: [] }), [])).toBeUndefined()
    expect(parseTrackerReply(JSON.stringify({ characters: [{ name: '极光', progress: '' }] }), [])).toBeUndefined()
  })

  it('drops duplicate and nameless entries', () => {
    const ledger = parseTrackerReply(JSON.stringify({
      world: '雨夜',
      characters: [
        { name: '极光', progress: '甲' },
        { name: '极光', progress: '乙' },
        { name: '', progress: '丙' },
      ],
    }), [])
    expect(ledger?.characters).toHaveLength(1)
    expect(ledger?.characters[0]?.progress).toBe('甲')
  })
})
