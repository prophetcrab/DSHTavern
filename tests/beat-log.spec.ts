import { describe, expect, it } from 'vitest'
import {
  BEAT_LOG_FIELD_MAX_CHARS,
  BEAT_RECORD_TYPE,
  buildBeatLog,
  parseBeatLog,
  renderBeatLogText,
  summarizeBeatLog,
} from '../src/beat-log.ts'
import { beatLogFromRecord } from '../src/beat-log-host.ts'
import type { BeatRecord } from '../src/orchestrator.ts'

function call(overrides: Partial<Parameters<typeof buildBeatLog>[0]['calls'][number]> = {}) {
  return {
    role: 'director' as const,
    model: 'deepseek-official/deepseek-flash',
    system: 'SYS',
    message: '我推门进去。',
    reply: '{"narration":"门开了。"}',
    ...overrides,
  }
}

describe('buildBeatLog', () => {
  it('keeps every call in order', () => {
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      turn: 4,
      playerInput: '我推门进去。',
      calls: [
        call(),
        call({ role: 'character', cardId: 'c1', name: '林见夏', message: '【旁白】门开了。', reply: '你来了。' }),
      ],
    })
    expect(log.turn).toBe(4)
    expect(log.calls.map(entry => entry.role)).toEqual(['director', 'character'])
    expect(log.calls[1]?.name).toBe('林见夏')
    expect(log.truncated).toBeUndefined()
  })

  it('bounds a pathological prompt and marks the record', () => {
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      playerInput: 'x',
      calls: [call({ system: 'a'.repeat(BEAT_LOG_FIELD_MAX_CHARS + 10) })],
    })
    expect(log.calls[0]?.system.length).toBe(BEAT_LOG_FIELD_MAX_CHARS)
    expect(log.truncated).toBe(true)
  })

  it('keeps a normal beat exact', () => {
    const system = 'a'.repeat(3000)
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      playerInput: 'x',
      calls: [call({ system })],
    })
    expect(log.calls[0]?.system).toBe(system)
    expect(log.truncated).toBeUndefined()
  })
})

describe('parseBeatLog', () => {
  it('round-trips a built record', () => {
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      turn: 2,
      playerInput: '我推门进去。',
      calls: [call()],
      regeneratedFrom: '2026-10-22T09:00:00.000Z',
      inner: '他还不知道',
    })
    expect(parseBeatLog(JSON.parse(JSON.stringify(log)))).toEqual(log)
  })

  it('drops a record with no readable call', () => {
    expect(parseBeatLog({ at: 'x', calls: [{ role: 'narrator' }] })).toBeUndefined()
    expect(parseBeatLog({ calls: [] })).toBeUndefined()
    expect(parseBeatLog('text')).toBeUndefined()
  })
})

describe('summaries', () => {
  it('names the turn and speakers', () => {
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      turn: 5,
      playerInput: 'x',
      calls: [
        call(),
        call({ role: 'character', cardId: 'c1', name: '林见夏' }),
        call({ role: 'character', cardId: 'c2', name: '苏鹤' }),
      ],
    })
    expect(summarizeBeatLog(log)).toBe('第 5 轮 · 导演 + 林见夏、苏鹤')
  })

  it('says so when only narration played', () => {
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      playerInput: 'x',
      calls: [call()],
    })
    expect(summarizeBeatLog(log)).toBe('导演 + 无角色开口')
  })

  it('names an opening record', () => {
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      turn: 1,
      playerInput: '',
      calls: [call({ role: 'opening', message: '写开场。' })],
    })
    expect(summarizeBeatLog(log)).toBe('第 1 轮 · 开场脚本')
  })
})

describe('renderBeatLogText', () => {
  it('shows every request the beat sent', () => {
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      turn: 3,
      playerInput: '我推门进去。',
      calls: [
        call({ system: 'DIRECTOR SYS', reply: '{}' }),
        call({
          role: 'character',
          cardId: 'c1',
          name: '林见夏',
          system: 'CHARACTER SYS',
          message: '【旁白】门开了。\n\n【玩家】我推门进去。',
          reply: '你来了。',
        }),
      ],
    })
    const text = renderBeatLogText(log)
    expect(text).toContain('第 3 轮 · 导演 + 林见夏')
    expect(text).toContain('## 导演 · 调用 1')
    expect(text).toContain('## 角色 · 林见夏 · 调用 2')
    expect(text).toContain('DIRECTOR SYS')
    expect(text).toContain('CHARACTER SYS')
    expect(text).toContain('我推门进去。')
    expect(text).toContain('你来了。')
  })

  it('warns when a field was cut', () => {
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      playerInput: 'x',
      calls: [call({ system: 'a'.repeat(BEAT_LOG_FIELD_MAX_CHARS + 1) })],
    })
    expect(renderBeatLogText(log)).toContain('已截断')
  })

  it('keeps the director private notes out of the row preview', () => {
    // The collapsed row shows the head of this text; the beat's identity is
    // more useful there than plot notes, so the notes go last.
    const log = buildBeatLog({
      at: '2026-10-22T10:00:00.000Z',
      turn: 3,
      playerInput: '我推门进去。',
      calls: [call()],
      inner: '他不打算说出真相',
    })
    const text = renderBeatLogText(log)
    expect(text.startsWith('第 3 轮 · 导演 + 无角色开口')).toBe(true)
    expect(text.indexOf('导演私记')).toBeGreaterThan(text.indexOf('导演 · 调用 1'))
  })
})

describe('beatLogFromRecord', () => {
  function record(overrides: Partial<BeatRecord> = {}): BeatRecord {
    return {
      at: '2026-10-22T10:00:00.000Z',
      turn: 6,
      playerInput: '我推门进去。',
      directorSystem: 'DIRECTOR SYS',
      directorReply: '{"narration":"门开了。"}',
      decision: { narration: '门开了。', inner: '有人在等' },
      turns: [
        {
          directorSystem: 'DIRECTOR SYS',
          directorReply: '{"narration":"门开了。"}',
          decision: { narration: '门开了。', inner: '有人在等' },
          directorModel: { provider: 'p', model: 'm' },
          effectiveSpeaker: { id: 'c1', name: '林见夏' },
          characterModel: { provider: 'p', model: 'm2' },
          characterSystem: 'CHARACTER SYS',
          characterPromptMessages: [{ role: 'user', text: '【旁白】门开了。\n\n【玩家】我推门进去。' }],
          speech: '你来了。',
        },
      ],
      ...overrides,
    }
  }

  it('logs the director and every speaker call', () => {
    const input = beatLogFromRecord(record(), '我推门进去。', {
      director: 'p/m',
      characters: new Map([['c1', 'p/m2']]),
    })
    expect(input?.calls.map(entry => entry.role)).toEqual(['director', 'character'])
    expect(input?.calls[0]?.system).toBe('DIRECTOR SYS')
    expect(input?.calls[0]?.message).toBe('我推门进去。')
    expect(input?.calls[1]?.message).toContain('【玩家】我推门进去。')
    expect(input?.inner).toBe('有人在等')
  })

  it('logs a repair call and the raw answer it replaced', () => {
    // The repair is a separate request with its own system prompt; logging only
    // the final JSON would hide what the first call actually sent.
    const input = beatLogFromRecord(record({
      turns: [{
        directorSystem: 'DIRECTOR SYS',
        directorReply: '{"narration":"门开了。"}',
        directorRawReply: '门开了，她抬头看你。',
        repairSystem: 'REPAIR SYS',
        repairMessage: '把它转成 JSON。',
        decision: { narration: '门开了。', inner: '' },
      }],
    }), '我推门进去。', { director: 'p/m', characters: new Map() })
    expect(input?.calls.map(entry => entry.role)).toEqual(['director', 'director'])
    expect(input?.calls[0]?.reply).toBe('门开了，她抬头看你。')
    expect(input?.calls[1]?.system).toBe('REPAIR SYS')
    expect(input?.calls[1]?.message).toBe('把它转成 JSON。')
  })

  it('labels a later director call as a continuation', () => {
    const base = record().turns?.[0]
    const input = beatLogFromRecord(record({
      turns: [
        { ...base!, effectiveSpeaker: undefined, characterSystem: undefined },
        { directorSystem: 'SYS 2', directorReply: '{}', decision: { narration: '', inner: '' } },
      ],
    }), '我推门进去。', { director: 'p/m', characters: new Map() })
    expect(input?.calls.map(entry => entry.message)).toEqual(['我推门进去。', '（继续这一幕。）'])
  })

  it('returns nothing when the beat ran no calls', () => {
    expect(beatLogFromRecord(record({ turns: [] }), 'x', { characters: new Map() })).toBeUndefined()
  })
})

describe('record type', () => {
  it('uses the plugin record namespace', () => {
    expect(BEAT_RECORD_TYPE).toBe('plugin:dshtavern/beat')
  })
})
