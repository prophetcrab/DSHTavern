/**
 * Role-play orchestration: one director call decides what happens, then one
 * isolated call per speaking character produces that character's line.
 *
 * Isolation is structural: each character call receives only its own card and
 * the observable stage. Two characters therefore cannot contaminate each
 * other's voice, and a character never sees the director's private knowledge.
 *
 * The director returns JSON so the orchestrator never parses prose to learn who
 * spoke next. Narration is observable-only; hidden plot advancement goes to the
 * world state instead of the stage.
 */
import type { CharacterCard } from './character-card.js'
import type { PromptLayout } from './prompt-layout.js'
import { promptBlockViews, renderPromptText } from './prompt-layout.js'
import type { StageEntry, WorldState } from './stage.js'
import { activateEntries, renderLore, stageScanLines, wholeWordIndex } from './worldbook.js'
import type { WorldbookEntry } from './worldbook.js'
import { WORLDBOOK_ACTIVE_CHARS_MAX, WORLDBOOK_ACTIVE_MAX, WORLDBOOK_SCAN_LINES } from './worldbook.js'
import { renderStage } from './stage.js'

/** One cast member as the director sees it; never the full card. */
export interface CastMember {
  /** Stable card id the director names in `nextSpeaker`. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** One-line role summary for the roster. */
  readonly brief: string
}

/**
 * One-line cast brief: the card's first line of description, else its tags.
 *
 * The director only needs enough to decide who reacts; the full card would
 * leak the character's private definition into the director prompt.
 * @param card - cast member's card.
 * @returns a short identifying phrase.
 */
export function cardBrief(card: CharacterCard): string {
  const firstLine = card.description.split('\n').map(line => line.trim()).find(line => line.length > 0)
  if (firstLine !== undefined) return firstLine.slice(0, 60)
  return card.tags.slice(0, 3).join(' · ') || '（无简介）'
}

/** What the director decided for one beat. */
export interface DirectorDecision {
  /** Observable narration to stage before any speech; empty when none. */
  readonly narration: string
  /** Director-only plot advancement appended to the world state. */
  readonly inner: string
  /** Character id that speaks next, or `undefined` for a narration-only beat. */
  readonly nextSpeaker?: string
}

/** One ordered piece of a beat, as it will be shown to the player. */
export type BeatSegment =
  | { readonly kind: 'narration'; readonly text: string }
  | { readonly kind: 'speech'; readonly name: string; readonly text: string }

/** Where a turn's speaking character came from. */
export type SpeakerSource = 'director' | 'player-mention' | 'fallback-first'

/** One director/character exchange inside a beat, kept for inspection and replay. */
export interface BeatTurn {
  directorSystem: string
  /** Final director answer, after any repair call. */
  directorReply: string
  /** What the director answered before the format repair replaced it. */
  directorRawReply?: string
  /** Repair call's system prompt, when the director ignored the output contract. */
  repairSystem?: string
  /** Repair call's user message. */
  repairMessage?: string
  decision: DirectorDecision
  /** Route and model the director call used. */
  directorModel?: { readonly provider: string; readonly model: string }
  /** Route and model the character call used. */
  characterModel?: { readonly provider: string; readonly model: string }
  /** How the speaking character was chosen, when one spoke. */
  speakerSource?: SpeakerSource
  /** Character the orchestrator actually used; differs from the director's pick when overridden. */
  effectiveSpeaker?: { readonly id: string; readonly name: string }
  characterSystem?: string
  characterPromptMessages?: readonly { role: string; text: string }[]
  speech?: string
}

/** Evidence of one orchestrated beat, written for inspection. */
export interface BeatRecord {
  at: string
  playerInput: string
  directorSystem: string
  directorReply: string
  decision: DirectorDecision
  characterSystem?: string
  characterPromptMessages?: readonly { role: string; text: string }[]
  speech?: string
  /** Every director/character exchange this beat ran, in order. */
  turns?: readonly BeatTurn[]
  /** DSH turn that produced this beat, when the loop had opened it. */
  turn?: number
  /**
   * Stage length before this beat staged anything.
   *
   * Regeneration truncates here so the discarded draft never reaches the next
   * prompt. Absent on beats written before this field existed; those fall back
   * to counting the lines the record itself describes.
   */
  stageCountBefore?: number
  /** World snapshot before this beat wrote to it; absent on older records. */
  worldBefore?: WorldState
  /** Timestamp of the beat this one replaced, when it is a regeneration. */
  regeneratedFrom?: string
}
/** How many staged lines a character reads; older lines are dropped first. */
export const STAGE_WINDOW = 40

/** Longest single player utterance forwarded to the director. */
export const PLAYER_INPUT_MAX = 8000

/** Most characters that may speak in one player turn before the beat is closed. */
export const MAX_SPEECHES_PER_BEAT = 3

/**
 * Build the director system prompt.
 *
 * The prompt states the hard boundaries as rules the model cannot satisfy by
 * accident: narration never enters a character's mind, the director never acts
 * for the player, and the director never decides what a character chooses.
 * @param input - world snapshot, cast roster, and visible stage.
 * @returns the system prompt text.
 */
/** Runtime knobs one orchestrated beat reads; every field defaults to the shipped constant. */
export interface BeatLimits {
  /** Character speeches one player turn may produce. */
  readonly maxSpeechesPerBeat?: number
  /** Staged lines every prompt carries. */
  readonly stageWindow?: number
  /** Character cap on the staged transcript; absent means only the line budget applies. */
  readonly stageMaxChars?: number
  /** Recent stage lines the worldbook scan covers. */
  readonly loreScanLines?: number
  /** Worldbook entries one request may inject. */
  readonly loreMaxEntries?: number
  /** Worldbook characters one request may inject. */
  readonly loreMaxChars?: number
  /** Player utterance length forwarded to the model. */
  readonly playerInputMax?: number
  /** Tell the director to alternate speakers. */
  readonly rotateSpeakers?: boolean
}

/** Resolve the optional knobs against the shipped constants. */
function limitsOf(limits: BeatLimits | undefined): Required<Omit<BeatLimits, 'stageMaxChars'>> & { stageMaxChars?: number } {
  return {
    maxSpeechesPerBeat: limits?.maxSpeechesPerBeat ?? MAX_SPEECHES_PER_BEAT,
    stageWindow: limits?.stageWindow ?? STAGE_WINDOW,
    ...(limits?.stageMaxChars === undefined ? {} : { stageMaxChars: limits.stageMaxChars }),
    loreScanLines: limits?.loreScanLines ?? WORLDBOOK_SCAN_LINES,
    loreMaxEntries: limits?.loreMaxEntries ?? WORLDBOOK_ACTIVE_MAX,
    loreMaxChars: limits?.loreMaxChars ?? WORLDBOOK_ACTIVE_CHARS_MAX,
    playerInputMax: limits?.playerInputMax ?? PLAYER_INPUT_MAX,
    rotateSpeakers: limits?.rotateSpeakers ?? true,
  }
}

/**
 * Keep the newest staged lines that fit a character budget.
 *
 * The line budget alone stops bounding a prompt once it is large: an author can
 * raise it for long scenes and get a transcript whose size depends on how wordy
 * each line happened to be. Trimming from the front keeps the most recent
 * exchange, which is what every reader in the beat actually needs.
 * @param entries - staged lines, oldest first.
 * @param maxLines - line budget applied first.
 * @param maxChars - character budget, or undefined for none.
 * @returns the kept tail.
 */
export function tailWithinChars<T extends { readonly text: string }>(
  entries: readonly T[],
  maxLines: number,
  maxChars: number | undefined,
): readonly T[] {
  const tail = entries.slice(-maxLines)
  if (maxChars === undefined) return tail
  let total = 0
  let first = tail.length
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    const text = tail[index]?.text ?? ''
    // Always keep the newest line, even when it alone exceeds the budget: an
    // empty transcript would hide the turn that just happened.
    if (total + text.length > maxChars && first < tail.length) break
    total += text.length
    first = index
  }
  return tail.slice(first)
}

/** The block whose text must be the last thing the director reads. */
const DIRECTOR_FORMAT_BLOCK = 'director-format'

/** Join non-empty prompt sections with one blank line between each. */
function joinPromptParts(parts: readonly (string | undefined)[]): string {
  return parts
    .map(part => part?.trim() ?? '')
    .filter(part => part.length > 0)
    .join('\n\n')
}

/**
 * Split the director layout into its body and its output-format contract.
 *
 * The format block is not rendered in place: it is returned separately so every
 * prompt builder can append it last. Measured on this project's own beats, the
 * first director turn failed to answer in JSON 24% of the time while later turns
 * failed 3% of the time — the difference was that a later turn happened to end
 * with a line restating the output contract, and the first turn ended with a
 * pacing hint instead. Position dominates repetition for a long prompt.
 * @param input - layout and runtime state to inject.
 * @param state - per-block runtime text.
 * @returns body text and the enabled format contract, if the block is enabled.
 */
function directorPromptParts(
  input: { readonly layout: PromptLayout },
  state: ReadonlyMap<string, string>,
): { body: string; format: string | undefined } {
  // The director catalogue is user-ordered: `appliesTo` belongs to the
  // definition, while the layout decides order, enablement, and overrides.
  const views = promptBlockViews(input.layout, 'director').map((view) => {
    const injected = state.get(view.id)
    return injected === undefined ? view : { ...view, content: injected }
  })
  const formatView = views.find(view => view.id === DIRECTOR_FORMAT_BLOCK)
  return {
    body: renderPromptText(views.filter(view => view.id !== DIRECTOR_FORMAT_BLOCK)),
    format: formatView !== undefined && formatView.enabled && formatView.content.trim().length > 0
      ? formatView.content
      : undefined,
  }
}

/** Inputs shared by both director prompt builders. */
interface DirectorPromptInput {
  readonly world: WorldState
  readonly cast: readonly CastMember[]
  readonly stage: readonly StageEntry[]
  readonly layout: PromptLayout
  /** Workspace lore; entries marked director-only are included here. */
  readonly worldbook?: readonly WorldbookEntry[]
  /** The player's utterance for this beat, if any. */
  readonly playerInput?: string
  /** Runtime knobs; omitted fields use the shipped constants. */
  readonly limits?: BeatLimits
}

/**
 * Build the invariant part of a director prompt: block bodies and the format
 * contract, both resolved against runtime state.
 * @param input - world, cast, stage, and layout.
 * @returns the body text, rotation hint, and format contract.
 */
function directorScaffold(input: DirectorPromptInput): {
  body: string
  rotation: string
  format: string | undefined
} {
  const limits = limitsOf(input.limits)
  const roster = input.cast.length === 0
    ? '（当前没有角色卡）'
    : input.cast.map(member => `- ${member.id} | ${member.name} | ${member.brief}`).join('\n')
  const transcript = renderStage(tailWithinChars(input.stage, limits.stageWindow, limits.stageMaxChars)) || '（剧情尚未开始）'
  const recentSpeaker = lastSpeakerName(input.stage)
  const lore = activateEntries({
    entries: input.worldbook ?? [],
    scanText: input.playerInput ?? '',
    recentLines: stageScanLines(input.stage, limits.loreScanLines),
    audience: 'director',
    maxEntries: limits.loreMaxEntries,
    maxChars: limits.loreMaxChars,
  })
  const loreText = renderLore([...lore.before, ...lore.after, ...lore.tail])
  const state = new Map<string, string>([
    ['director-roster', roster],
    ['director-world', renderWorld(input.world)],
    ['director-lore', loreText],
    ['director-stage', transcript],
  ])
  const { body, format } = directorPromptParts(input, state)
  return { body, rotation: rotationHint(recentSpeaker, limits.rotateSpeakers), format }
}

export function buildDirectorSystem(input: DirectorPromptInput): string {
  const { body, rotation, format } = directorScaffold(input)
  return joinPromptParts([body, rotation, format])
}

/**
 * Rotation hint, when the scene has a previous speaker to alternate from.
 * @param recentSpeaker - last character that spoke, if any.
 * @param rotate - whether the workspace asks for rotation.
 * @returns the hint text, or an empty string.
 */
function rotationHint(recentSpeaker: string | undefined, rotate: boolean): string {
  if (recentSpeaker === undefined || !rotate) return ''
  return `上一个开口的是「${recentSpeaker}」。多人在场时轮换发言：除非剧情明确要求同一个人连续回应，否则请换另一个人。`
}

/**
 * Render the world state for the director prompt.
 * @param world - director-owned snapshot.
 * @returns section text; empty when nothing is recorded yet.
 */
export function renderWorld(world: WorldState): string {
  const lines: string[] = [`场景：${world.scene || '（尚未确定）'}`]
  if (world.facts.length > 0) lines.push('已确立的事实：', ...world.facts.map(fact => `- ${fact}`))
  if (world.hidden.length > 0) lines.push('尚未揭示的剧情：', ...world.hidden.map(item => `- ${item}`))
  return lines.join('\n')
}

/**
 * Build the director prompt for a follow-up turn inside the same beat.
 *
 * After a character speaks, the director decides whether the scene continues
 * with someone else or settles. The previous speaker is named so a two-person
 * scene alternates instead of repeating.
 * @param input - world, cast, current stage, and the director layout.
 * @param spoken - characters that already spoke this beat, latest last.
 * @returns the system prompt text.
 */
export function buildDirectorContinuation(input: DirectorPromptInput, spoken: readonly CastMember[]): string {
  const { body, rotation, format } = directorScaffold(input)
  const last = spoken[spoken.length - 1]
  const beatContext = [
    '# 当前这一幕',
    ...spoken.length === 0 ? [] : [`这一幕已经开口的角色：${spoken.map(member => member.name).join('、')}。`],
    ...last === undefined ? [] : [`刚说完的是「${last.name}」。接下来由别人接话，除非剧情必须让 ${last.name} 再说一句。`],
    '如果这句话之后场面已经收住，输出 nextSpeaker: null，把话头交回玩家。不要替玩家推进剧情。',
  ].join('\n')
  // The format contract stays last even here: appending the beat context after
  // it was what buried the output contract on later turns.
  return joinPromptParts([body, rotation, beatContext, format])
}

/**
 * Render one beat's ordered segments as the assistant message the player sees.
 *
 * Narration becomes a blockquote so it reads as stage direction; speech carries
 * the speaker's name in bold. The client scopes its narration styling to tavern
 * sessions (`body[data-dshtavern-story]`), so this shape is only reinterpreted
 * inside the tavern.
 * @param segments - narration and speech pieces in story order.
 * @returns the visible reply text.
 */
export function renderBeatMarkdown(segments: readonly BeatSegment[]): string {
  const parts: string[] = []
  for (const segment of segments) {
    if (segment.kind === 'narration') {
      const text = segment.text.trim()
      if (text.length === 0) continue
      parts.push(text.split('\n').map(line => `> ${line}`).join('\n'))
      continue
    }
    const text = segment.text.trim()
    if (text.length === 0) continue
    parts.push(`**${segment.name}**\n\n${text}`)
  }
  return parts.join('\n\n')
}

/**
 * Display name of the most recent speech line.
 * @param stage - staged lines.
 * @returns the last speaker's name, or `undefined` before anyone speaks.
 */
function lastSpeakerName(stage: readonly StageEntry[]): string | undefined {
  for (let index = stage.length - 1; index >= 0; index -= 1) {
    const entry = stage[index]
    if (entry?.kind === 'speech') return entry.speakerName ?? entry.speaker
  }
  return undefined
}

/**
 * Build one character's system prompt: its own card, activated lore, and the
 * observable stage.
 *
 * Lore is keyed on what the character can currently perceive, so the scan text
 * includes the stage, the beat's narration, and the player's own words. The
 * player never enters the stage itself, so leaving that input out would make
 * "the player says X" fail to activate an entry that "a character says X"
 * activates.
 * @param input - resolved prompt layout, the card, its lore, and recent stage.
 * @returns the system prompt text.
 */
export function buildCharacterSystem(input: {
  readonly layout: PromptLayout
  readonly card: CharacterCard
  readonly stage: readonly StageEntry[]
  /** Workspace lore plus this card's own entries. */
  readonly worldbook?: readonly WorldbookEntry[]
  /** The player's utterance for this beat, if any. */
  readonly playerInput?: string
  /** Narration this beat already staged, so its keywords count too. */
  readonly narration?: string
  /** Runtime knobs; omitted fields use the shipped constants. */
  readonly limits?: BeatLimits
}): string {
  const limits = limitsOf(input.limits)
  const contextText = renderStage(tailWithinChars(input.stage, limits.stageWindow, limits.stageMaxChars))
  const lore = activateEntries({
    entries: input.worldbook ?? [],
    scanText: [input.narration ?? '', input.playerInput ?? ''].join('\n'),
    recentLines: stageScanLines(input.stage, limits.loreScanLines),
    audience: 'character',
    maxEntries: limits.loreMaxEntries,
    maxChars: limits.loreMaxChars,
  })
  const views = promptBlockViews(input.layout).map((view) => {
    if (view.id === 'worldbook-before') return { ...view, content: renderLore(lore.before) }
    if (view.id === 'worldbook-after') return { ...view, content: renderLore(lore.after) }
    if (view.id === 'lore-tail') return { ...view, content: renderLore(lore.tail) }
    if (view.id === 'character-stage') return { ...view, content: contextText || '（剧情尚未开始）' }
    const injected = cardContent(view.id, input.card)
    return injected === undefined ? view : { ...view, content: injected }
  })
  return renderPromptText(views, { char: input.card.name, user: '玩家' })
}

/**
 * Build the user message one character receives: the beat's narration followed
 * by the player's own words.
 * @param narration - narration staged for this beat, if any.
 * @param playerInput - the player's utterance.
 * @returns the message text.
 */
export function buildCharacterMessage(narration: string, playerInput: string): string {
  const parts: string[] = []
  if (narration.trim().length > 0) parts.push(`【旁白】${narration.trim()}`)
  parts.push(`【玩家】${playerInput.trim()}`)
  return parts.join('\n\n')
}

/**
 * Parse the director's reply into a decision.
 *
 * Accepts the documented JSON object and tolerates a fenced or prefixed reply by
 * extracting the outermost braces. A reply that carries no JSON at all is
 * treated as pure narration, which keeps the story moving instead of failing the
 * turn.
 *
 * Both the JSON and the prose fallback pass through {@link splitTranscriptShaped}
 * first: a director that answers as a transcript (`[旁白] … [白鹭] …`) would
 * otherwise put another character's dialogue on the stage as narration, where
 * every later character reads it as something they witnessed.
 * @param text - raw director output.
 * @returns the parsed decision.
 */
export function parseDirectorReply(text: string): DirectorDecision {
  const json = extractJsonObject(text)
  if (json === undefined) {
    const split = splitTranscriptShaped(text)
    if (split !== undefined) {
      return {
        narration: split.narration,
        inner: '',
        ...(split.speakerName === undefined ? {} : { nextSpeaker: split.speakerName }),
      }
    }
    return { narration: text.trim(), inner: '' }
  }
  const narration = typeof json.narration === 'string' ? json.narration.trim() : ''
  const inner = typeof json.inner === 'string' ? json.inner.trim() : ''
  const speaker = json.nextSpeaker
  const nextSpeaker = typeof speaker === 'string' && speaker.length > 0 && speaker !== 'null'
    ? speaker
    : undefined
  // A narration field that carries speaker tags is the same defect as a prose
  // transcript, only wrapped in JSON. Keep the narration and route the tagged
  // speaker through the character call unless the director named one already.
  const split = splitTranscriptShaped(narration)
  if (split !== undefined && nextSpeaker === undefined) {
    return {
      narration: split.narration,
      inner,
      ...(split.speakerName === undefined ? {} : { nextSpeaker: split.speakerName }),
    }
  }
  return {
    narration: split === undefined ? narration : split.narration,
    inner,
    ...(nextSpeaker === undefined ? {} : { nextSpeaker }),
  }
}

/**
 * Whether a reply arrived as the documented JSON object.
 *
 * Distinct from {@link parseDirectorReply}, which always produces a usable
 * decision: this answers the narrower question "did the director obey the
 * contract", so a caller can decide whether a repair call is worth spending.
 * @param text - raw director output.
 * @returns true when the reply parses as a JSON object with a narration field.
 */
export function isDirectorJsonReply(text: string): boolean {
  const json = extractJsonObject(text)
  return json !== undefined && typeof json.narration === 'string'
}

/**
 * Prompt asking the director to restate its previous answer as JSON.
 *
 * Used only after a malformed reply: the model already decided what happens,
 * so this asks for the format, not for a new decision.
 * @param originalSystem - the system prompt that produced the malformed reply.
 * @param malformedReply - what the model actually said.
 * @returns the repair system prompt.
 */
export function buildDirectorRepairSystem(originalSystem: string, malformedReply: string): string {
  return [
    '你上一条回复没有遵守输出格式。把它的内容原样转成下面的 JSON 结构，不要改变剧情决定：',
    originalSystem,
    '',
    '# 你上一条回复',
    malformedReply.trim(),
    '',
    '# 要求',
    '只输出 JSON，第一个字符是 {，最后一个字符是 }。',
    'narration 放旁白（可空字符串），inner 放导演私记（可空字符串），nextSpeaker 放角色 id 或 null。',
    '不要把角色台词写进 narration：台词由角色自己在下一步生成。',
  ].join('\n')
}

/** Tag the orchestrator uses for narration lines in a rendered transcript. */
const NARRATION_TAG = '旁白'

/** A line-shaped `[speaker]` tag at the start of a transmission line. */
const TRANSCRIPT_TAG = /^\s*\[([^\]\n]{1,20})\]\s*(.*)$/

/**
 * Split a transcript-shaped reply into narration and the first speaker tag.
 *
 * The director is asked for JSON, but it sometimes answers the way the stage is
 * rendered. This reads the leading narration lines, drops their `[旁白]`
 * markers, and reports the first non-narration tag as the speaker. Text after
 * that tag is discarded: the named character gets its own call, and replaying a
 * pre-written line as well would stage the same speech twice.
 * @param text - raw director output, possibly JSON-wrapped narration.
 * @returns narration plus the tagged speaker name; `undefined` when no tag appears.
 */
export function splitTranscriptShaped(text: string): { narration: string; speakerName?: string } | undefined {
  const lines = text.split('\n')
  const narration: string[] = []
  let sawNarrationTag = false
  for (const line of lines) {
    const match = TRANSCRIPT_TAG.exec(line)
    if (match === null) {
      narration.push(line)
      continue
    }
    const tag = match[1]?.trim() ?? ''
    const rest = match[2] ?? ''
    if (tag === NARRATION_TAG) {
      sawNarrationTag = true
      if (rest.trim().length > 0) narration.push(rest)
      continue
    }
    return { narration: narration.join('\n').trim(), speakerName: tag }
  }
  if (!sawNarrationTag) return undefined
  return { narration: narration.join('\n').trim() }
}


/**
 * Resolve the director's speaker reference against the cast.
 *
 * The director is told to answer with an id, but accepting a name keeps a
 * slightly-off answer from dropping the beat's speech.
 * @param decision - director decision.
 * @param cast - cast roster.
 * @returns the matching cast member, or `undefined`.
 */
export function resolveSpeaker(
  decision: DirectorDecision,
  cast: readonly CastMember[],
): CastMember | undefined {
  if (decision.nextSpeaker === undefined) return undefined
  const wanted = decision.nextSpeaker.trim()
  return cast.find(member => member.id === wanted)
    ?? cast.find(member => member.name === wanted)
    ?? cast.find(member => member.name.toLowerCase() === wanted.toLowerCase())
}

/**
 * Find the cast member the player addressed by name.
 *
 * A Latin name counts only as a whole token, so "Ann" does not match "Annex".
 * Chinese prose has no spaces and a name often abuts a verb ("林见夏在车上"),
 * so CJK characters do not bind: a CJK name matches as a substring. When the
 * player names several characters, the earliest mention wins.
 * @param playerInput - the player's utterance.
 * @param cast - cast roster.
 * @returns the most-mentioned character, or `undefined`.
 */
export function mentionedSpeaker(
  playerInput: string,
  cast: readonly CastMember[],
): CastMember | undefined {
  let best: { member: CastMember; at: number } | undefined
  for (const member of cast) {
    const at = wholeWordIndex(playerInput, member.name, { caseSensitive: true, cjkWords: false })
    if (at === -1) continue
    if (best === undefined || at < best.at) best = { member, at }
  }
  return best?.member
}

/** Block ids whose content comes from the active character card. */
const CARD_BLOCKS = new Set([
  'character-description',
  'character-personality',
  'character-scenario',
  'character-system',
  'examples',
])

/**
 * Content a character-sourced block contributes for one card.
 *
 * The worldbook blocks are filled from {@link activateEntries} instead: the
 * card's own entries are converted to worldbook entries by the caller, so both
 * sources match through one engine.
 * @param id - catalogue block id.
 * @param card - active card.
 * @returns the block text, or `undefined` when the block is not card-sourced.
 */
function cardContent(id: string, card: CharacterCard): string | undefined {
  if (!CARD_BLOCKS.has(id)) return undefined
  switch (id) {
    case 'character-description': return card.description
    case 'character-personality': return card.personality
    case 'character-scenario': return card.scenario
    case 'character-system': return card.systemPrompt
    case 'examples': return card.exampleDialogues
    default: return undefined
  }
}

/**
 * Extract the first balanced JSON object from a reply.
 * @param text - candidate text.
 * @returns the parsed object, or `undefined` when none parses.
 */
function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{')
  if (start === -1) return undefined
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          const value: unknown = JSON.parse(text.slice(start, index + 1))
          return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? value as Record<string, unknown>
            : undefined
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}
