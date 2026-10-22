/**
 * Opening line for a fresh tavern story.
 *
 * A character card may carry `greetings.first`: the line that character says
 * before the player does anything. The stage cannot show it on its own — a beat
 * only runs after the player speaks — so the greeting is delivered two ways:
 * the client renders it above the composer while the chat is still blank, and
 * the orchestrator seeds it into the stage on the first beat so the director and
 * every character read it as history.
 *
 * A tavern holds several characters, so "the greeting" needs a deterministic
 * owner. The rules below pick the first card, in the same order the director's
 * roster uses, that actually defines one: a card with an empty greeting should
 * not silence a card that has one.
 */
import type { CharacterCard } from './character-card.js'

/** One resolved opening line. */
export interface TavernGreeting {
  /** Card that owns the line. */
  readonly cardId: string
  /** Card display name, so the client can label the bubble. */
  readonly name: string
  /** The line itself. */
  readonly text: string
}

/** The scene-setting narration an opening shows before any character speaks. */
export interface TavernOpeningNarration {
  /** Card whose `scenario` supplied the text. */
  readonly cardId: string
  /** The narration itself. */
  readonly text: string
}

/** Everything a blank chat shows before the player speaks. */
export interface TavernOpening {
  /** Scene setting drawn from the first card that defines a `scenario`. */
  readonly narration?: TavernOpeningNarration
  /** First character line drawn from the first card that defines a greeting. */
  readonly greeting?: TavernGreeting
}

/**
 * Resolve a tavern's opening: the scene, then the first line spoken.
 *
 * The scene comes from a card's `scenario`, which the author already writes as
 * "where we are" — it reached the character prompt but never the player. The
 * line comes from a card's `greetings.first`. They are resolved independently,
 * so a cast whose first card has a scene but no greeting still opens with the
 * scene.
 * @param cards - the workspace's cards, in roster order.
 * @returns the opening; both fields are absent when no card defines them.
 */
export function selectOpening(cards: readonly CharacterCard[]): TavernOpening {
  let narration: TavernOpeningNarration | undefined
  for (const card of cards) {
    const text = card.scenario.trim()
    if (text.length === 0) continue
    narration = { cardId: card.id, text }
    break
  }
  const greeting = selectGreeting(cards)
  return {
    ...(narration === undefined ? {} : { narration }),
    ...(greeting === undefined ? {} : { greeting }),
  }
}

/** @param opening - resolved opening. @returns whether it shows anything at all. */
export function hasOpening(opening: TavernOpening): boolean {
  return opening.narration !== undefined || opening.greeting !== undefined
}

/**
 * Pick the opening line for a tavern's cast.
 *
 * Only `greetings.first` participates; `alternates` exist for re-rolling an
 * opening, which this build does not offer yet. The text is trimmed: a card
 * pasted from elsewhere often carries stray indentation that would show up as
 * leading spaces in the bubble.
 * @param cards - the workspace's cards, in roster order.
 * @returns the opening line, or `undefined` when no card defines one.
 */
export function selectGreeting(cards: readonly CharacterCard[]): TavernGreeting | undefined {
  for (const card of cards) {
    const text = card.greetings.first.trim()
    if (text.length === 0) continue
    return { cardId: card.id, name: card.name, text }
  }
  return undefined
}

/**
 * Render the opening narration as a staged line.
 * @param narration - resolved scene setting.
 * @returns the stage fields to append.
 */
export function openingNarrationStageLine(narration: TavernOpeningNarration): {
  readonly kind: 'narration'
  readonly text: string
  readonly scope: 'observable'
} {
  return { kind: 'narration', text: narration.text, scope: 'observable' }
}

/**
 * Render a greeting as the character's first staged line.
 *
 * It is a speech entry, not narration: the player reads it as something the
 * character said, which is what the card authored.
 * @param greeting - resolved opening line.
 * @returns the stage fields to append.
 */
export function greetingStageLine(greeting: TavernGreeting): {
  readonly kind: 'speech'
  readonly speaker: string
  readonly speakerName: string
  readonly text: string
  readonly scope: 'observable'
} {
  return {
    kind: 'speech',
    speaker: greeting.cardId,
    speakerName: greeting.name,
    text: greeting.text,
    scope: 'observable',
  }
}
