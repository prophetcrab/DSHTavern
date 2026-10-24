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
export function selectOpening(cards) {
    let narration;
    for (const card of cards) {
        const text = card.scenario.trim();
        if (text.length === 0)
            continue;
        narration = { cardId: card.id, text };
        break;
    }
    const greeting = selectGreeting(cards);
    return {
        ...(narration === undefined ? {} : { narration }),
        ...(greeting === undefined ? {} : { greeting }),
    };
}
/** @param opening - resolved opening. @returns whether it shows anything at all. */
export function hasOpening(opening) {
    return opening.narration !== undefined || opening.greeting !== undefined;
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
export function selectGreeting(cards) {
    for (const card of cards) {
        const text = card.greetings.first.trim();
        if (text.length === 0)
            continue;
        return { cardId: card.id, name: card.name, text };
    }
    return undefined;
}
/**
 * Render the opening narration as a staged line.
 * @param narration - resolved scene setting.
 * @returns the stage fields to append.
 */
export function openingNarrationStageLine(narration) {
    return { kind: 'narration', text: narration.text, scope: 'observable' };
}
/**
 * Render a greeting as the character's first staged line.
 *
 * It is a speech entry, not narration: the player reads it as something the
 * character said, which is what the card authored.
 * @param greeting - resolved opening line.
 * @returns the stage fields to append.
 */
export function greetingStageLine(greeting) {
    return {
        kind: 'speech',
        speaker: greeting.cardId,
        speakerName: greeting.name,
        text: greeting.text,
        scope: 'observable',
    };
}
