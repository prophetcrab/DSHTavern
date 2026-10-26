/**
 * Loopback route self-test for a running `dsh web` with DSHTavern loaded.
 *
 * Read-only against the tavern named by `--tavern` (default 长夜环线), plus the
 * error paths every route shares. Writes are exercised by selftest-write.mjs so
 * this script can run against a real tavern without changing it.
 *
 * Run: node scripts/selftest-http.mjs [--base http://127.0.0.1:3082] [--tavern 长夜环线]
 */
import process from 'node:process'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const base = option('--base', 'http://127.0.0.1:3082')
const wanted = option('--tavern', '长夜环线')

let passed = 0
let failed = 0
const failures = []

function check(label, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`  ok   ${label}`)
    return
  }
  failed += 1
  failures.push(`${label}${detail === undefined ? '' : ` — ${detail}`}`)
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

async function request(method, route, body, headers = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { accept: 'application/json', ...headers },
    ...(body === undefined ? {} : { body }),
  })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { raw: text.slice(0, 200) }
  }
  return { status: response.status, payload }
}

async function get(route, headers) {
  return request('GET', route, undefined, headers)
}

async function post(route, body, headers) {
  return request('POST', route, JSON.stringify(body), { 'content-type': 'application/json', ...headers })
}

const state = await get('/tavern/state')
check('GET /tavern/state returns ok', state.status === 200 && state.payload.ok === true, `status ${state.status}`)
const tavern = (state.payload.taverns ?? []).find(entry => entry.title === wanted)
if (tavern === undefined) {
  console.error(`tavern '${wanted}' not found; available: ${(state.payload.taverns ?? []).map(t => t.title).join(', ')}`)
  process.exit(2)
}
const id = encodeURIComponent(tavern.workspaceId)
console.log(`\ntavern: ${tavern.title} (${tavern.workspaceId})\npath: ${tavern.path}\n`)

// --- character prompt layout -------------------------------------------------
const character = await get(`/tavern/prompt?workspaceId=${id}&scope=character`)
check('GET character layout ok', character.status === 200 && character.payload.ok === true, `status ${character.status}`)
const characterBlocks = character.payload.blocks ?? []
check('character layout exposes 13 blocks', characterBlocks.length === 13, `got ${characterBlocks.length}`)
check('character layout ids are unique', new Set(characterBlocks.map(b => b.id)).size === characterBlocks.length)
for (const added of ['worldbook', 'character-stage', 'character-duty']) {
  check(`character layout gained '${added}'`, characterBlocks.some(b => b.id === added))
  const block = characterBlocks.find(b => b.id === added)
  check(`'${added}' is enabled by migration`, block?.enabled === true)
}
check('legacy layout lost no block', characterBlocks.every(b => typeof b.id === 'string' && b.id.length > 0))
const order = characterBlocks.map(b => b.id)
check(
  'migration kept main-template before post-history',
  order.indexOf('main-template') < order.indexOf('post-history'),
  order.join(','),
)
check('character layout reports the saved timestamp', typeof character.payload.savedAt === 'string')
check('character layout reports character cards', character.payload.hasCharacterCard === true)

// --- director prompt layout --------------------------------------------------
const director = await get(`/tavern/prompt?workspaceId=${id}&scope=director`)
check('GET director layout ok', director.status === 200 && director.payload.ok === true, `status ${director.status}`)
const directorBlocks = director.payload.blocks ?? []
check('director layout exposes 8 blocks', directorBlocks.length === 8, `got ${directorBlocks.length}`)
check('director layout gained director-lore', directorBlocks.some(b => b.id === 'director-lore'))
check('director layout keeps director-format', directorBlocks.some(b => b.id === 'director-format'))

// --- cards / worldbook / agent / models --------------------------------------
const cards = await get(`/tavern/characters?workspaceId=${id}`)
check('GET characters ok', cards.status === 200 && cards.payload.ok === true, `status ${cards.status}`)
check('characters lists the sample cast', (cards.payload.cards ?? []).length >= 1,
  `got ${(cards.payload.cards ?? []).length}`)
check('characters reports no unreadable file', (cards.payload.problems ?? []).length === 0,
  JSON.stringify(cards.payload.problems))

const book = await get(`/tavern/worldbook?workspaceId=${id}`)
check('GET worldbook ok', book.status === 200 && book.payload.ok === true, `status ${book.status}`)
check('worldbook has entries', (book.payload.entries ?? []).length > 0, `got ${(book.payload.entries ?? []).length}`)
check('worldbook entries carry an audience', (book.payload.entries ?? []).every(e => e.audience === 'all' || e.audience === 'director'))

const agent = await get(`/tavern/agent?workspaceId=${id}`)
check('GET agent ok', agent.status === 200 && agent.payload.ok === true, `status ${agent.status}`)
check('agent returns stored config and bounds', typeof agent.payload.config === 'object' && typeof agent.payload.defaults === 'object')
check('agent bounds include the 1M-window ceiling', agent.payload.defaults?.loreMaxChars >= 6000)

const models = await get('/tavern/models')
check('GET models ok', models.status === 200 && models.payload.ok === true, `status ${models.status}`)
check('models lists at least one provider', (models.payload.providers ?? []).length >= 1)

// --- preview -----------------------------------------------------------------
const cardId = (cards.payload.cards ?? [])[0]?.id
if (cardId === undefined) {
  check('preview skipped: no card', false)
} else {
  const preview = await get(
    `/tavern/preview?workspaceId=${id}&scope=character&cardId=${encodeURIComponent(cardId)}&sample=${encodeURIComponent('我看向那张票根')}`,
  )
  check('GET character preview ok', preview.status === 200 && preview.payload.ok === true, `status ${preview.status}`)
  const system = preview.payload.system ?? ''
  check('character preview carries the card description', system.length > 200, `${system.length} chars`)
  check('character preview no longer ends with a hardcoded duty block',
    !system.includes('# 你的职责') || system.includes('你现在就是'),
    'duty must come from the layout catalogue')
  check('character preview reports lore hits', Array.isArray(preview.payload.lore))
  check('character preview reports the lore char count', typeof preview.payload.loreChars === 'number')
  check('character preview names the rendered card', typeof preview.payload.cardName === 'string')

  const directorPreview = await get(
    `/tavern/preview?workspaceId=${id}&scope=director&sample=${encodeURIComponent('我看向那张票根')}`,
  )
  check('GET director preview ok', directorPreview.status === 200 && directorPreview.payload.ok === true,
    `status ${directorPreview.status}`)
  const directorSystem = directorPreview.payload.system ?? ''
  check('director preview keeps the output contract last', /nextSpeaker/.test(directorSystem.trimEnd().slice(-200)),
    directorSystem.slice(-80))
  check('director preview roster uses real card briefs',
    !directorSystem.includes('（预览）'),
    'roster still shows the placeholder brief')

  // The world state lives per chat, so the preview only reflects it when given
  // a session id. Prove the plumbing without requiring a story on disk.
  const withSession = await get(
    `/tavern/preview?workspaceId=${id}&scope=director&sessionId=selftest-session&sample=x`,
  )
  check('director preview accepts a session id', withSession.status === 200 && withSession.payload.ok === true,
    `status ${withSession.status}`)
}

// --- stats -------------------------------------------------------------------
const ping = await get('/tavern-stats/ping')
check('GET /tavern-stats/ping ok', ping.status === 200 && ping.payload.ok === true, `status ${ping.status}`)
const stats = await get(`/tavern-stats/state?workspaceId=${id}`)
check('GET /tavern-stats/state ok', stats.status === 200 && stats.payload.ok === true, `status ${stats.status}`)
check('stats reports the schema', stats.payload.schema === 1)
check('stats reports projection availability', typeof stats.payload.projectionsAvailable === 'boolean')
check('stats totals are numeric', typeof stats.payload.totals?.totalTokens === 'number')

// --- image generation -------------------------------------------------------
const imagePing = await get('/tavern-image/ping')
check('GET /tavern-image/ping ok', imagePing.status === 200 && imagePing.payload.ok === true, `status ${imagePing.status}`)
const imageConfig = await get(`/tavern-image/config?workspaceId=${id}`)
check('GET /tavern-image/config ok', imageConfig.status === 200 && imageConfig.payload.ok === true,
  `status ${imageConfig.status}`)
check('image generation is off by default', imageConfig.payload.config?.enabled === false)

// --- error paths -------------------------------------------------------------
const crossSite = await get(`/tavern/state`, { 'sec-fetch-site': 'cross-site' })
check('cross-site request is rejected', crossSite.status === 403, `status ${crossSite.status}`)

const wrongMethod = await request('PUT', `/tavern/prompt?workspaceId=${id}`)
check('unsupported method is 405', wrongMethod.status === 405, `status ${wrongMethod.status}`)

const missingId = await get('/tavern/prompt')
check('missing workspaceId is 400', missingId.status === 400, `status ${missingId.status}`)

const unknown = await get('/tavern/prompt?workspaceId=does-not-exist')
check('unknown workspace is 404', unknown.status === 404, `status ${unknown.status}`)

const badJson = await request('POST', '/tavern/prompt', '[1,2,3]', { 'content-type': 'application/json' })
check('non-object JSON body is 400', badJson.status === 400, `status ${badJson.status}`)

const badScope = await get(`/tavern/prompt?workspaceId=${id}&scope=nope`)
check('unknown query scope falls back to character', badScope.status === 200 && badScope.payload.scope === 'character')

const emptyBody = await request('POST', '/tavern/adopt', '{}', { 'content-type': 'application/json' })
check('adopt without workspaceId is 400', emptyBody.status === 400, `status ${emptyBody.status}`)

const tooLarge = await request(
  'POST',
  '/tavern/agent',
  JSON.stringify({ workspaceId: tavern.workspaceId, config: { pad: 'x'.repeat(2 * 1024 * 1024) } }),
  { 'content-type': 'application/json' },
)
check('oversized body is 413', tooLarge.status === 413, `status ${tooLarge.status}`)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nfailures:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
