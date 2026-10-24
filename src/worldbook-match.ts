/**
 * Worldbook matching engine.
 *
 * Pure key matching and activation, shared by the host (which assembles real
 * prompts) and the browser half (which previews activation in the editor).
 * Nothing here touches the filesystem, so both bundles carry the same rules and
 * a preview cannot disagree with the request it describes.
 */

/** How secondary keys combine with a primary hit. */
export type WorldbookLogic = 'and_any' | 'and_all' | 'not_any' | 'not_all'

/**
 * Who may read an entry.
 *
 * Visibility replaces the earlier insert-position split: an entry is filed by
 * its audience, not by where it lands in the prompt. `all` reaches every
 * character, `director` reaches only the director, and `characters` reaches the
 * listed character ids. The director reads every entry regardless, because it
 * is the game master and not a character.
 */
export type WorldbookVisibility = 'all' | 'director' | 'characters'

/** One keyed lore entry. */
export interface WorldbookEntry {
  /** Stable identity used by the editor and the stage records. */
  readonly id: string
  /** Display name; also the heading this entry contributes. */
  readonly name: string
  /** Text injected when the entry activates. */
  readonly content: string
  /** Primary triggers; any one hit activates the entry. */
  readonly keys: readonly string[]
  /** Refining triggers consulted through {@link WorldbookEntry.logic}. */
  readonly secondaryKeys: readonly string[]
  /** How secondary keys combine. */
  readonly logic: WorldbookLogic
  /** Always inject, ignoring keys. */
  readonly constant: boolean
  /** Lower values appear earlier in the prompt and survive the budget first. */
  readonly order: number
  /** How many recent stage lines the scan covers; `0` means the whole window. */
  readonly depth: number
  /** Whether this entry participates at all. */
  readonly enabled: boolean
  /** Match case-sensitively. */
  readonly caseSensitive: boolean
  /** Require the key to sit on word boundaries. */
  readonly wholeWords: boolean
  /** Who may read the entry. */
  readonly visibility: WorldbookVisibility
  /** Character ids when `visibility` is `characters`; ignored otherwise. */
  readonly characterIds: readonly string[]
}

/** A prompt being assembled, as far as lore selection is concerned. */
export type LoreReader =
  | { readonly kind: 'director' }
  | { readonly kind: 'character'; readonly characterId: string }

/** Most entries one request may carry. */
export const WORLDBOOK_ACTIVE_MAX = 8

/** Most characters of lore one request may carry. */
export const WORLDBOOK_ACTIVE_CHARS_MAX = 6000

/** Default scan window when an entry names no depth. */
export const WORLDBOOK_DEFAULT_DEPTH = 6

/** Stage lines the caller should hand to {@link activateEntries} by default. */
export const WORLDBOOK_SCAN_LINES = 20

/** Options for {@link activateEntries}. */
export interface ActivationOptions {
  /** Entries from the workspace and the active character card. */
  readonly entries: readonly WorldbookEntry[]
  /** Text outside the stage that the scan must still cover, such as this beat's narration. */
  readonly scanText: string
  /** Recent stage lines, oldest first; each entry's `depth` indexes into this. */
  readonly recentLines: readonly string[]
  /** Whose prompt is being assembled; decides which entries are visible. */
  readonly reader: LoreReader
  /** Maximum entries returned. */
  readonly maxEntries?: number
  /** Maximum characters of content returned. */
  readonly maxChars?: number
}

/**
 * Select the entries one reader should receive.
 *
 * Constant entries bypass matching. Keyed entries scan the last `depth` lines
 * (their own depth, else the whole provided window) plus `scanText`. Secondary
 * keys then narrow the hit through the entry's logic. The result is ordered by
 * `order` and cut to the budget, so a long worldbook degrades predictably
 * instead of silently consuming the request.
 * @param options - entries, scan inputs, reader, and budget.
 * @returns activated entries in injection order.
 */
export function activateEntries(options: ActivationOptions): WorldbookEntry[] {
  const maxEntries = options.maxEntries ?? WORLDBOOK_ACTIVE_MAX
  const maxChars = options.maxChars ?? WORLDBOOK_ACTIVE_CHARS_MAX
  const eligible = options.entries
    .filter(entry => entry.enabled && entry.content.trim().length > 0)
    .filter(entry => readableBy(entry, options.reader))
    .filter(entry => entry.constant || matches(entry, options))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))

  const selected: WorldbookEntry[] = []
  let usedChars = 0
  for (const entry of eligible) {
    if (selected.length >= maxEntries) break
    const cost = entry.content.length
    if (usedChars + cost > maxChars) continue
    usedChars += cost
    selected.push(entry)
  }
  return selected
}

/**
 * Render activated entries as prompt text.
 * @param entries - activated entries in injection order.
 * @returns their contents joined in order; empty when none activated.
 */
export function renderLore(entries: readonly WorldbookEntry[]): string {
  return entries.map(entry => entry.content.trim()).filter(text => text.length > 0).join('\n\n')
}

/**
 * Whether one entry may be read by one prompt.
 *
 * The director reads everything: entries scoped to a single character are facts
 * the game master still knows. A character reads only entries marked for
 * everyone or for that exact character.
 * @param entry - candidate entry.
 * @param reader - the prompt being assembled.
 * @returns whether the reader may receive this entry.
 */
export function readableBy(entry: WorldbookEntry, reader: LoreReader): boolean {
  if (reader.kind === 'director') return true
  if (entry.visibility === 'all') return true
  if (entry.visibility === 'characters') return entry.characterIds.includes(reader.characterId)
  return false
}

/** Whether one entry's triggers hit the scanned text. */
function matches(entry: WorldbookEntry, options: ActivationOptions): boolean {
  if (entry.keys.length === 0) return false
  const window = entry.depth > 0 ? options.recentLines.slice(-entry.depth) : options.recentLines
  const haystack = [window.join('\n'), options.scanText].join('\n')
  if (!hitsAny(entry.keys, haystack, entry)) return false
  if (entry.secondaryKeys.length === 0) return true
  return applyLogic(entry, haystack)
}

/** Apply the secondary-key logic to a primary hit. */
function applyLogic(entry: WorldbookEntry, haystack: string): boolean {
  const results = entry.secondaryKeys.map(key => keyHits(key, haystack, entry))
  switch (entry.logic) {
    case 'and_all': return results.every(Boolean)
    case 'not_any': return !results.some(Boolean)
    case 'not_all': return !results.every(Boolean)
    case 'and_any':
    default: return results.some(Boolean)
  }
}

function hitsAny(keys: readonly string[], haystack: string, entry: WorldbookEntry): boolean {
  return keys.some(key => keyHits(key, haystack, entry))
}

/** Whether one key occurs in the haystack under the entry's matching rules. */
function keyHits(key: string, haystack: string, entry: WorldbookEntry): boolean {
  if (!entry.wholeWords) {
    const needle = entry.caseSensitive ? key : key.toLowerCase()
    const subject = entry.caseSensitive ? haystack : haystack.toLowerCase()
    return subject.includes(needle)
  }
  return wholeWordIndex(haystack, key, { caseSensitive: entry.caseSensitive, cjkWords: true }) !== -1
}

/** Options for {@link wholeWordIndex}. */
export interface WholeWordOptions {
  /** Whether the comparison keeps case. */
  readonly caseSensitive: boolean
  /**
   * Whether CJK characters count as word characters.
   *
   * Worldbook keys are explicit author choices, so an entry asking for whole
   * words means "伞 must not fire inside 雨伞架". Mention detection runs over
   * running prose where a name directly abuts a verb, so it leaves this off.
   */
  readonly cjkWords: boolean
}

/**
 * Find a key that sits on word boundaries.
 * @param subject - text to search.
 * @param needle - key to find.
 * @param options - case folding and whether CJK binds.
 * @returns the match index, or `-1` when no bounded occurrence exists.
 */
export function wholeWordIndex(subject: string, needle: string, options: WholeWordOptions): number {
  if (needle.length === 0) return -1
  const wanted = options.caseSensitive ? needle : needle.toLowerCase()
  const haystack = options.caseSensitive ? subject : subject.toLowerCase()
  let from = 0
  while (from <= haystack.length) {
    const index = haystack.indexOf(wanted, from)
    if (index === -1) return -1
    const before = haystack[index - 1]
    const after = haystack[index + wanted.length]
    if (!isWordChar(before, options.cjkWords) && !isWordChar(after, options.cjkWords)) return index
    from = index + 1
  }
  return -1
}

/**
 * Word characters are ASCII letters and digits, plus CJK ideographs, kana, and
 * hangul when {@link WholeWordOptions.cjkWords} is set.
 */
function isWordChar(char: string | undefined, cjkWords: boolean): boolean {
  if (char === undefined) return false
  if (/[A-Za-z0-9]/.test(char)) return true
  return cjkWords && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(char)
}
