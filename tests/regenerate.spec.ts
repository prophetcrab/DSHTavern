import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendRegeneration,
  listBeats,
  parseBeatRecord,
  readRegenerations,
  stagedLineCount,
  truncationPoint,
} from '../src/regenerate.ts'
import type { BeatRecord } from '../src/orchestrator.ts'
import { appendStage, readStage, writeStage } from '../src/stage.ts'
import { isOpeningRequest, isRegenerationRequest, lastUserText } from '../src/index.ts'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function story(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-regenerate-'))
  temporaryRoots.push(root)
  return root
}

function beat(overrides: Partial<BeatRecord> = {}): BeatRecord {
  return {
    at: '2026-10-22T10:00:00.000Z',
    playerInput: '我推门进去。',
    directorSystem: 'SYS',
    directorReply: '{}',
    decision: { narration: '门开了。', inner: '' },
    ...overrides,
  }
}

describe('writeStage', () => {
  it('replaces the stage with the supplied lines', async () => {
    const root = await story()
    await appendStage(root, [
      { kind: 'narration', text: '开场。', scope: 'observable' },
      { kind: 'speech', speaker: 'c1', speakerName: '林见夏', text: '你来了。', scope: 'observable' },
    ])
    await appendStage(root, [{ kind: 'narration', text: '被丢弃的旁白。', scope: 'observable' }])
    const written = await writeStage(root, [
      { kind: 'narration', text: '开场。', scope: 'observable' },
      { kind: 'narration', text: '重来。', scope: 'observable' },
    ])
    expect(written.map(entry => entry.seq)).toEqual([1, 2])
    // The rewrite is durable: the next beat reads the replacement stage.
    expect((await readStage(root)).map(entry => entry.text)).toEqual(['开场。', '重来。'])
  })

  it('writes an empty stage when every line is discarded', async () => {
    const root = await story()
    await appendStage(root, [{ kind: 'narration', text: '唯一一行。', scope: 'observable' }])
    await writeStage(root, [])
    expect(await readStage(root)).toEqual([])
  })

  it('renumbers entries that already carry a seq and at', async () => {
    // The replay path hands over a stage the orchestrator kept appending to, so
    // its entries still carry the values from when they were pushed. A spread
    // would let those win and leave the file with duplicate sequences.
    const root = await story()
    await appendStage(root, [
      { kind: 'narration', text: '一。', scope: 'observable' },
      { kind: 'narration', text: '二。', scope: 'observable' },
    ])
    const current = await readStage(root)
    const written = await writeStage(root, current)
    expect(written.map(entry => entry.seq)).toEqual([1, 2])
    expect(new Set(written.map(entry => entry.at)).size).toBe(1)
  })
})

describe('stagedLineCount', () => {
  it('counts the narration and speech of a multi-turn beat', () => {
    expect(stagedLineCount(beat({
      turns: [
        { directorSystem: '', directorReply: '', decision: { narration: '雨。', inner: '' }, speech: '走吧。' },
        { directorSystem: '', directorReply: '', decision: { narration: '', inner: '' }, speech: '嗯。' },
      ],
    }))).toBe(3)
  })

  it('counts a beat recorded before turns existed', () => {
    expect(stagedLineCount(beat({ speech: '走吧。' }))).toBe(2)
  })

  it('does not count an empty speech', () => {
    expect(stagedLineCount(beat({ speech: '   ' }))).toBe(1)
  })
})

describe('truncationPoint', () => {
  it('prefers the recorded pre-beat length', () => {
    expect(truncationPoint(beat({ stageCountBefore: 7 }), 9)).toBe(7)
  })

  it('derives it from what the beat staged on an older record', () => {
    expect(truncationPoint(beat({ speech: '走吧。' }), 6)).toBe(4)
  })

  it('never cuts outside the stage', () => {
    expect(truncationPoint(beat({ stageCountBefore: 99 }), 3)).toBe(3)
  })
})

describe('beat records', () => {
  it('keeps the pre-beat snapshot fields', () => {
    const parsed = parseBeatRecord(beat({
      turn: 4,
      stageCountBefore: 2,
      worldBefore: { scene: '站台', facts: ['雨'], hidden: ['他带着信'] },
      regeneratedFrom: '2026-10-22T09:00:00.000Z',
    }))
    expect(parsed?.turn).toBe(4)
    expect(parsed?.stageCountBefore).toBe(2)
    expect(parsed?.worldBefore).toEqual({ scene: '站台', facts: ['雨'], hidden: ['他带着信'] })
    expect(parsed?.regeneratedFrom).toBe('2026-10-22T09:00:00.000Z')
  })

  it('rejects a record without the fields replay needs', () => {
    expect(parseBeatRecord({ at: 1 })).toBeUndefined()
    expect(parseBeatRecord({ playerInput: 'x' })).toBeUndefined()
  })

  it('drops a world snapshot with the wrong field types', () => {
    const parsed = parseBeatRecord(beat({ worldBefore: { scene: 7 } as never }))
    expect(parsed?.worldBefore).toBeUndefined()
  })
})

describe('regeneration history', () => {
  it('appends and reads back records in order', async () => {
    const root = await story()
    await appendRegeneration(root, { turn: 3, replacement: 4, at: '2026-10-22T10:00:00.000Z' })
    await appendRegeneration(root, { turn: 4, replacement: 5, at: '2026-10-22T10:05:00.000Z' })
    const records = await readRegenerations(root)
    expect(records).toEqual([
      { turn: 3, replacement: 4, at: '2026-10-22T10:00:00.000Z' },
      { turn: 4, replacement: 5, at: '2026-10-22T10:05:00.000Z' },
    ])
  })

  it('reads a missing file as no records', async () => {
    expect(await readRegenerations(await story())).toEqual([])
  })
})

describe('listBeats', () => {
  it('returns the newest beat first', async () => {
    const root = await story()
    const directory = join(root, 'beats')
    await mkdir(directory, { recursive: true })
    const write = async (name: string, record: BeatRecord): Promise<void> => {
      await writeFile(join(directory, name), JSON.stringify(record), 'utf8')
    }
    await write('2026-10-22T09-00-00-000Z.json', beat({ playerInput: '早' }))
    await write('2026-10-22T10-00-00-000Z.json', beat({ playerInput: '晚' }))
    const beats = await listBeats(root)
    expect(beats.map(stored => stored.record.playerInput)).toEqual(['晚', '早'])
  })

  it('skips an unreadable beat instead of failing the story', async () => {
    const root = await story()
    const directory = join(root, 'beats')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'b.json'), '{ not json', 'utf8')
    await writeFile(join(directory, 'a.json'), JSON.stringify(beat()), 'utf8')
    const beats = await listBeats(root)
    expect(beats.map(stored => stored.record.playerInput)).toEqual(['我推门进去。'])
  })
})

function options(messages: Array<{ role: string; content: unknown; source?: unknown }>): GenerateOptions {
  return { provider: 'p', model: 'm', messages } as unknown as GenerateOptions
}

describe('regeneration trigger detection', () => {
  it('recognizes the regeneration source and ignores it as player text', () => {
    const request = options([
      { role: 'user', content: [{ type: 'text', text: '我推门进去。' }], source: { kind: 'user' } },
      { role: 'assistant', content: [{ type: 'text', text: '门开了。' }], source: { kind: 'model' } },
      {
        role: 'user',
        content: [{ type: 'text', text: '（重新生成上一幕）' }],
        source: { kind: 'tavern-regenerate' },
      },
    ])
    expect(isRegenerationRequest(request)).toBe(true)
    // The replay must use the stored player input, not the trigger text.
    expect(lastUserText(request)).toBe('我推门进去。')
  })

  it('treats an ordinary prompt as a normal beat', () => {
    const request = options([
      { role: 'user', content: [{ type: 'text', text: '（重新生成上一幕）' }], source: { kind: 'user' } },
    ])
    expect(isRegenerationRequest(request)).toBe(false)
    expect(lastUserText(request)).toBe('（重新生成上一幕）')
  })

  it('recognizes the opening trigger without treating it as a regeneration', () => {
    const request = options([
      { role: 'user', content: [{ type: 'text', text: '（开场）' }], source: { kind: 'tavern-opening' } },
    ])
    expect(isOpeningRequest(request)).toBe(true)
    expect(isRegenerationRequest(request)).toBe(false)
    expect(lastUserText(request)).toBe('')
  })

  it('ignores an opening trigger older than the player prompt', () => {
    // The opening turn's trigger stays in derived history, so only the newest
    // non-harness message may classify the turn.
    const request = options([
      { role: 'user', content: [{ type: 'text', text: '（开场）' }], source: { kind: 'tavern-opening' } },
      { role: 'assistant', content: [{ type: 'text', text: '雨。' }], source: { kind: 'model' } },
      { role: 'user', content: [{ type: 'text', text: '我上车。' }], source: { kind: 'user' } },
    ])
    expect(isOpeningRequest(request)).toBe(false)
    expect(isRegenerationRequest(request)).toBe(false)
    expect(lastUserText(request)).toBe('我上车。')
  })
})
