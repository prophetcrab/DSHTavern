/**
 * Write-path functional test for a running `dsh web` with DSHTavern loaded.
 *
 * Creates a dedicated tavern named `dshtavern-selftest`, exercises every write
 * route against it, and leaves it registered so the browser pass can drive the
 * same workspace. Re-running reuses the tavern and replaces its content, so the
 * script is idempotent.
 *
 * Run: node scripts/selftest-write.mjs [--base http://127.0.0.1:3082] [--keep]
 */
import process from 'node:process'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const base = option('--base', 'http://127.0.0.1:3082')
const TITLE = 'dshtavern-selftest'

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

async function get(route) {
  const response = await fetch(`${base}${route}`, { headers: { accept: 'application/json' } })
  return { status: response.status, payload: await response.json() }
}

async function post(route, body) {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, payload: await response.json() }
}

// --- create ------------------------------------------------------------------
const state = await get('/tavern/state')
const existing = (state.payload.taverns ?? []).find(entry => entry.title === TITLE)
const created = existing === undefined
  ? await post('/tavern/create', { title: TITLE, mode: 'rp' })
  : { status: 200, payload: { ok: true, tavern: existing } }
check('tavern created or reused', created.status === 200 && created.payload.ok === true,
  `status ${created.status} ${JSON.stringify(created.payload).slice(0, 200)}`)
const tavern = created.payload.tavern
if (tavern === undefined) {
  console.error('no tavern; aborting')
  process.exit(2)
}
const id = tavern.workspaceId
const workspaceId = encodeURIComponent(id)
console.log(`\ntavern: ${tavern.title} (${id}) ${existing === undefined ? '[created]' : '[reused]'}`)
console.log(`path: ${tavern.path}\n`)

const afterCreate = await get('/tavern/state')
check('created tavern appears in the registry', (afterCreate.payload.taverns ?? []).some(t => t.workspaceId === id))
check('created tavern reports its mode', tavern.marker?.mode === 'rp', String(tavern.marker?.mode))

const duplicateCreate = await post('/tavern/create', { title: TITLE, mode: 'rp' })
check('creating the same title twice reuses the marker', duplicateCreate.status === 200
  && duplicateCreate.payload.tavern?.workspaceId === id,
  JSON.stringify(duplicateCreate.payload).slice(0, 200))

const novelRejected = await post('/tavern/create', { title: 'x', mode: 'bogus' })
check('unknown mode is rejected', novelRejected.status === 400, `status ${novelRejected.status}`)

const relativePath = await post('/tavern/create', { title: 'x', path: 'relative/dir' })
check('relative tavern directory is rejected', relativePath.status === 400, `status ${relativePath.status}`)

// --- character cards ---------------------------------------------------------
const cleared = await get(`/tavern/characters?workspaceId=${workspaceId}`)
for (const card of cleared.payload.cards ?? []) {
  await post('/tavern/characters', { workspaceId: id, action: 'delete', id: card.id })
}

const aurora = await post('/tavern/characters', {
  workspaceId: id,
  action: 'create',
  card: {
    name: '极光',
    description: '守夜人，总把围巾绕两圈',
    personality: '话少，先看窗外再说',
    scenario: '灯塔顶层，风把窗吹得直响',
    systemPrompt: '',
    exampleDialogues: '',
    greetings: { first: '灯已经点上了。', alternates: [] },
    tags: ['原创', '测试'],
  },
})
check('card created', aurora.status === 200 && aurora.payload.ok === true, `status ${aurora.status}`)
const auroraId = aurora.payload.card?.id
check('card id has the expected shape', typeof auroraId === 'string' && /^[A-Za-z0-9-]{8,}$/.test(auroraId ?? ''), String(auroraId))

const second = await post('/tavern/characters', {
  workspaceId: id,
  action: 'create',
  card: {
    name: '白鹭',
    description: '灯塔的修灯工',
    personality: '爱打听',
    scenario: '',
    greetings: { first: '你也是来看灯的吗？', alternates: [] },
    tags: [],
  },
})
check('second card created', second.status === 200 && second.payload.ok === true, `status ${second.status}`)

const listed = await get(`/tavern/characters?workspaceId=${workspaceId}`)
check('card list contains both cards', (listed.payload.cards ?? []).length === 2,
  `got ${(listed.payload.cards ?? []).length}`)
check('card list is newest first', listed.payload.cards?.[0]?.name === '白鹭',
  listed.payload.cards?.[0]?.name)

const saved = await post('/tavern/characters', {
  workspaceId: id,
  action: 'save',
  id: auroraId,
  card: {
    name: '极光',
    description: '守夜人，总把围巾绕两圈',
    personality: '话少，先看窗外再说',
    scenario: '灯塔顶层，风把窗吹得直响',
    greetings: { first: '灯已经点上了。', alternates: [] },
    tags: ['原创', '已改'],
  },
})
check('card saved', saved.status === 200 && saved.payload.card?.tags?.includes('已改'),
  JSON.stringify(saved.payload.card?.tags))

const nameless = await post('/tavern/characters', { workspaceId: id, action: 'create', card: { name: '  ' } })
check('nameless card is rejected', nameless.status === 400, `status ${nameless.status}`)

const badAction = await post('/tavern/characters', { workspaceId: id, action: 'explode' })
check('unknown card action is rejected', badAction.status === 400, `status ${badAction.status}`)

// --- card transfer -----------------------------------------------------------
const exported = await get(`/tavern/characters/transfer?workspaceId=${workspaceId}&id=${encodeURIComponent(auroraId)}`)
check('card export ok', exported.status === 200 && exported.payload.ok === true, `status ${exported.status}`)
check('card export suggests a .charc file', String(exported.payload.file).endsWith('.charc'), String(exported.payload.file))
check('card export carries the card json', String(exported.payload.text).includes('dshtavern.character'))
const imported = await post('/tavern/characters/transfer', { workspaceId: id, text: exported.payload.text })
check('card import ok', imported.status === 200 && imported.payload.ok === true, `status ${imported.status}`)
check('card import mints a new id', imported.payload.card?.id !== auroraId,
  `${imported.payload.card?.id} vs ${auroraId}`)
const afterImport = await get(`/tavern/characters?workspaceId=${workspaceId}`)
check('import added a third card', (afterImport.payload.cards ?? []).length === 3,
  `got ${(afterImport.payload.cards ?? []).length}`)
const garbage = await post('/tavern/characters/transfer', { workspaceId: id, text: '{not json' })
check('card import rejects garbage', garbage.status === 400, `status ${garbage.status}`)

// Delete the imported copy so later assertions count two cards.
await post('/tavern/characters', { workspaceId: id, action: 'delete', id: imported.payload.card?.id })

// --- worldbook ---------------------------------------------------------------
const entries = [
  {
    id: 'wb-constant', name: '世界底线', content: '灯必须整夜亮着。', keys: [], secondaryKeys: [],
    logic: 'and_any', constant: true, position: 'before', order: 1, depth: 0,
    enabled: true, caseSensitive: false, wholeWords: false, audience: 'all',
  },
  {
    id: 'wb-tail', name: '守夜规矩', content: '午夜后不许开窗。', keys: ['午夜'], secondaryKeys: [],
    logic: 'and_any', constant: false, position: 'tail', order: 10, depth: 6,
    enabled: true, caseSensitive: false, wholeWords: false, audience: 'all',
  },
  {
    id: 'wb-director', name: '导演须知', content: '三年前灯塔熄灭过一夜。', keys: ['灯'], secondaryKeys: [],
    logic: 'and_any', constant: true, position: 'after', order: 20, depth: 0,
    enabled: true, caseSensitive: false, wholeWords: false, audience: 'director',
  },
]
const written = await post('/tavern/worldbook', { workspaceId: id, entries })
check('worldbook written', written.status === 200 && written.payload.ok === true, `status ${written.status}`)
check('worldbook keeps all three entries', (written.payload.entries ?? []).length === 3,
  `got ${(written.payload.entries ?? []).length}`)
check('worldbook keeps the tail position', written.payload.entries?.some(e => e.position === 'tail'))
check('worldbook keeps the director audience', written.payload.entries?.some(e => e.audience === 'director'))

const badLogic = await post('/tavern/worldbook', {
  workspaceId: id,
  entries: [{ name: 'x', content: 'y', logic: 'nope' }],
})
check('unknown secondary logic falls back instead of failing', badLogic.status === 200
  && badLogic.payload.entries?.[0]?.logic === 'and_any',
  JSON.stringify(badLogic.payload.entries?.[0]))

const notArray = await post('/tavern/worldbook', { workspaceId: id, entries: { nope: true } })
check('non-array worldbook is rejected', notArray.status === 400, `status ${notArray.status}`)

// `saveWorldbook` replaces the whole book, and the rejection cases above were
// valid payloads, so restore the intended book before testing transfer.
await post('/tavern/worldbook', { workspaceId: id, entries })

const exportedBook = await get(`/tavern/worldbook/transfer?workspaceId=${workspaceId}`)
check('worldbook export ok', exportedBook.status === 200 && exportedBook.payload.ok === true,
  `status ${exportedBook.status}`)
check('worldbook export suggests a .world file', String(exportedBook.payload.file).endsWith('.world'),
  String(exportedBook.payload.file))
check('worldbook export carries the envelope kind', String(exportedBook.payload.text).includes('dshtavern.worldbook'))
check('worldbook export carries every entry', (() => {
  try {
    return JSON.parse(String(exportedBook.payload.text)).entries.length === 3
  } catch {
    return false
  }
})(), String(exportedBook.payload.text).slice(0, 120))
const reimported = await post('/tavern/worldbook/transfer', { workspaceId: id, text: exportedBook.payload.text })
check('worldbook reimport ok', reimported.status === 200 && (reimported.payload.entries ?? []).length === 3,
  `got ${(reimported.payload.entries ?? []).length}`)
const bareArray = await post('/tavern/worldbook/transfer', {
  workspaceId: id,
  text: JSON.stringify([{ name: '手写条目', content: '直接写数组。', keys: ['手写'] }]),
})
check('worldbook accepts a bare entry array', bareArray.status === 200 && bareArray.payload.entries?.[0]?.name === '手写条目',
  JSON.stringify(bareArray.payload.entries?.[0]?.name))
const wrongKind = await post('/tavern/worldbook/transfer', {
  workspaceId: id,
  text: JSON.stringify({ kind: 'something.else', entries: [] }),
})
check('worldbook rejects a foreign envelope', wrongKind.status === 400, `status ${wrongKind.status}`)

// Restore the three-entry book for the rest of the run.
await post('/tavern/worldbook', { workspaceId: id, entries })

// --- prompt layouts ----------------------------------------------------------
const characterLayout = await get(`/tavern/prompt?workspaceId=${workspaceId}&scope=character`)
const characterIds = (characterLayout.payload.blocks ?? []).map(block => block.id)
check('fresh tavern starts from the catalogue default', characterIds.length === 15, `got ${characterIds.length}`)

const reversed = [...characterIds].reverse().map((blockId, index) => ({ id: blockId, enabled: index % 3 !== 0 }))
const persisted = await post('/tavern/prompt', { workspaceId: id, scope: 'character', blocks: reversed })
check('layout order persisted', persisted.status === 200
  && JSON.stringify(persisted.payload.blocks?.map(b => b.id)) === JSON.stringify([...characterIds].reverse()),
  `status ${persisted.status}`)
check('layout enabled flags persisted', persisted.payload.blocks?.[0]?.enabled === false,
  String(persisted.payload.blocks?.[0]?.enabled))

const editedText = '你是灯塔的守夜人，只写你看见的东西。'
const withText = await post('/tavern/prompt', {
  workspaceId: id,
  scope: 'character',
  blocks: [...characterIds].reverse().map(blockId => ({
    id: blockId,
    enabled: true,
    ...(blockId === 'main-template' ? { content: editedText } : {}),
  })),
})
const mainBlock = withText.payload.blocks?.find(block => block.id === 'main-template')
check('block text override stored', mainBlock?.content === editedText, String(mainBlock?.content))
check('block override is flagged', mainBlock?.overridden === true, String(mainBlock?.overridden))

const reset = await post('/tavern/prompt', { workspaceId: id, scope: 'character', reset: true })
check('layout reset restores the catalogue order', reset.status === 200
  && reset.payload.blocks?.length === 15
  && reset.payload.blocks?.[0]?.id === 'main-template',
  `${reset.payload.blocks?.[0]?.id} / ${reset.payload.blocks?.length}`)
check('reset dropped the text override', reset.payload.blocks?.[0]?.overridden === false)

const badBlock = await post('/tavern/prompt', {
  workspaceId: id, scope: 'character', blocks: [{ id: 'nope', enabled: true }],
})
check('unknown block id is rejected', badBlock.status === 400, `status ${badBlock.status}`)

const wrongScopeBlock = await post('/tavern/prompt', {
  workspaceId: id, scope: 'director', blocks: characterIds.map(blockId => ({ id: blockId, enabled: true })),
})
check('character ids in a director layout are rejected', wrongScopeBlock.status === 400,
  `status ${wrongScopeBlock.status}`)

const directorReset = await post('/tavern/prompt', { workspaceId: id, scope: 'director', reset: true })
check('director layout has 8 blocks', directorReset.payload.blocks?.length === 8,
  `got ${directorReset.payload.blocks?.length}`)

// --- agent config ------------------------------------------------------------
// A reused tavern keeps whatever a previous run (or a UI session) stored, so
// reset first to make the default-state assertion mean something.
await post('/tavern/agent', { workspaceId: id, reset: true })
const agentView = await get(`/tavern/agent?workspaceId=${workspaceId}`)
check('reset tavern reports default agent config', agentView.payload.status === 'default', String(agentView.payload.status))

const tuned = {
  ...agentView.payload.config,
  maxSpeechesPerBeat: 2,
  stageWindow: 200,
  loreScanLines: 60,
  loreMaxEntries: 24,
  loreMaxChars: 40000,
  playerInputMax: 20000,
  rotateSpeakers: false,
  honorPlayerMention: true,
  unknownSpeaker: 'first',
  maxReplyChars: 240,
  reasoningReserveTokens: 512,
}
const savedAgent = await post('/tavern/agent', { workspaceId: id, config: tuned })
check('agent config saved', savedAgent.status === 200 && savedAgent.payload.config?.maxSpeechesPerBeat === 2,
  JSON.stringify(savedAgent.payload.config?.maxSpeechesPerBeat))
const readBack = await get(`/tavern/agent?workspaceId=${workspaceId}`)
check('agent config reads back', readBack.payload.status === 'stored'
  && readBack.payload.config?.rotateSpeakers === false
  && readBack.payload.config?.honorPlayerMention === true
  && readBack.payload.config?.unknownSpeaker === 'first')

const outOfRange = await post('/tavern/agent', {
  workspaceId: id,
  config: { ...tuned, stageWindow: 999999 },
})
check('out-of-range agent value is rejected', outOfRange.status === 400, `status ${outOfRange.status}`)

const halfModel = await post('/tavern/agent', {
  workspaceId: id,
  config: { ...tuned, directorModel: { provider: 'x' } },
})
check('half-filled model choice is rejected', halfModel.status === 400, `status ${halfModel.status}`)

const agentReset = await post('/tavern/agent', { workspaceId: id, reset: true })
check('agent config reset', agentReset.status === 200 && agentReset.payload.config?.maxSpeechesPerBeat === 3,
  String(agentReset.payload.config?.maxSpeechesPerBeat))

// --- preview against the written workspace -----------------------------------
const preview = await get(
  `/tavern/preview?workspaceId=${workspaceId}&scope=character&cardId=${encodeURIComponent(auroraId)}&sample=${encodeURIComponent('午夜了，我想开窗')}`,
)
check('preview ok for the test tavern', preview.status === 200 && preview.payload.ok === true, `status ${preview.status}`)
const previewSystem = preview.payload.system ?? ''
check('preview includes the card description', previewSystem.includes('守夜人'), 'card description missing')
check('preview includes constant lore', previewSystem.includes('灯必须整夜亮着'), 'constant entry missing')
check('preview activates the tail lore on the sample', previewSystem.includes('午夜后不许开窗'), 'tail entry missing')
check('preview keeps director-only lore out of the character prompt',
  !previewSystem.includes('三年前灯塔熄灭过一夜'), 'director entry leaked')
const loreNames = (preview.payload.lore ?? []).map(hit => hit.name)
check('preview lists the tail entry as a hit', loreNames.includes('守夜规矩'), loreNames.join(','))
check('preview reports the lore chars', (preview.payload.loreChars ?? 0) > 0, String(preview.payload.loreChars))

const directorPreview = await get(
  `/tavern/preview?workspaceId=${workspaceId}&scope=director&sample=${encodeURIComponent('灯灭了一下')}`,
)
const directorSystem = directorPreview.payload.system ?? ''
check('director preview includes director-only lore', directorSystem.includes('三年前灯塔熄灭过一夜'))
check('director preview includes the cast roster with briefs', directorSystem.includes('守夜人'))
check('director preview keeps the format contract last', /nextSpeaker/.test(directorSystem.trimEnd().slice(-200)))

// --- untag -------------------------------------------------------------------
// The route is one-way: a workspace leaves the tavern list and a new tavern has
// to be created to bring it back. The script re-creates it below so the run can
// be repeated.
const untagged = await post('/tavern/untag', { workspaceId: id })
check('untag removes the marker', untagged.status === 200 && untagged.payload.removed === true,
  JSON.stringify(untagged.payload))
const afterUntag = await get('/tavern/state')
check('untagged workspace leaves the tavern list',
  !(afterUntag.payload.taverns ?? []).some(t => t.workspaceId === id))
const afterUntagPrompt = await get(`/tavern/prompt?workspaceId=${workspaceId}`)
check('untagged workspace refuses tavern routes', afterUntagPrompt.status === 400, `status ${afterUntagPrompt.status}`)
const adoptGone = await post('/tavern/adopt', { workspaceId: id })
check('the adopt route is gone', adoptGone.status === 404, `status ${adoptGone.status}`)
const recreated = await post('/tavern/create', { title: TITLE, mode: 'rp' })
check('creating it again restores the marker', recreated.status === 200
  && recreated.payload.tavern?.marker?.kind === 'dshtavern', `status ${recreated.status}`)
const restoredId = recreated.payload.tavern?.workspaceId
const restored = await get(`/tavern/prompt?workspaceId=${encodeURIComponent(restoredId ?? '')}`)
check('re-created tavern serves tavern routes again', restored.status === 200 && restored.payload.ok === true)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nfailures:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
console.log(`\nworkspaceId for the browser pass: ${id}`)
