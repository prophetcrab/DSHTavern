/**
 * Worldbook matching engine.
 *
 * Pure key matching and activation, shared by the host (which assembles real
 * prompts) and the browser half (which previews activation in the editor).
 * Nothing here touches the filesystem, so both bundles carry the same rules and
 * a preview cannot disagree with the request it describes.
 */
/** Most entries one request may carry. */
export const WORLDBOOK_ACTIVE_MAX = 8;
/** Most characters of lore one request may carry. */
export const WORLDBOOK_ACTIVE_CHARS_MAX = 6000;
/** Default scan window when an entry names no depth. */
export const WORLDBOOK_DEFAULT_DEPTH = 6;
/** Stage lines the caller should hand to {@link activateEntries} by default. */
export const WORLDBOOK_SCAN_LINES = 20;
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
export function activateEntries(options) {
    const maxEntries = options.maxEntries ?? WORLDBOOK_ACTIVE_MAX;
    const maxChars = options.maxChars ?? WORLDBOOK_ACTIVE_CHARS_MAX;
    const eligible = options.entries
        .filter(entry => entry.enabled && entry.content.trim().length > 0)
        .filter(entry => readableBy(entry, options.reader))
        .filter(entry => entry.constant || matches(entry, options))
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
    const selected = [];
    let usedChars = 0;
    for (const entry of eligible) {
        if (selected.length >= maxEntries)
            break;
        const cost = entry.content.length;
        if (usedChars + cost > maxChars)
            continue;
        usedChars += cost;
        selected.push(entry);
    }
    return selected;
}
/**
 * Render activated entries as prompt text.
 * @param entries - activated entries in injection order.
 * @returns their contents joined in order; empty when none activated.
 */
export function renderLore(entries) {
    return entries.map(entry => entry.content.trim()).filter(text => text.length > 0).join('\n\n');
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
export function readableBy(entry, reader) {
    if (reader.kind === 'director')
        return true;
    if (entry.visibility === 'all')
        return true;
    if (entry.visibility === 'characters')
        return entry.characterIds.includes(reader.characterId);
    return false;
}
/** Whether one entry's triggers hit the scanned text. */
function matches(entry, options) {
    if (entry.keys.length === 0)
        return false;
    const window = entry.depth > 0 ? options.recentLines.slice(-entry.depth) : options.recentLines;
    const haystack = [window.join('\n'), options.scanText].join('\n');
    if (!hitsAny(entry.keys, haystack, entry))
        return false;
    if (entry.secondaryKeys.length === 0)
        return true;
    return applyLogic(entry, haystack);
}
/** Apply the secondary-key logic to a primary hit. */
function applyLogic(entry, haystack) {
    const results = entry.secondaryKeys.map(key => keyHits(key, haystack, entry));
    switch (entry.logic) {
        case 'and_all': return results.every(Boolean);
        case 'not_any': return !results.some(Boolean);
        case 'not_all': return !results.every(Boolean);
        case 'and_any':
        default: return results.some(Boolean);
    }
}
function hitsAny(keys, haystack, entry) {
    return keys.some(key => keyHits(key, haystack, entry));
}
/** Whether one key occurs in the haystack under the entry's matching rules. */
function keyHits(key, haystack, entry) {
    if (!entry.wholeWords) {
        const needle = entry.caseSensitive ? key : key.toLowerCase();
        const subject = entry.caseSensitive ? haystack : haystack.toLowerCase();
        return subject.includes(needle);
    }
    return wholeWordIndex(haystack, key, { caseSensitive: entry.caseSensitive, cjkWords: true }) !== -1;
}
/**
 * Find a key that sits on word boundaries.
 * @param subject - text to search.
 * @param needle - key to find.
 * @param options - case folding and whether CJK binds.
 * @returns the match index, or `-1` when no bounded occurrence exists.
 */
export function wholeWordIndex(subject, needle, options) {
    if (needle.length === 0)
        return -1;
    const wanted = options.caseSensitive ? needle : needle.toLowerCase();
    const haystack = options.caseSensitive ? subject : subject.toLowerCase();
    let from = 0;
    while (from <= haystack.length) {
        const index = haystack.indexOf(wanted, from);
        if (index === -1)
            return -1;
        const before = haystack[index - 1];
        const after = haystack[index + wanted.length];
        if (!isWordChar(before, options.cjkWords) && !isWordChar(after, options.cjkWords))
            return index;
        from = index + 1;
    }
    return -1;
}
/**
 * Word characters are ASCII letters and digits, plus CJK ideographs, kana, and
 * hangul when {@link WholeWordOptions.cjkWords} is set.
 */
function isWordChar(char, cjkWords) {
    if (char === undefined)
        return false;
    if (/[A-Za-z0-9]/.test(char))
        return true;
    return cjkWords && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(char);
}
