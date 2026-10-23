import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import {
  TavernInputError,
  TavernWorkspaceNotFoundError,
  TavernWorkspaceService,
  ensureMarker,
  lastUserText,
} from '../src/index.ts'
import type { TavernWorkspaceRecord } from '../src/index.ts'
import {
  PROMPT_BLOCK_IDS,
  PROMPT_LAYOUT_SCHEMA,
  promptLayoutPath,
} from '../src/prompt-layout.ts'
import { createCharacterCard } from '../src/character-card.ts'

interface FakeRoute {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

const temporaryRoots: string[] = []
const disposers: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshtavern-service-'))
  temporaryRoots.push(root)
  return root
}

function fakeWorkspaceRegistry(records: TavernWorkspaceRecord[]): unknown {
  return {
    list: () => records.map(record => ({ ...record, sessionIds: [] })),
    get: (id: string) => {
      const record = records.find(item => item.id === id)
      return record === undefined ? undefined : { ...record, sessionIds: [] }
    },
  }
}

async function mount(
  records: TavernWorkspaceRecord[],
  withWebServer = true,
  agentPresets?: unknown,
): Promise<{
  service: TavernWorkspaceService
  routes: Map<string, FakeRoute>
  ctx: Context
}> {
  const ctx = new Context()
  const routes = new Map<string, FakeRoute>()
  ctx.provide('workspaceRegistry', fakeWorkspaceRegistry(records) as never)
  ctx.provide('llm', { stream: () => (async function* () {})() } as never)
  if (withWebServer) {
    ctx.provide('webServer', {
      register: (route: FakeRoute) => {
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    } as never)
  }
  if (agentPresets !== undefined) ctx.provide('agentPresets', agentPresets as never)
  const fiber = ctx.plugin(TavernWorkspaceService as never) as unknown as PromiseLike<unknown> & {
    dispose(): Promise<void>
  }
  await fiber
  disposers.push(async () => { await fiber.dispose() })
  return {
    service: (ctx as unknown as { tavernWorkspaces: TavernWorkspaceService }).tavernWorkspaces,
    routes,
    ctx,
  }
}

function fakeRequest(method: string, url: string, body?: string): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body, 'utf8')])
  Object.assign(stream, {
    method,
    url,
    headers: { 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
  })
  return stream as unknown as IncomingMessage
}

function fakeResponse(): ServerResponse & { body: string; headers: Record<string, string> } {
  const chunks: string[] = []
  const headers: Record<string, string> = {}
  const response = {
    statusCode: 200,
    headers,
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value },
    end(chunk?: string) { if (chunk !== undefined) chunks.push(chunk) },
    destroy() {},
    get body() { return chunks.join('') },
  }
  return response as unknown as ServerResponse & { body: string; headers: Record<string, string> }
}

async function call(
  route: FakeRoute,
  method: string,
  url: string,
  body?: string,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = fakeResponse()
  await route.handler(fakeRequest(method, url, body), response)
  return { status: response.statusCode, payload: JSON.parse(response.body) as Record<string, unknown> }
}

describe('tavern workspace service prompt layout', () => {
  it('reads the default layout for a tavern workspace', async () => {
    const root = await temporaryRoot()
    const directory = join(root, 'tavern')
    await mkdir(directory, { recursive: true })
    await ensureMarker(directory, 'test')
    const { service } = await mount([{ id: 'w1', path: directory, title: 'test' }])

    const layout = await service.promptLayout('w1')
    expect(layout.workspaceId).toBe('w1')
    expect(layout.workspaceTitle).toBe('test')
    expect(layout.blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS])
    expect(layout.blocks.every(block => block.enabled)).toBe(true)
    expect(layout.savedAt).toBeUndefined()
    expect(layout.hasCharacterCard).toBe(false)
  })

  it('reports a character card only for a stored .charc card', async () => {
    const root = await temporaryRoot()
    const directory = join(root, 'tavern')
    const characters = join(directory, 'characters')
    await mkdir(characters, { recursive: true })
    await ensureMarker(directory, 'test')
    const { service } = await mount([{ id: 'w1', path: directory, title: 'test' }])

    expect((await service.promptLayout('w1')).hasCharacterCard).toBe(false)
    // A stray image is not a card: only the native card extension counts.
    await writeFile(join(characters, 'mudu.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect((await service.promptLayout('w1')).hasCharacterCard).toBe(false)
    await createCharacterCard(directory, { name: '雾都' })
    expect((await service.promptLayout('w1')).hasCharacterCard).toBe(true)
  })

  it('saves a reordered layout and reads it back from disk', async () => {
    const root = await temporaryRoot()
    const directory = join(root, 'tavern')
    await mkdir(directory, { recursive: true })
    await ensureMarker(directory, 'test')
    const { service } = await mount([{ id: 'w1', path: directory, title: 'test' }])

    const blocks = [...PROMPT_BLOCK_IDS].reverse()
      .map((id, index) => ({ id, enabled: index % 2 === 0 }))
    const saved = await service.savePromptLayout('w1', { blocks })
    expect(saved.blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS].reverse())
    // Compare against the submitted flags instead of a hardcoded index: growing
    // the catalogue shifts every reversed position.
    const submitted = new Map(blocks.map(block => [block.id, block.enabled]))
    expect(saved.blocks.every(block => block.enabled === submitted.get(block.id))).toBe(true)
    expect(saved.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const stored = JSON.parse(await readFile(promptLayoutPath(directory), 'utf8')) as {
      schema: number
      blocks: Array<{ id: string }>
    }
    expect(stored.schema).toBe(PROMPT_LAYOUT_SCHEMA)
    expect(stored.blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS].reverse())

    const reread = await service.promptLayout('w1')
    expect(reread.blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS].reverse())
  })

  it('resets the layout to the catalogue default', async () => {
    const root = await temporaryRoot()
    const directory = join(root, 'tavern')
    await mkdir(directory, { recursive: true })
    await ensureMarker(directory, 'test')
    const { service } = await mount([{ id: 'w1', path: directory, title: 'test' }])

    await service.savePromptLayout('w1', { blocks: [...PROMPT_BLOCK_IDS].reverse().map(id => ({ id, enabled: false })) })
    const reset = await service.savePromptLayout('w1', { reset: true })
    expect(reset.blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS])
    expect(reset.blocks.every(block => block.enabled)).toBe(true)
  })

  it('rejects unknown and non-tavern workspaces', async () => {
    const root = await temporaryRoot()
    const plain = join(root, 'plain')
    await mkdir(plain, { recursive: true })
    const { service } = await mount([{ id: 'plain', path: plain, title: 'plain' }])

    await expect(service.promptLayout('missing')).rejects.toBeInstanceOf(TavernWorkspaceNotFoundError)
    await expect(service.promptLayout('plain')).rejects.toBeInstanceOf(TavernInputError)
    await expect(service.savePromptLayout('plain', { reset: true })).rejects.toBeInstanceOf(TavernInputError)
  })
})

describe('prompt layout HTTP route', () => {
  async function tavern(): Promise<{ id: string; directory: string; routes: Map<string, FakeRoute> }> {
    const root = await temporaryRoot()
    const directory = join(root, 'tavern')
    await mkdir(directory, { recursive: true })
    await ensureMarker(directory, 'test')
    const { routes } = await mount([{ id: 'w1', path: directory, title: 'test' }])
    return { id: 'w1', directory, routes }
  }

  it('serves the layout over GET', async () => {
    const { routes } = await tavern()
    const route = routes.get('/tavern/prompt')
    expect(route).toBeDefined()
    const result = await call(route!, 'GET', '/tavern/prompt?workspaceId=w1')
    expect(result.status).toBe(200)
    expect(result.payload.ok).toBe(true)
    const blocks = result.payload.blocks as Array<{ id: string; enabled: boolean }>
    expect(blocks.length).toBe(PROMPT_BLOCK_IDS.length)
    expect(blocks[0]?.id).toBe('main-template')
  })

  it('persists a POSTed order and reflects it in the next GET', async () => {
    const { routes } = await tavern()
    const route = routes.get('/tavern/prompt')!
    const reversed = [...PROMPT_BLOCK_IDS].reverse().map(id => ({ id, enabled: id !== 'examples' }))
    const post = await call(route, 'POST', '/tavern/prompt', JSON.stringify({ workspaceId: 'w1', blocks: reversed }))
    expect(post.status).toBe(200)
    expect(post.payload.ok).toBe(true)
    expect((post.payload.blocks as Array<{ id: string }>)[0]?.id).toBe(PROMPT_BLOCK_IDS[PROMPT_BLOCK_IDS.length - 1])

    const get = await call(route, 'GET', '/tavern/prompt?workspaceId=w1')
    const blocks = get.payload.blocks as Array<{ id: string; enabled: boolean }>
    expect(blocks.map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS].reverse())
    expect(blocks.find(block => block.id === 'examples')?.enabled).toBe(false)
  })

  it('persists edited prompt text over POST and serves it back', async () => {
    const { routes } = await tavern()
    const route = routes.get('/tavern/prompt')!
    const blocks = PROMPT_BLOCK_IDS.map(id => ({
      id,
      enabled: true,
      ...(id === 'main-template' ? { content: '你是雾都夜话的叙述者。' } : {}),
    }))
    const post = await call(route, 'POST', '/tavern/prompt', JSON.stringify({ workspaceId: 'w1', blocks }))
    expect(post.status).toBe(200)
    const written = (post.payload.blocks as Array<{ id: string; content: string; overridden: boolean }>)
      .find(item => item.id === 'main-template')
    expect(written?.content).toBe('你是雾都夜话的叙述者。')
    expect(written?.overridden).toBe(true)

    const get = await call(route, 'GET', '/tavern/prompt?workspaceId=w1')
    const read = (get.payload.blocks as Array<{ id: string; content: string; overridden: boolean }>)
      .find(item => item.id === 'main-template')
    expect(read?.content).toBe('你是雾都夜话的叙述者。')
    expect(read?.overridden).toBe(true)
  })

  it('resets over POST and rejects invalid bodies', async () => {
    const { routes } = await tavern()
    const route = routes.get('/tavern/prompt')!
    const reset = await call(route, 'POST', '/tavern/prompt', JSON.stringify({ workspaceId: 'w1', reset: true }))
    expect(reset.status).toBe(200)
    expect((reset.payload.blocks as Array<{ id: string }>).map(block => block.id)).toEqual([...PROMPT_BLOCK_IDS])

    const invalid = await call(route, 'POST', '/tavern/prompt', JSON.stringify({ workspaceId: 'w1', blocks: [{ id: 'nope', enabled: true }] }))
    expect(invalid.status).toBe(400)
    expect(invalid.payload.ok).toBe(false)

    const missing = await call(route, 'GET', '/tavern/prompt')
    expect(missing.status).toBe(400)
    expect(missing.payload.error).toContain('workspaceId')
  })

  it('rejects unsupported methods and cross-machine requests', async () => {
    const { routes } = await tavern()
    const route = routes.get('/tavern/prompt')!
    const notAllowed = await call(route, 'PUT', '/tavern/prompt?workspaceId=w1')
    expect(notAllowed.status).toBe(405)

    const response = fakeResponse()
    const req = fakeRequest('GET', '/tavern/prompt?workspaceId=w1')
    ;(req.socket as { remoteAddress: string }).remoteAddress = '10.0.0.7'
    await route.handler(req, response)
    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.body)).toMatchObject({ ok: false, error: 'forbidden' })
  })

  it('accepts a body larger than the generic route ceiling when the document allows it', async () => {
    // The prompt layout stores edited block text up to 512 KiB, so the route's
    // ceiling must follow the document rather than a plugin-wide default. Two
    // blocks of 40 KiB each stay under the per-block limit (64 KiB) while the
    // whole body exceeds the old 64 KiB route ceiling.
    const { routes } = await tavern()
    const route = routes.get('/tavern/prompt')!
    const tall = 'x'.repeat(40 * 1024)
    const blocks = PROMPT_BLOCK_IDS.map(id => ({
      id,
      enabled: true,
      ...(id === 'main-template' || id === 'user-persona' ? { content: tall } : {}),
    }))
    const post = await call(route, 'POST', '/tavern/prompt', JSON.stringify({ workspaceId: 'w1', blocks }))
    expect(post.status).toBe(200)
    expect(post.payload.ok).toBe(true)
  })

  it('answers 400 for a body that is not a JSON object', async () => {
    const { routes } = await tavern()
    const route = routes.get('/tavern/prompt')!
    const result = await call(route, 'POST', '/tavern/prompt', '[1,2,3]')
    expect(result.status).toBe(400)
    expect(result.payload.ok).toBe(false)
  })

  it('answers 413 for a body past the route ceiling instead of resetting the socket', async () => {
    const { routes } = await tavern()
    const route = routes.get('/tavern/prompt')!
    // The agent route keeps the 1 MiB default; this exceeds it.
    const agentRoute = routes.get('/tavern/agent')!
    const huge = JSON.stringify({ workspaceId: 'w1', config: { pad: 'x'.repeat(2 * 1024 * 1024) } })
    const result = await call(agentRoute, 'POST', '/tavern/agent', huge)
    expect(result.status).toBe(413)
    expect(result.payload.ok).toBe(false)
    // The route still answers afterwards: the request was drained, not severed.
    expect((await call(route, 'GET', '/tavern/prompt?workspaceId=w1')).status).toBe(200)
  })
})

describe('tavern preset auto-binding (D005)', () => {
  it('switches agents created inside a tavern workspace to the tavern preset', async () => {
    const root = await temporaryRoot()
    const directory = join(root, 'tavern')
    await mkdir(directory, { recursive: true })
    await ensureMarker(directory, 'test')
    const outside = join(root, 'plain')
    await mkdir(outside, { recursive: true })
    const chosen: string[] = []
    const { ctx } = await mount(
      [{ id: 'w1', path: directory, title: 'test' }, { id: 'w2', path: outside, title: 'plain' }],
      true,
      { select: async (_agent: unknown, preset: string) => { chosen.push(preset); return preset } },
    )
    const createAgent = (cwd: string, preset: string) => ({
      session: { id: `s-${cwd}`, header: { cwd, agentPreset: preset } },
      ctx: ctx.extend(),
    })
    await (ctx as unknown as { serial(event: string, payload: unknown): Promise<unknown> })
      .serial('agent/created', { agent: createAgent(directory, 'standard') })
    await (ctx as unknown as { serial(event: string, payload: unknown): Promise<unknown> })
      .serial('agent/created', { agent: createAgent(outside, 'standard') })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(chosen).toEqual(['tavern-rp'])
  })

  it('binds novel-mode workspaces to the novel preset', async () => {
    const root = await temporaryRoot()
    const directory = join(root, 'novel')
    await mkdir(directory, { recursive: true })
    await ensureMarker(directory, 'novel', { mode: 'novel' })
    const chosen: string[] = []
    const { ctx } = await mount(
      [{ id: 'w1', path: directory, title: 'novel' }],
      true,
      { select: async (_agent: unknown, preset: string) => { chosen.push(preset); return preset } },
    )
    const agent = {
      session: { id: 's-novel', header: { cwd: directory, agentPreset: 'standard' } },
      ctx: ctx.extend(),
    }
    await (ctx as unknown as { serial(event: string, payload: unknown): Promise<unknown> })
      .serial('agent/created', { agent })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(chosen).toEqual(['tavern-novel'])
  })
})

describe('workspace prompt assembly (D005)', () => {
  it('renders only the owning tavern workspace prompt and follows its edits', async () => {
    const root = await temporaryRoot()
    const directory = join(root, 'tavern')
    await mkdir(directory, { recursive: true })
    await ensureMarker(directory, 'test')
    const outside = join(root, 'plain')
    await mkdir(outside, { recursive: true })
    const { service } = await mount([{ id: 'w1', path: directory, title: 'test' }])

    const text = await service.assemblePromptText(directory)
    expect(text).toContain('你正在进行一场角色扮演对话')
    expect(text).toContain('你 是一个普通旅人')
    expect(text).toContain('不要跳出角色')
    expect(await service.assemblePromptText(outside)).toBeUndefined()
    // D004: a subdirectory is not a tavern session, so it gets no workspace prompt.
    expect(await service.assemblePromptText(join(directory, 'characters'))).toBeUndefined()

    const blocks = PROMPT_BLOCK_IDS.map(id => ({ id, enabled: id !== 'user-persona' }))
    await service.savePromptLayout('w1', { blocks })
    const updated = await service.assemblePromptText(directory)
    expect(updated).not.toContain('你 是一个普通旅人')
    expect(updated).toContain('不要跳出角色')
  })
})

describe('tavern request cleaning (B-lite)', () => {
  async function tavernAgent(): Promise<{
    ctx: Context
    agentCtx: Context
    agent: { session: { id: string; header: { cwd: string; agentPreset: string } } }
    directory: string
  }> {
    const root = await temporaryRoot()
    const directory = join(root, 'tavern')
    await mkdir(directory, { recursive: true })
    await ensureMarker(directory, 'test')
    const { ctx } = await mount([{ id: 'w1', path: directory, title: 'test' }])
    ctx.provide('systemPrompt', {
      section: () => () => {},
      suppressRuntimeContext: () => () => {},
    } as never)
    const agentCtx = ctx.extend()
    const agent = {
      session: { id: 's-clean', header: { cwd: directory, agentPreset: 'tavern-rp' } },
      ctx: agentCtx,
    }
    await (ctx as unknown as { serial(event: string, payload: unknown): Promise<unknown> })
      .serial('agent/created', { agent })
    await new Promise(resolve => setTimeout(resolve, 20))
    return { ctx, agentCtx, agent, directory }
  }

  it('drops tool schemas and non-working-directory contexts at assembly', async () => {
    const { ctx, agent } = await tavernAgent()
    const assembly = {
      sections: [],
      contexts: [
        { name: 'working-directory:current', text: 'cwd' },
        { name: 'team:identity', text: 'You are the Team Lead named "lead".' },
      ],
      tools: [{ name: 'spawn_teammate' }],
      variables: {},
    }
    const result = await (ctx as unknown as {
      waterfall(event: string, assembly: unknown, context: unknown, next: unknown): Promise<typeof assembly>
    }).waterfall('system-prompt/assemble', assembly, { agent }, async () => assembly)
    expect(result.tools).toEqual([])
    expect(result.contexts.map(entry => entry.name)).toEqual(['working-directory:current'])
  })

  it('rewrites the runtime context and filters <system-reminder> messages at pre-step', async () => {
    const { agentCtx, directory } = await tavernAgent()
    const decision = {
      kind: 'enter' as const,
      messages: [
        {
          role: 'user',
          content: [{
            type: 'text',
            text: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n'
              + 'Current working directory: "X".\n\nYou are the Team Lead named "lead".',
          }],
        },
        { role: 'user', content: [{ type: 'text', text: '<system-reminder>skills changed</system-reminder>' }] },
        { role: 'user', content: [{ type: 'text', text: '你好' }] },
      ],
    }
    const result = await (agentCtx as unknown as {
      waterfall(event: string, payload: unknown, next: unknown): Promise<typeof decision>
    }).waterfall('agent/pre-step', { messages: [], turn: 1, step: 1 }, async () => decision)
    expect(result.kind).toBe('enter')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0]?.content[0]?.text).toBe(`Current working directory: ${JSON.stringify(directory)}.`)
    expect(result.messages[1]?.content[0]?.text).toBe('你好')
  })

  it('records the frozen final request of a loop-built turn without mutating it', async () => {
    const { ctx, directory } = await tavernAgent()
    const options = markAgentLoopRequest({
      provider: 'fake',
      model: 'fake',
      sessionId: 's-clean',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'OUR PROMPT' }] },
        { role: 'user', content: [{ type: 'text', text: '你好' }] },
      ],
      tools: [],
    })
    const next = (): AsyncIterable<never> => (async function* () {})()
    await (ctx as unknown as {
      waterfall(event: string, payload: unknown, next: unknown): Promise<unknown>
    }).waterfall('llm/stream', options, next)
    await new Promise(resolve => setTimeout(resolve, 30))
    const recorded = JSON.parse(await readFile(join(directory, '.dshtavern', 'state', 'last-request.json'), 'utf8')) as {
      system: string
      tools: unknown[]
      messages: unknown[]
    }
    expect(recorded.system).toBe('OUR PROMPT')
    expect(recorded.tools).toEqual([])
    expect(recorded.messages).toHaveLength(2)
    expect(options.messages[0]?.content[0]?.text).toBe('OUR PROMPT')
  })

  it('leaves a hand-built auxiliary call alone instead of orchestrating it', async () => {
    const { ctx } = await tavernAgent()
    const options = {
      provider: 'fake',
      model: 'fake',
      sessionId: 's-aux',
      messages: [{ role: 'user', content: [{ type: 'text', text: '内部调用' }] }],
    }
    let reached = false
    const next = (): AsyncIterable<never> => (async function* () { reached = true })()
    const result = await (ctx as unknown as {
      waterfall(event: string, payload: unknown, next: unknown): Promise<AsyncIterable<never>>
    }).waterfall('llm/stream', options, next)
    for await (const _chunk of result) { void _chunk }
    expect(reached).toBe(true)
  })

  it('reads the player utterance past harness-injected user messages', () => {
    const options = {
      provider: 'fake',
      model: 'fake',
      messages: [
        { role: 'user', content: [{ type: 'text', text: '我推开门。' }] },
        { role: 'user', content: [{ type: 'text', text: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\nCurrent working directory: "C:\\tavern".' }] },
      ],
    }
    expect(lastUserText(options as never)).toBe('我推开门。')
  })

  it('leaves non-tavern sessions untouched', async () => {
    const { ctx } = await mount([{ id: 'w1', path: 'C:/elsewhere', title: 'plain' }])
    const options = {
      provider: 'fake',
      model: 'fake',
      messages: [{ role: 'system', content: [{ type: 'text', text: 'KEEP' }] }],
      tools: [{ name: 'keep' }],
    }
    const next = (): AsyncIterable<never> => (async function* () {})()
    await (ctx as unknown as {
      waterfall(event: string, payload: unknown, next: unknown): Promise<unknown>
    }).waterfall('llm/stream', options, next)
    expect(options.messages[0]?.content[0]?.text).toBe('KEEP')
    expect(options.tools).toEqual([{ name: 'keep' }])
  })
})
