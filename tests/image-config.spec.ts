import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ImageConfigInvalidError,
  defaultImageConfig,
  httpUrl,
  normalizeImageConfig,
  readImageConfig,
  writeImageConfig,
} from '../src/image/config.ts'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-image-config-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('image config', () => {
  it('defaults to disabled, OpenAI Images and two provider blocks', () => {
    const config = defaultImageConfig()
    expect(config.enabled).toBe(false)
    expect(config.provider).toBe('openai-images')
    expect(config.providers['openai-images'].model).toBe('gpt-image-1')
    expect(config.providers.jimeng.reqKey).toBe('jimeng_t2i_v40')
    expect(config.scene.aspect).toBe('3:2')
    expect(config.portrait.aspect).toBe('2:3')
  })

  it('normalizes missing fields and keeps provider blocks when switching', () => {
    const config = normalizeImageConfig({
      schema: 1,
      enabled: true,
      provider: 'jimeng',
      providers: {
        'openai-images': { baseUrl: 'https://relay.example/v1', model: 'gpt-image-x', quality: 'high' },
        jimeng: { endpoint: 'http://127.0.0.1:9999', region: 'cn-north-1', reqKey: 'jimeng_t2i_v40' },
      },
      scene: { template: '{{scene}}', negative: '水印' },
    })
    expect(config.enabled).toBe(true)
    expect(config.provider).toBe('jimeng')
    expect(config.providers['openai-images'].model).toBe('gpt-image-x')
    expect(config.providers.jimeng.endpoint).toBe('http://127.0.0.1:9999')
    expect(config.scene.template).toBe('{{scene}}')
    expect(config.portrait.aspect).toBe('2:3')
  })

  it('rejects unknown providers, newer schemas and public HTTP endpoints', () => {
    expect(() => normalizeImageConfig({ provider: 'unknown' })).toThrow(ImageConfigInvalidError)
    expect(() => normalizeImageConfig({ schema: 2 })).toThrow(/高于支持版本/)
    expect(() => httpUrl('http://example.com/v1', 'base URL', '', false)).toThrow(/本机或内网/)
    expect(httpUrl('http://127.0.0.1:8188', 'base URL', '', false)).toBe('http://127.0.0.1:8188')
    expect(httpUrl('https://api.example.com/v1/', 'base URL', '', false)).toBe('https://api.example.com/v1')
  })

  it('round-trips through the workspace file', async () => {
    const root = await workspace()
    const written = await writeImageConfig(root, {
      ...defaultImageConfig(),
      enabled: true,
      provider: 'jimeng',
    })
    expect(written.enabled).toBe(true)
    const read = await readImageConfig(root)
    expect(read.provider).toBe('jimeng')
    const raw = JSON.parse(await readFile(join(root, '.dshtavern', 'image.json'), 'utf8')) as { enabled: boolean }
    expect(raw.enabled).toBe(true)
  })

  it('returns defaults when the file is absent', async () => {
    const root = await workspace()
    expect((await readImageConfig(root)).enabled).toBe(false)
  })
})
