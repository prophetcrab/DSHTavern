import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SECTION_NAME, apply, inject } from '../src/session.ts'

interface SectionOptions {
  readonly name: string
  readonly complete?: boolean
  readonly interpolate?: boolean
  readonly text: string | (() => string)
}

/** Boot the preset row against a fake root surface and return captured state. */
async function boot(): Promise<{
  ctx: Context
  sections: SectionOptions[]
  suppressed: () => boolean
  assembleCalls: () => number
}> {
  const sections: SectionOptions[] = []
  let suppressCalled = false
  let assemblies = 0
  const ctx = new Context()
  ctx.provide('systemPrompt', {
    section: (options: SectionOptions) => {
      sections.push(options)
      return () => {}
    },
    suppressRuntimeContext: () => {
      suppressCalled = true
      return () => {}
    },
  } as never)
  ctx.provide('tavernWorkspaces', {
    assemblePromptText: async () => {
      assemblies += 1
      return 'WORKSPACE PROMPT'
    },
  } as never)
  await ctx.plugin({ apply, inject } as never)
  return {
    ctx,
    sections,
    suppressed: () => suppressCalled,
    assembleCalls: () => assemblies,
  }
}

describe('tavern prompt preset row', () => {
  it('registers a complete per-agent section and suppresses runtime context', async () => {
    const { ctx, sections, suppressed } = await boot()
    const agentCtx = ctx.extend()
    const agent = { session: { header: { cwd: 'C:/taverns/one' } }, ctx: agentCtx }
    await ctx.serial('agent/created', { agent, source: 'startup' } as never)
    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe(SECTION_NAME)
    expect(sections[0]?.complete).toBe(true)
    expect(sections[0]?.interpolate).toBe(false)
    expect(suppressed()).toBe(true)
    expect(typeof sections[0]?.text).toBe('function')
  })

  it('refreshes the workspace text before each step', async () => {
    const { ctx, sections, assembleCalls } = await boot()
    const agentCtx = ctx.extend()
    const agent = { session: { header: { cwd: 'C:/taverns/one' } }, ctx: agentCtx }
    await ctx.serial('agent/created', { agent, source: 'startup' } as never)
    const text = sections[0]?.text as () => string
    expect(assembleCalls()).toBe(0)
    expect(text()).toBe('')
    await agentCtx.waterfall('agent/pre-step', {
      agent,
      messages: [],
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    } as never, async () => ({ kind: 'enter', messages: [] }))
    expect(assembleCalls()).toBe(1)
    expect(text()).toBe('WORKSPACE PROMPT')
  })
})
