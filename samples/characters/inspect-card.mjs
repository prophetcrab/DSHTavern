/**
 * Inspect a SillyTavern character card PNG: list chunks, extract `ccv3`/`chara`
 * text, parse the JSON, and print a short summary.
 *
 * Run: node samples/characters/inspect-card.mjs samples/characters/linjianxia.png
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const file = process.argv[2]
if (file === undefined) {
  console.error('usage: node inspect-card.mjs <card.png>')
  process.exit(2)
}
const buffer = fs.readFileSync(file)
if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  console.error('not a PNG')
  process.exit(2)
}

let offset = 8
const chunks = []
let cardText
let cardSource
while (offset < buffer.length) {
  const length = buffer.readUInt32BE(offset)
  const type = buffer.toString('ascii', offset + 4, offset + 8)
  const data = buffer.subarray(offset + 8, offset + 8 + length)
  chunks.push(`${type}(${length})`)
  if (type === 'tEXt') {
    const zero = data.indexOf(0)
    const keyword = data.toString('latin1', 0, zero)
    const value = data.subarray(zero + 1)
    if (keyword === 'ccv3' || keyword === 'chara') {
      cardText = value.toString('utf8')
      cardSource = keyword
    }
  }
  if (type === 'iTXt') {
    const zero = data.indexOf(0)
    const keyword = data.toString('latin1', 0, zero)
    if (keyword === 'ccv3' || keyword === 'chara') {
      // iTXt: keyword\0 compressionFlag compressionMethod language\0 translated\0 text
      let cursor = zero + 3
      const languageEnd = data.indexOf(0, cursor)
      cursor = languageEnd + 1
      const translatedEnd = data.indexOf(0, cursor)
      cursor = translatedEnd + 1
      cardText = data.subarray(cursor).toString('utf8')
      cardSource = `${keyword} (iTXt)`
    }
  }
  if (type === 'IDAT') {
    // Decode the first IDAT to prove the image stream is intact.
    try { zlib.inflateSync(data.subarray(0, Math.min(data.length, 2048))) } catch { /* multi-part IDAT is fine */ }
  }
  offset += 12 + length
  if (type === 'IEND') break
}

console.log('chunks:', chunks.join(' '))
if (cardText === undefined) {
  console.log('no character text chunk')
  process.exit(1)
}
const card = JSON.parse(cardText)
const data = card.data ?? card
console.log('source:', cardSource)
console.log('spec:', card.spec ?? '(v1 bare fields)')
console.log('name:', data.name)
console.log('creator:', data.creator ?? '(none)')
console.log('tags:', (data.tags ?? []).join(', '))
console.log('character_book entries:', data.character_book?.entries?.length ?? 0)
console.log('alternate_greetings:', data.alternate_greetings?.length ?? 0)
console.log('description:', String(data.description ?? '').slice(0, 80).replace(/\s+/g, ' '), '...')
