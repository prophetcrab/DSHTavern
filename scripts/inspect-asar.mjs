// Print the name/version of DSH packages bundled inside an Electron asar archive.
import { open } from 'node:fs/promises'

const archive = process.argv[2]
if (archive === undefined) throw new Error('usage: node inspect-asar.mjs <app.asar>')

const handle = await open(archive, 'r')
const head = Buffer.alloc(16)
await handle.read(head, 0, 16, 0)
if (head.readUInt32LE(0) !== 4) throw new Error('not an asar archive')
const headerSize = head.readUInt32LE(4)
const headerLength = headerSize - 8
const headerBuffer = Buffer.alloc(headerLength)
await handle.read(headerBuffer, 0, headerLength, 16)
const header = JSON.parse(headerBuffer.toString('utf8'))
const base = 8 + headerSize

const files = new Map()
const walk = (node, prefix) => {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const path = prefix === '' ? name : `${prefix}/${name}`
    if (entry.files !== undefined) walk(entry, path)
    else files.set(path, entry)
  }
}
walk(header, '')

const targets = [...files.keys()].filter(path => /node_modules\/@deepseek-ai\/dsh(?:-[^/]+)?\/package\.json$/.test(path))
for (const path of targets) {
  const entry = files.get(path)
  const content = Buffer.alloc(Number(entry.size))
  await handle.read(content, 0, Number(entry.size), base + Number(entry.offset))
  try {
    const manifest = JSON.parse(content.toString('utf8'))
    if (typeof manifest.name === 'string' && manifest.name.startsWith('@deepseek-ai/dsh')) {
      console.log(`${manifest.name}@${manifest.version}`)
    }
  } catch {
    // Ignore entries that are not JSON manifests.
  }
}
await handle.close()
