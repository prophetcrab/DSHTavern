import { describe, expect, it } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { textReply } from '../src/index.ts'

const OPTIONS = { provider: 'test', model: 'test', messages: [] } as unknown as GenerateOptions

async function collect(stream: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('textReply', () => {
  it('closes the text block without emitting a token delta', async () => {
    // DSH derives output speed from the first token delta; a synthesized delta
    // on an orchestrated reply would report an impossible tok/s figure.
    const chunks = await collect(textReply(OPTIONS, '旁白与台词'))
    expect(chunks.some(chunk => chunk.type === 'text-delta')).toBe(false)
    expect(chunks.some(chunk => chunk.type === 'reasoning-delta')).toBe(false)
  })

  it('still carries the full text in the closing block', async () => {
    const chunks = await collect(textReply(OPTIONS, '**林见夏**\n\n雨大。'))
    const end = chunks.find(chunk => chunk.type === 'block-end')
    expect(end).toBeDefined()
    if (end?.type !== 'block-end') throw new Error('unreachable')
    expect(end.block).toEqual({ type: 'text', text: '**林见夏**\n\n雨大。' })
  })

  it('forwards summed usage before finishing', async () => {
    const chunks = await collect(textReply(OPTIONS, 'x', {
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 60,
      cacheWriteTokens: 5,
    }))
    const usage = chunks.find(chunk => chunk.type === 'usage')
    expect(usage).toBeDefined()
    if (usage?.type !== 'usage') throw new Error('unreachable')
    expect(usage.usage.inputTokens).toBe(100)
    expect(usage.usage.cacheReadTokens).toBe(60)
    expect(usage.usage.totalTokens).toBe(205)
    expect(chunks.at(-1)?.type).toBe('finish')
  })

  it('omits the usage chunk when every bucket is zero', async () => {
    const chunks = await collect(textReply(OPTIONS, 'x', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }))
    expect(chunks.some(chunk => chunk.type === 'usage')).toBe(false)
  })
})
