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
