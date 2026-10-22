import { describe, expect, it } from 'vitest'
import {
  AGENT_CONFIG_LIMITS,
  AgentConfigInvalidError,
  defaultAgentConfig,
  normalizeAgentConfig,
} from '../src/agent-config.ts'
import { mentionedSpeaker } from '../src/orchestrator.ts'

const CAST = [
  { id: 'a4f6540e-e289-4fd9-89e3-1653408cc286', name: '林见夏', brief: '售票员' },
  { id: 'acadf9ff-a752-45e0-a143-4c10590d6da7', name: '沈砚舟', brief: '调度' },
]

describe('agent config defaults', () => {
  it('matches the constants the orchestrator shipped with', () => {
    const config = defaultAgentConfig()
    expect(config.maxSpeechesPerBeat).toBe(3)
    expect(config.stageWindow).toBe(40)
    expect(config.loreScanLines).toBe(20)
    expect(config.loreMaxEntries).toBe(8)
    expect(config.loreMaxChars).toBe(6000)
    expect(config.playerInputMax).toBe(8000)
    expect(config.rotateSpeakers).toBe(true)
    expect(config.honorPlayerMention).toBe(false)
    expect(config.unknownSpeaker).toBe('none')
    expect(config.directorModel).toBeUndefined()
    expect(config.characterModel).toBeUndefined()
  })

  it('treats an empty payload as the defaults', () => {
    expect(normalizeAgentConfig({})).toEqual(defaultAgentConfig())
  })
})

describe('agent config validation', () => {
  it('accepts values on both bounds', () => {
    const config = normalizeAgentConfig({
      maxSpeechesPerBeat: AGENT_CONFIG_LIMITS.maxSpeechesPerBeat.max,
      stageWindow: AGENT_CONFIG_LIMITS.stageWindow.min,
      loreScanLines: AGENT_CONFIG_LIMITS.loreScanLines.max,
      loreMaxEntries: AGENT_CONFIG_LIMITS.loreMaxEntries.min,
      loreMaxChars: AGENT_CONFIG_LIMITS.loreMaxChars.max,
      playerInputMax: AGENT_CONFIG_LIMITS.playerInputMax.min,
    })
    expect(config.maxSpeechesPerBeat).toBe(6)
    expect(config.stageWindow).toBe(4)
    expect(config.loreScanLines).toBe(200)
    expect(config.loreMaxEntries).toBe(1)
    expect(config.loreMaxChars).toBe(40_000)
    expect(config.playerInputMax).toBe(200)
  })

  it.each([
    ['maxSpeechesPerBeat', 0],
    ['maxSpeechesPerBeat', 7],
    ['stageWindow', 3],
    ['loreScanLines', 201],
    ['loreMaxEntries', 0],
    ['loreMaxChars', 199],
    ['playerInputMax', 20_001],
  ] as const)('rejects %s = %i', (field, value) => {
    expect(() => normalizeAgentConfig({ [field]: value })).toThrow(AgentConfigInvalidError)
  })

  it('rejects a non-integer or non-numeric bound', () => {
    expect(() => normalizeAgentConfig({ stageWindow: 4.5 })).toThrow('必须是')
    expect(() => normalizeAgentConfig({ stageWindow: '40' })).toThrow('必须是')
  })

  it('rejects a non-boolean switch', () => {
    expect(() => normalizeAgentConfig({ rotateSpeakers: 'yes' })).toThrow('必须是布尔值')
  })

  it('rejects an unknown speaker policy', () => {
    expect(() => normalizeAgentConfig({ unknownSpeaker: 'last' })).toThrow('none 或 first')
  })

  it('rejects a half-filled model choice', () => {
    expect(() => normalizeAgentConfig({ directorModel: { provider: 'p' } })).toThrow('同时填写')
    expect(() => normalizeAgentConfig({ directorModel: { model: 'm' } })).toThrow('同时填写')
  })

  it('accepts a full model choice and drops an empty one', () => {
    const config = normalizeAgentConfig({
      directorModel: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' },
      characterModel: { provider: '', model: '' },
    })
    expect(config.directorModel).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-flash',
      reasoningEffort: 'max',
    })
    expect(config.characterModel).toBeUndefined()
  })

  it('rejects a config from a newer schema', () => {
    expect(() => normalizeAgentConfig({ schema: 99 })).toThrow('高于支持版本')
  })
})

describe('mentionedSpeaker', () => {
  it('finds the character the player addressed', () => {
    expect(mentionedSpeaker('我问林见夏：下一站还有多远？', CAST)?.name).toBe('林见夏')
  })

  it('prefers the earliest mention when several are named', () => {
    expect(mentionedSpeaker('沈砚舟和林见夏都在车上', CAST)?.name).toBe('沈砚舟')
  })

  it('returns undefined when nobody is named', () => {
    expect(mentionedSpeaker('外面雨大吗？', CAST)).toBeUndefined()
  })

  it('ignores an empty utterance', () => {
    expect(mentionedSpeaker('', CAST)).toBeUndefined()
  })
})
