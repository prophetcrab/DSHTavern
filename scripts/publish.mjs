#!/usr/bin/env node
/**
 * Publish the package to npm and point the market index at the released version.
 *
 * The index must name the version npm actually published, with its real publish
 * time: a reader installs the pinned `name@version`, so a stale entry installs a
 * version that does not exist. Running this after `npm login` keeps the two in
 * step instead of leaving the index to be edited by hand.
 *
 * Usage: node scripts/publish.mjs [--dry-run]
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = join(ROOT, 'market', 'index.json')
const REGISTRY = 'https://registry.npmjs.org/'
const dryRun = process.argv.includes('--dry-run')

/**
 * Run one command in the repository root, returning its trimmed stdout.
 *
 * The command runs through the platform shell because Windows exposes `npm` and
 * `pnpm` as `.cmd` shims that `execFileSync` cannot spawn without one.
 */
function run(line) {
  return execSync(line, { cwd: ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }).trim()
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const { name, version } = manifest

console.log(`publishing ${name}@${version} to ${REGISTRY}`)
run('pnpm build')
run('pnpm test')
run(`npm publish --registry ${REGISTRY} --access public${dryRun ? ' --dry-run' : ''}`)
if (dryRun) {
  console.log('dry run: index left unchanged')
  process.exit(0)
}

const response = await fetch(`${REGISTRY}${name}`, { headers: { accept: 'application/json' } })
if (!response.ok) throw new Error(`registry read failed: ${response.status} ${response.statusText}`)
const times = (await response.json()).time
const publishedAt = Date.parse(times?.[version] ?? '')
const publishTimestamp = Number.isNaN(publishedAt) ? Math.floor(Date.now() / 1000) : Math.floor(publishedAt / 1000)
const index = JSON.parse(readFileSync(INDEX, 'utf8'))
const entry = index.plugins.find(plugin => plugin.name === name)
if (entry === undefined) throw new Error(`market/index.json has no entry for ${name}`)

entry['dist-tags'] = { ...entry['dist-tags'], latest: version }
const existing = entry.versions.find(item => item.version === version)
if (existing === undefined) {
  entry.versions.push({
    version,
    publishTimestamp,
    source: { type: 'npm' },
    engines: { dsh: manifest.engines.dsh },
  })
} else {
  existing.publishTimestamp = publishTimestamp
  existing.engines = { dsh: manifest.engines.dsh }
}
writeFileSync(INDEX, `${JSON.stringify(index, undefined, 2)}\n`, 'utf8')
console.log(`index updated: ${name}@${version} at ${new Date(publishTimestamp * 1000).toISOString()}`)
