/**
 * Prompt preview: assemble exactly what the model would receive.
 *
 * The preview calls the same builders the runtime uses, so it cannot drift from
 * the real request. It exists to answer two questions the orchestrator panel
 * cannot answer by inspection: what does the final system prompt look like, and
 * which lore entries actually fire for a given line.
 *
 * A preview synthesizes its own stage from the sample text instead of reading a
 * chat, because a layout is workspace-scoped while a stage belongs to one chat.
 */
import type { CharacterCard } from './character-card.js'
import {
  buildCharacterSystem,
  buildDirectorSystem,
  cardBrief,
} from './orchestrator.js'
import type { BeatLimits, CastMember } from './orchestrator.js'
import type { PromptLayout, PromptScope } from './prompt-layout.js'
import type { StageEntry, WorldState } from './stage.js'
import { activateEntries, fromCardEntries, stageScanLines } from './worldbook.js'
import type { WorldbookEntry, WorldbookVisibility } from './worldbook.js'

/** One character available to preview. */
export interface PreviewCardRef {
  readonly id: string
  readonly name: string
}

/** One lore entry that the sample line activates. */
export interface PreviewLoreHit {
  readonly id: string
  readonly name: string
  readonly visibility: WorldbookVisibility
  /** Characters of content this entry contributes. */
  readonly chars: number
}

/** Assembled preview for one scope. */
export interface PromptPreview {
  /** Which prompt was assembled. */
  readonly scope: PromptScope
  /** The complete system prompt the model would receive. */
  readonly system: string
  /** Character this preview rendered; absent for the director scope. */
  readonly cardName?: string
  /** Every card the preview could have rendered. */
  readonly cards: readonly PreviewCardRef[]
  /** Entries the sample line activated, in injection order. */
  readonly lore: readonly PreviewLoreHit[]
  /** Total characters of lore injected. */
  readonly loreChars: number
  /** Line the preview scanned for triggers. */
  readonly sample: string
}

/** Inputs {@link buildPreview} needs; the caller loads them from disk. */
export interface PreviewInput {
  readonly scope: PromptScope
  readonly layout: PromptLayout
  readonly cards: readonly CharacterCard[]
  /** Card to render for the character scope; defaults to the first card. */
  readonly cardId?: string
  /** Workspace lore. */
  readonly worldbook: readonly WorldbookEntry[]
  /** Sample player line driving activation. */
  readonly sample?: string
  /** Director-owned world state, used only by the director scope. */
  readonly world?: WorldState
  /** Active player persona text, when the workspace has one. */
  readonly persona?: string
  /** Rendered text per persona id, so a named block can resolve its persona. */
  readonly personaById?: Readonly<Record<string, string>>
  /** Runtime knobs, so the preview carries the same history and lore as a beat. */
  readonly limits?: BeatLimits
}

/**
 * Assemble one preview.
 * @param input - layouts, cards, lore, and the sample line.
 * @returns the assembled system prompt plus the entries that fired.
 * @throws Error when the character scope has no card to render.
 */
export function buildPreview(input: PreviewInput): PromptPreview {
  const sample = (input.sample ?? '').trim()
  const cards = input.cards.map(card => ({ id: card.id, name: card.name }))
  if (input.scope === 'director') {
    const cast: CastMember[] = input.cards.map(card => ({
      id: card.id,
      name: card.name,
      brief: cardBrief(card),
    }))
    const system = buildDirectorSystem({
      world: input.world ?? { scene: '', facts: [], hidden: [] },
      cast,
      stage: sampleStage(sample),
      layout: input.layout,
      worldbook: input.worldbook,
      playerInput: sample,
      ...(input.limits === undefined ? {} : { limits: input.limits }),
    })
    const lore = activateEntries({
      entries: input.worldbook,
      scanText: sample,
      recentLines: stageScanLines(sampleStage(sample)),
      reader: { kind: 'director' },
      ...(input.limits?.loreMaxEntries === undefined ? {} : { maxEntries: input.limits.loreMaxEntries }),
      ...(input.limits?.loreMaxChars === undefined ? {} : { maxChars: input.limits.loreMaxChars }),
    })
    return {
      scope: 'director',
      system,
      cards,
      lore: hitRefs(lore),
      loreChars: sumChars(lore),
      sample,
    }
  }

  const card = input.cardId === undefined
    ? input.cards[0]
    : input.cards.find(item => item.id === input.cardId) ?? input.cards[0]
  if (card === undefined) {
    throw new Error('这个酒馆还没有角色卡，无法预览角色提示词')
  }
  const entries = [...input.worldbook, ...fromCardEntries(card.entries)]
  const system = buildCharacterSystem({
    layout: input.layout,
    card,
    stage: sampleStage(sample),
    worldbook: entries,
    playerInput: sample,
    ...(input.persona === undefined ? {} : { persona: input.persona }),
    ...(input.personaById === undefined ? {} : { personaById: input.personaById }),
    ...(input.limits === undefined ? {} : { limits: input.limits }),
  })
  const lore = activateEntries({
    entries,
    scanText: sample,
    recentLines: stageScanLines(sampleStage(sample)),
    reader: { kind: 'character', characterId: card.id },
    ...(input.limits?.loreMaxEntries === undefined ? {} : { maxEntries: input.limits.loreMaxEntries }),
    ...(input.limits?.loreMaxChars === undefined ? {} : { maxChars: input.limits.loreMaxChars }),
  })
  const activated = lore
  return {
    scope: 'character',
    system,
    cardName: card.name,
    cards,
    lore: hitRefs(activated),
    loreChars: sumChars(activated),
    sample,
  }
}

/** Stage the sample line would create, so scans and rendering agree. */
function sampleStage(sample: string): StageEntry[] {
  if (sample.length === 0) return []
  return [{
    seq: 1,
    at: new Date(0).toISOString(),
    kind: 'narration',
    text: sample,
    scope: 'observable',
  }]
}

function hitRefs(entries: readonly WorldbookEntry[]): PreviewLoreHit[] {
  return entries.map(entry => ({
    id: entry.id,
    name: entry.name,
    visibility: entry.visibility,
    chars: entry.content.length,
  }))
}

function sumChars(entries: readonly WorldbookEntry[]): number {
  return entries.reduce((total, entry) => total + entry.content.length, 0)
}
