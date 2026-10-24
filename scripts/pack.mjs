#!/usr/bin/env node
/**
 * Build the plugin and write an installable tarball into `dist/`.
 *
 * This is the no-npm-registry path: DSH installs a plugin from a tarball URL, so
 * committing the packed file to the repository gives every user a one-command
 * install without an npm account, a clone, or a build.
 *
 * Version and tarball name come from `package.json`; the committed file is named
 * after its version so an install URL never silently changes contents.
 *
 * Usage: node scripts/pack.mjs
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

/** Run one command in the repository root, returning its trimmed stdout. */
function run(line) {
  return execSync(line, { cwd: ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }).trim()
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const { name, version } = manifest
const tarball = `${name}-${version}.tgz`

console.log(`packing ${name}@${version}`)
run('pnpm build')
run('pnpm test')

rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })
run('npm pack --pack-destination dist')

// Older tarballs stay out of the way: an install URL names one version.
for (const entry of readdirSync(DIST)) {
  if (entry !== tarball && entry.endsWith('.tgz')) {
    rmSync(join(DIST, entry), { force: true })
    console.log(`removed stale ${entry}`)
  }
}

const size = statSync(join(DIST, tarball)).size
console.log(`wrote dist/${tarball} — ${(size / 1024).toFixed(0)} KB`)
console.log(`install with: npx @deepseek-ai/dsh plugin --profile web add <raw url of dist/${tarball}>`)
