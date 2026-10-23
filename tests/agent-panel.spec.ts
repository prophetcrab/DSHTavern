import { describe, expect, it } from 'vitest'
import { AGENT_LIMITS, AGENT_TABS, CONTEXT_PRESETS, agentTabChanged } from '../src/client/agent.ts'
import type { AgentConfigView } from '../src/client/agent.ts'

function config(overrides: Partial<AgentConfigView> = {}): AgentConfigView {
  return {
    schema: 1,
    maxSpeechesPerBeat: 2,
    stageWindow: CONTEXT_PRESETS.standard.stageWindow,
    loreScanLines: CONTEXT_PRESETS.standard.loreScanLines,
    loreMaxEntries: CONTEXT_PRESETS.standard.loreMaxEntries,
    loreMaxChars: CONTEXT_PRESETS.standard.loreMaxChars,
    playerInputMax: CONTEXT_PRESETS.standard.playerInputMax,
    rotateSpeakers: false,
    honorPlayerMention: true,
    unknownSpeaker: 'none',
    maxReplyChars: 400,
    directorMaxReplyChars: 200,
    characterMaxReplyChars: { a: 400 },
    stageMaxChars: 80_000,
    reasoningReserveTokens: 512,
    directorModel: { provider: 'p', model: 'm' },
    characterModel: { provider: 'p', model: 'm' },
    ...overrides,
  }
}

describe('agent panel pages', () => {
  it('gives every setting exactly one page', () => {
    const fields = AGENT_TABS.flatMap(tab => tab.fields)
    const settings = Object.keys(config()) as (keyof AgentConfigView)[]
    // `schema` is the file format marker, not something the panel edits.
    expect([...fields].sort()).toEqual(settings.filter(field => field !== 'schema').sort())
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('uses unique page ids', () => {
    expect(new Set(AGENT_TABS.map(tab => tab.id)).size).toBe(AGENT_TABS.length)
  })

  it('reports a page as changed only when one of its own fields differs', () => {
    const saved = config()
    const beatTab = AGENT_TABS.find(tab => tab.id === 'beat')!
    const modelsTab = AGENT_TABS.find(tab => tab.id === 'models')!
    const editedBeat = config({ maxSpeechesPerBeat: 3 })

    expect(agentTabChanged(editedBeat, saved, beatTab.fields)).toBe(true)
    expect(agentTabChanged(editedBeat, saved, modelsTab.fields)).toBe(false)
    expect(agentTabChanged(config({ characterMaxReplyChars: { a: 500 } }), saved, modelsTab.fields)).toBe(false)
    expect(agentTabChanged(saved, saved, beatTab.fields)).toBe(false)
  })

  it('compares per-character reply budgets structurally', () => {
    const saved = config({ characterMaxReplyChars: { a: 400, b: 400 } })
    const replyTab = AGENT_TABS.find(tab => tab.id === 'reply')!
    // Same entries in a different insertion order are not an edit.
    const reordered = config({ characterMaxReplyChars: { b: 400, a: 400 } })
    expect(agentTabChanged(reordered, saved, replyTab.fields)).toBe(false)
    expect(agentTabChanged(config({ characterMaxReplyChars: { a: 400 } }), saved, replyTab.fields)).toBe(true)
  })

  it('keeps each page inside the window without a long scroll', () => {
    const longest = Math.max(...AGENT_TABS.map(tab => tab.fields.length))
    expect(longest).toBeLessThanOrEqual(6)
    expect(Object.keys(AGENT_LIMITS).length).toBeGreaterThanOrEqual(longest)
  })
})
