/**
 * Install the 长夜环线 role-play project into a running `dsh web`.
 *
 * The script talks to the DSHTavern loopback routes only: it creates the tavern
 * workspace, imports the cast, replaces the worldbook, and writes both prompt
 * layouts (character + director). Re-running it against the same server reuses
 * the existing tavern whose title matches, so the cast and lore are replaced
 * instead of duplicated where the API allows it.
 *
 * Run: node samples/projects/changye-huanxian/install.mjs [--base http://127.0.0.1:3080]
 */
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const project = JSON.parse(fs.readFileSync(path.join(HERE, 'project.json'), 'utf8'))

const baseIndex = process.argv.indexOf('--base')
const base = baseIndex === -1 ? 'http://127.0.0.1:3080' : process.argv[baseIndex + 1]

async function call(method, route, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json()
  if (payload.ok !== true) throw new Error(`${route} failed: ${JSON.stringify(payload)}`)
  return payload
}

async function main() {
  const state = await call('GET', '/tavern/state')
  const existing = state.taverns.find(tavern => tavern.title === project.title)
  const tavern = existing ?? (await call('POST', '/tavern/create', {
    title: project.title,
    mode: project.mode,
  })).tavern
  const workspaceId = tavern.workspaceId
  console.log(`workspace: ${existing === undefined ? 'created' : 'reused'} ${project.title} (${workspaceId})`)
  console.log(`path: ${tavern.path}`)

  const previous = await call('GET', `/tavern/characters?workspaceId=${encodeURIComponent(workspaceId)}`)
  for (const card of previous.cards ?? []) {
    await call('POST', '/tavern/characters', { workspaceId, action: 'delete', id: card.id })
  }
  const cast = []
  for (const card of project.cast) {
    const created = await call('POST', '/tavern/characters', { workspaceId, action: 'create', card })
    cast.push(created.card)
    console.log(`card: ${created.card.name} (${created.card.id})`)
  }

  await call('POST', '/tavern/worldbook', { workspaceId, entries: project.worldbook })
  console.log(`worldbook: ${project.worldbook.length} entries`)

  await call('POST', '/tavern/prompt', {
    workspaceId,
    scope: 'character',
    blocks: project.characterLayout,
  })
  await call('POST', '/tavern/prompt', {
    workspaceId,
    scope: 'director',
    blocks: project.directorLayout,
  })
  console.log('prompt layouts: character + director written')

  const first = cast[0]
  const characterPreview = await call(
    'GET',
    `/tavern/preview?workspaceId=${encodeURIComponent(workspaceId)}&scope=character`
      + `&cardId=${encodeURIComponent(first.id)}&sample=${encodeURIComponent('这趟末班车到终点站吗？')}`,
  )
  const directorPreview = await call(
    'GET',
    `/tavern/preview?workspaceId=${encodeURIComponent(workspaceId)}&scope=director`
      + `&sample=${encodeURIComponent('这趟末班车到终点站吗？')}`,
  )
  const report = {
    workspaceId,
    path: tavern.path,
    cast: cast.map(card => ({ id: card.id, name: card.name })),
    characterPreviewChars: characterPreview.system.length,
    characterLore: (characterPreview.lore ?? []).map(entry => entry.name),
    directorPreviewChars: directorPreview.system.length,
    directorLore: (directorPreview.lore ?? []).map(entry => entry.name),
  }
  console.log(JSON.stringify(report, null, 2))
}

await main()
