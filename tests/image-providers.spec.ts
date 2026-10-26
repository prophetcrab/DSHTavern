import { afterEach, describe, expect, it, vi } from 'vitest'
import { signVolcRequest } from '../src/image/providers/volc-signer.ts'
import { openAiImagesEndpoint, openAiImagesProvider } from '../src/image/providers/openai-images.ts'
import { JIMENG_POLL_MS, jimengActionUrl, jimengProvider, jimengSize } from '../src/image/providers/jimeng.ts'
import type { ImageRequest } from '../src/image/providers/types.ts'

function png(size = 2048): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return bytes
}

const request: ImageRequest = {
  mode: 'scene',
  prompt: '雨夜车厢',
  negative: '水印',
  aspect: '3:2',
  count: 1,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('OpenAI Images adapter', () => {
  it('resolves base URLs with or without /v1 and full paths', () => {
    expect(openAiImagesEndpoint('https://api.openai.com')).toBe('https://api.openai.com/v1/images/generations')
    expect(openAiImagesEndpoint('https://relay.example/v1/')).toBe('https://relay.example/v1/images/generations')
    expect(openAiImagesEndpoint('https://relay.example/v1/images/generations')).toBe('https://relay.example/v1/images/generations')
  })

  it('sends one b64 image request and decodes the result', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from(png()).toString('base64'), revised_prompt: '雨夜' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await openAiImagesProvider.generate({
      config: { baseUrl: 'https://relay.example/v1', model: 'gpt-image-1', quality: 'high' },
      credentials: { apiKey: 'sk-test' },
      request,
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      maxImageBytes: 10 * 1024 * 1024,
    })
    expect(result.provider).toBe('openai-images')
    expect(result.images[0]?.mime).toBe('image/png')
    expect(result.images[0]?.bytes.byteLength).toBe(2048)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://relay.example/v1/images/generations')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-image-1',
      n: 1,
      size: '1536x1024',
      quality: 'high',
      response_format: 'b64_json',
    })
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
  })

  it('reports a provider error without hiding the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'invalid key' },
    }), { status: 401, headers: { 'content-type': 'application/json' } })))
    await expect(openAiImagesProvider.generate({
      config: { baseUrl: 'https://relay.example/v1', model: 'gpt-image-1', quality: '' },
      credentials: { apiKey: 'bad' },
      request,
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      maxImageBytes: 10 * 1024 * 1024,
    })).rejects.toMatchObject({ status: 401, message: expect.stringContaining('invalid key') })
  })
})

describe('Jimeng adapter', () => {
  it('maps aspects and actions', () => {
    expect(jimengSize('16:9')).toEqual({ width: 1792, height: 1008 })
    expect(jimengActionUrl('https://visual.volcengineapi.com', 'CVSync2AsyncSubmitTask').searchParams.get('Action'))
      .toBe('CVSync2AsyncSubmitTask')
  })

  it('signs a deterministic Volcengine request', () => {
    const input = {
      method: 'POST',
      url: new URL('https://visual.volcengineapi.com/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31'),
      body: '{"req_key":"jimeng_t2i_v40"}',
      accessKey: 'AKIDEXAMPLE',
      secretKey: 'SECRETEXAMPLE',
      region: 'cn-north-1',
      service: 'cv',
      date: new Date('2026-10-26T00:00:00.000Z'),
    }
    const first = signVolcRequest(input)
    const second = signVolcRequest(input)
    expect(first.authorization).toContain('Credential=AKIDEXAMPLE/20261026/cn-north-1/cv/aws4_request')
    expect(first.authorization).toContain('SignedHeaders=content-type;host;x-content-sha256;x-date')
    expect(first.authorization).toMatch(/Signature=[0-9a-f]{64}$/)
    expect(second.authorization).toBe(first.authorization)
    expect(signVolcRequest({ ...input, body: '{"req_key":"other"}' }).authorization).not.toBe(first.authorization)
  })

  it('submits, polls, downloads and validates the image', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('CVSync2AsyncSubmitTask')) {
        return new Response(JSON.stringify({ data: { task_id: 'task-1' } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('CVSync2AsyncGetResult')) {
        return new Response(JSON.stringify({
          data: { status: 'done', image_urls: ['https://cdn.example/a.png'] },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(png(), { status: 200, headers: { 'content-type': 'image/png' } })
    }))
    const pending = jimengProvider.generate({
      config: {
        endpoint: 'https://visual.volcengineapi.com',
        region: 'cn-north-1',
        reqKey: 'jimeng_t2i_v40',
        promptExpansion: false,
      },
      credentials: { accessKey: 'ak', secretKey: 'sk' },
      request,
      signal: new AbortController().signal,
      timeoutMs: 10_000,
      maxImageBytes: 10 * 1024 * 1024,
    })
    await vi.advanceTimersByTimeAsync(JIMENG_POLL_MS)
    const result = await pending
    expect(result.provider).toBe('jimeng')
    expect(result.images[0]?.mime).toBe('image/png')
    expect(calls).toHaveLength(3)
    expect(calls[0]).toContain('CVSync2AsyncSubmitTask')
    expect(calls[1]).toContain('CVSync2AsyncGetResult')
    expect(calls[2]).toBe('https://cdn.example/a.png')
  })

  it('refuses to call without credentials', async () => {
    await expect(jimengProvider.generate({
      config: {
        endpoint: 'https://visual.volcengineapi.com',
        region: 'cn-north-1',
        reqKey: 'jimeng_t2i_v40',
        promptExpansion: false,
      },
      credentials: {},
      request,
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      maxImageBytes: 10 * 1024 * 1024,
    })).rejects.toMatchObject({ status: 400 })
  })
})
