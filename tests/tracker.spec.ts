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
  staleTurnsAfterWrite,
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
  it('starts disabled with the turn trigger selected', () => {
    const config = defaultTrackerConfig()
    expect(config.enabled).toBe(false)
    expect(config.trigger).toBe('turns')
    expect(config.everyTurns).toBeGreaterThan(0)
    // Both numbers stay valid so switching the trigger needs no retyping.
    expect(config.everyMinutes).toBeGreaterThan(0)
  })

  it('rejects out-of-range, half-filled, and unknown triggers', () => {
    expect(() => normalizeTrackerConfig({ everyTurns: -1 })).toThrow(TrackerConfigInvalidError)
    expect(() => normalizeTrackerConfig({ everyMinutes: 999_999 })).toThrow(TrackerConfigInvalidError)
    expect(() => normalizeTrackerConfig({ model: { provider: 'p' } })).toThrow(TrackerConfigInvalidError)
    expect(() => normalizeTrackerConfig({ trigger: 'hourly' })).toThrow(/触发方式/)
    expect(() => normalizeTrackerConfig({ schema: TRACKER_SCHEMA + 1 })).toThrow(/高于支持版本/)
  })

  it('treats a stored 0 as the legacy "off" marker and keeps a usable interval', () => {
    // 0 could only come from an older file; it becomes the default rather than
    // either failing the file or producing a schedule that never fires.
    const config = normalizeTrackerConfig({ everyTurns: 0, everyMinutes: 0 })
    expect(config.everyTurns).toBe(defaultTrackerConfig().everyTurns)
    expect(config.everyMinutes).toBe(defaultTrackerConfig().everyMinutes)
  })

  it('migrates a stored config that only had the minute trigger set', () => {
    // Older files expressed "off" as 0 and had no `trigger` field. A file that
    // set a minute interval was using the time schedule.
    expect(normalizeTrackerConfig({ everyMinutes: 30, everyTurns: 10 }).trigger).toBe('minutes')
    expect(normalizeTrackerConfig({ everyMinutes: 0, everyTurns: 10 }).trigger).toBe('turns')
  })

  it('reads defaults when no file exists and round-trips a stored config', async () => {
    const directory = await workspace()
    expect(await readTrackerConfig(directory)).toEqual(defaultTrackerConfig())
    const written = await writeTrackerConfig(directory, {
      enabled: true, trigger: 'minutes', everyTurns: 4, everyMinutes: 30, maxTranscriptChars: 12_000,
    })
    expect(written.enabled).toBe(true)
    expect(written.trigger).toBe('minutes')
    expect((await readTrackerConfig(directory)).everyMinutes).toBe(30)
  })

  it('fills length budgets from the defaults when a file predates them', () => {
    const config = normalizeTrackerConfig({ enabled: true, everyTurns: 5 })
    expect(config.lengths).toEqual(defaultTrackerConfig().lengths)
  })

  it('rejects an out-of-range length budget', () => {
    expect(() => normalizeTrackerConfig({ lengths: { world: { suggested: 5 } } }))
      .toThrow(TrackerConfigInvalidError)
    expect(() => normalizeTrackerConfig({ lengths: { character: 'wide' } }))
      .toThrow(TrackerConfigInvalidError)
  })

  it('round-trips custom length budgets', async () => {
    const directory = await workspace()
    await writeTrackerConfig(directory, {
      lengths: {
        world: { suggested: 600 }, character: { suggested: 360 }, user: { suggested: 300 },
      },
    })
    const stored = await readTrackerConfig(directory)
    expect(stored.lengths.world.suggested).toBe(600)
    expect(stored.lengths.character.suggested).toBe(360)
    expect(stored.lengths.user.suggested).toBe(300)
  })
})

describe('tracker scheduling', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z')
  const base: TrackerConfig = { ...defaultTrackerConfig(), enabled: true, trigger: 'turns', everyTurns: 5, everyMinutes: 30 }
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

  it('uses only the configured schedule, never both', () => {
    // The turn trigger is far from due, and the minute interval is long past;
    // picking 'turns' means the elapsed time must not fire a run.
    const turnsOnly: TrackerConfig = { ...base, trigger: 'turns', everyTurns: 10 }
    const longAgo = new Date(now - 10 * 60 * 60_000).toISOString()
    expect(trackerDue(turnsOnly, { schema: TRACKER_SCHEMA, lastTurn: 1, lastAt: longAgo }, 3, now)).toBe(false)

    // The minute trigger is not due, and enough new beats have arrived;
    // picking 'minutes' means the beat count must not fire a run.
    const minutesOnly: TrackerConfig = { ...base, trigger: 'minutes', everyMinutes: 60 }
    const justNow = new Date(now - 60_000).toISOString()
    expect(trackerDue(minutesOnly, { schema: TRACKER_SCHEMA, lastTurn: 1, lastAt: justNow }, 90, now)).toBe(false)
  })

  it('fires on elapsed time alone when that is the chosen trigger', () => {
    const timed: TrackerConfig = { ...base, trigger: 'minutes', everyMinutes: 30 }
    const lastAt = new Date(now - 29 * 60_000).toISOString()
    expect(trackerDue(timed, { schema: TRACKER_SCHEMA, lastTurn: 1, lastAt }, 2, now)).toBe(false)
    const older = new Date(now - 31 * 60_000).toISOString()
    expect(trackerDue(timed, { schema: TRACKER_SCHEMA, lastTurn: 1, lastAt: older }, 2, now)).toBe(true)
  })

  it('treats a never-tracked chat as due on the time trigger', () => {
    const timed: TrackerConfig = { ...base, trigger: 'minutes', everyMinutes: 60 }
    expect(trackerDue(timed, fresh, 1, now)).toBe(true)
  })
})

describe('tracker storage', () => {
  it('keeps each chat’s state separate', async () => {
    const directory = await workspace()
    await writeTrackerState(directory, 'session-a', { schema: TRACKER_SCHEMA, lastTurn: 12 })
    expect((await readTrackerState(directory, 'session-a')).lastTurn).toBe(12)
    expect((await readTrackerState(directory, 'session-b')).lastTurn).toBe(0)
  })

  it('lists ledgers newest first and marks every turn the newest one read', async () => {
    const directory = await workspace()
    for (const turn of [5, 12, 3]) {
      await writeTrackerSummary(directory, 'session-a', {
        schema: TRACKER_SCHEMA, turn, at: '2026-10-23T00:00:00.000Z',
        world: '雨夜', characters: [], transcriptChars: 100,
      })
    }
    const summaries = await listTrackerSummaries(directory, 'session-a')
    expect(summaries.map(summary => summary.turn)).toEqual([12, 5, 3])
    // A run reads from the opening, so reaching 12 means 1 through 12 were all
    // read — not just the three turns that happen to own a ledger file.
    expect(trackedTurns(summaries)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    )
  })

  it('marks nothing before the first run', () => {
    expect(trackedTurns([])).toEqual([])
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
  it('gives the model the cast and the hidden plot', () => {
    const system = buildTrackerSystem({
      cards: [card()],
      world: { scene: '灯塔', facts: [], hidden: ['轴撑不到天亮'] },
      lengths: defaultTrackerConfig().lengths,
    })
    expect(system).toContain('极光')
    expect(system).toContain('轴撑不到天亮')
    expect(system).toContain('{"world"')
    expect(system).toContain('不要复述他说过的台词')
  })

  it('asks for the current state of the whole story, not an incremental update', () => {
    const system = buildTrackerSystem({
      cards: [card()], world: { scene: '', facts: [], hidden: [] }, lengths: defaultTrackerConfig().lengths,
    })
    // Every run reads the complete transcript, so there is no "previous
    // ledger" section and no instruction to update one.
    expect(system).toContain('从开场到现在的完整剧情')
    expect(system).toContain('不是剧情经过')
    expect(system).not.toContain('上一版')
  })

  it('says so when there are no cards', () => {
    expect(buildTrackerSystem({
      cards: [], world: { scene: '', facts: [], hidden: [] }, lengths: defaultTrackerConfig().lengths,
    })).toContain('没有角色卡')
  })

  it('labels the transcript as the full story up to the turn', () => {
    expect(buildTrackerMessage('[旁白] 风停了。', 7)).toContain('从开场到第 7 轮')
    expect(buildTrackerMessage('', 3)).toContain('还没有写入舞台')
  })
})

describe('tracker staleness', () => {
  it('reports a covered turn regenerated after the ledger was written', () => {
    const ledgerAt = Date.parse('2026-10-23T10:00:00.000Z')
    const records = [
      { turn: 3, replacement: 5, at: '2026-10-23T09:00:00.000Z' },
      { turn: 4, replacement: 6, at: '2026-10-23T11:00:00.000Z' },
    ]
    const stale = staleTurnsAfterWrite(records, 4, ledgerAt)
    // Turn 3 was replaced before the ledger existed, so the ledger already
    // describes the replacement. Turn 4 was replaced after it.
    expect(stale).toEqual([4])
  })

  it('ignores a replacement for a turn the ledger does not cover', () => {
    const ledgerAt = Date.parse('2026-10-23T10:00:00.000Z')
    const records = [{ turn: 9, replacement: 10, at: '2026-10-23T11:00:00.000Z' }]
    expect(staleTurnsAfterWrite(records, 4, ledgerAt)).toEqual([])
  })

  it('treats an unparsable timestamp as stale rather than trusting the ledger', () => {
    const records = [{ turn: 2, replacement: 3, at: 'not-a-date' }]
    expect(staleTurnsAfterWrite(records, 4, Date.parse('2026-10-23T10:00:00.000Z'))).toEqual([2])
  })
})

describe('tracker reply parsing', () => {
  it('reads the player entry as well as the world and cast', () => {
    const ledger = parseTrackerReply(JSON.stringify({
      world: '灯塔的灯又闪了一下。',
      user: { progress: '玩家已经答应今晚留下守灯。' },
      characters: [{ name: '极光', progress: '他把备用灯芯让了出来。' }],
    }), [card()])
    expect(ledger?.user?.progress).toContain('答应今晚留下守灯')
  })

  it('keeps an old ledger readable when it has no player entry', () => {
    const ledger = parseTrackerReply(JSON.stringify({
      world: '雨夜', characters: [{ name: '极光', progress: '甲' }],
    }), [])
    expect(ledger?.user).toBeUndefined()
    expect(ledger?.characters).toHaveLength(1)
  })

  it('cuts each section to twice its suggested length', () => {
    const lengths = {
      world: { suggested: 10 }, character: { suggested: 5 }, user: { suggested: 8 },
    }
    const ledger = parseTrackerReply(JSON.stringify({
      world: 'W'.repeat(100),
      user: { progress: 'U'.repeat(100) },
      characters: [{ name: '极光', progress: 'C'.repeat(100) }],
    }), [], lengths)
    // The ellipsis is appended after the cut, so the body is exactly 2x suggested.
    expect(ledger?.world.length).toBe(21)
    expect(ledger?.user?.progress.length).toBe(17)
    expect(ledger?.characters[0]?.progress.length).toBe(11)
  })

  it('accepts a ledger with only a player entry', () => {
    const ledger = parseTrackerReply(JSON.stringify({ user: { progress: '玩家站在门口。' } }), [])
    expect(ledger?.world).toBe('')
    expect(ledger?.user?.progress).toBe('玩家站在门口。')
  })

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
