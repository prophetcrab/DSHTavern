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
import { activateEntries, renderLore, stageScanLines } from './worldbook.js'
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
  turns?: readonly unknown[]
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
function limitsOf(limits: BeatLimits | undefined): Required<BeatLimits> {
  return {
    maxSpeechesPerBeat: limits?.maxSpeechesPerBeat ?? MAX_SPEECHES_PER_BEAT,
    stageWindow: limits?.stageWindow ?? STAGE_WINDOW,
    loreScanLines: limits?.loreScanLines ?? WORLDBOOK_SCAN_LINES,
    loreMaxEntries: limits?.loreMaxEntries ?? WORLDBOOK_ACTIVE_MAX,
    loreMaxChars: limits?.loreMaxChars ?? WORLDBOOK_ACTIVE_CHARS_MAX,
    playerInputMax: limits?.playerInputMax ?? PLAYER_INPUT_MAX,
    rotateSpeakers: limits?.rotateSpeakers ?? true,
  }
}

export function buildDirectorSystem(input: {
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
}): string {
  const limits = limitsOf(input.limits)
  const roster = input.cast.length === 0
    ? '（当前没有角色卡）'
    : input.cast.map(member => `- ${member.id} | ${member.name} | ${member.brief}`).join('\n')
  const transcript = renderStage(input.stage.slice(-limits.stageWindow)) || '（剧情尚未开始）'
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
    ['director-world', [renderWorld(input.world), loreText].filter(part => part.length > 0).join('\n')],
    ['director-stage', transcript],
  ])
  // The director catalogue is user-ordered: `appliesTo` belongs to the
  // definition, while the layout decides order, enablement, and overrides.
  const views = promptBlockViews(input.layout, 'director').map((view) => {
    const injected = state.get(view.id)
    return injected === undefined ? view : { ...view, content: injected }
  })
  const rendered = renderPromptText(views)
  const rotation = recentSpeaker === undefined || !limits.rotateSpeakers
    ? []
    : [`上一个开口的是「${recentSpeaker}」。多人在场时轮换发言：除非剧情明确要求同一个人连续回应，否则请换另一个人。`, '']
  return [rendered, ...rotation].join('\n')
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
export function buildDirectorContinuation(input: {
  readonly world: WorldState
  readonly cast: readonly CastMember[]
  readonly stage: readonly StageEntry[]
  readonly layout: PromptLayout
  readonly worldbook?: readonly WorldbookEntry[]
  readonly playerInput?: string
  readonly limits?: BeatLimits
}, spoken: readonly CastMember[]): string {
  const base = buildDirectorSystem(input)
  const last = spoken[spoken.length - 1]
  return [
    base,
    '',
    '# 当前这一幕',
    ...spoken.length === 0 ? [] : [`这一幕已经开口的角色：${spoken.map(member => member.name).join('、')}。`],
    ...last === undefined ? [] : [`刚说完的是「${last.name}」。接下来由别人接话，除非剧情必须让 ${last.name} 再说一句。`],
    '如果这句话之后场面已经收住，输出 nextSpeaker: null，把话头交回玩家。不要替玩家推进剧情。',
  ].join('\n')
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
  const contextText = renderStage(input.stage.slice(-limits.stageWindow))
  const triggerText = [contextText, input.narration ?? '', input.playerInput ?? '']
    .filter(part => part.length > 0)
    .join('\n')
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
    const injected = cardContent(view.id, input.card, triggerText)
    return injected === undefined ? view : { ...view, content: injected }
  })
  const rendered = renderPromptText(views, { char: input.card.name, user: '玩家' })
  const transcript = contextText || '（剧情尚未开始）'
  const tail = renderLore(lore.tail)
  return [
    rendered,
    ...tail.length === 0 ? [] : ['', '# 现在需要注意', tail],
    '',
    '# 舞台记录',
    transcript,
    '',
    '# 你的职责',
    `你现在就是「${input.card.name}」。只输出 ${input.card.name} 自己的台词和这个角色自己的动作与神态。`,
    '不要旁白他人，不要替玩家说话，不要描写其他角色的内心，不要跳出角色。',
    '动作与神态用星号包裹，例如：*她把伞往旁边挪了挪*。',
  ].join('\n')
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
 * A name counts only as a whole token: a two-character name that happens to be
 * a substring of an unrelated word would otherwise hijack every beat. When the
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
    const at = playerInput.indexOf(member.name)
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
  'worldbook-before',
  'worldbook-after',
])

/**
 * Content a character-sourced block contributes for one card.
 * @param id - catalogue block id.
 * @param card - active card.
 * @param contextText - recent observable text used to trigger keyed lore entries.
 * @returns the block text, or `undefined` when the block is not card-sourced.
 */
function cardContent(id: string, card: CharacterCard, contextText: string): string | undefined {
  if (!CARD_BLOCKS.has(id)) return undefined
  switch (id) {
    case 'character-description': return card.description
    case 'character-personality': return card.personality
    case 'character-scenario': return card.scenario
    case 'character-system': return card.systemPrompt
    case 'examples': return card.exampleDialogues
    case 'worldbook-before': return loreText(card, 'before', contextText)
    case 'worldbook-after': return loreText(card, 'after', contextText)
    default: return undefined
  }
}

/**
 * Render a card's lore entries for one insertion position.
 *
 * Constant entries always fire; keyed entries fire when one of their keys
 * appears in the recent observable text.
 * @param card - active card.
 * @param position - insertion position relative to the character definition.
 * @param contextText - recent observable text.
 * @returns joined entry contents.
 */
function loreText(card: CharacterCard, position: 'before' | 'after', contextText: string): string {
  const haystack = contextText.toLowerCase()
  return card.entries
    .filter(entry => entry.enabled && entry.position === position)
    .filter(entry => entry.constant || entry.keys.length === 0
      || entry.keys.some(key => key.length > 0 && haystack.includes(key.toLowerCase())))
    .map(entry => entry.content.trim())
    .filter(text => text.length > 0)
    .join('\n\n')
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
