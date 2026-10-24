import { buildCharacterSystem, buildDirectorSystem, cardBrief, } from './orchestrator.js';
import { activateEntries, fromCardEntries, stageScanLines } from './worldbook.js';
/**
 * Assemble one preview.
 * @param input - layouts, cards, lore, and the sample line.
 * @returns the assembled system prompt plus the entries that fired.
 * @throws Error when the character scope has no card to render.
 */
export function buildPreview(input) {
    const sample = (input.sample ?? '').trim();
    const cards = input.cards.map(card => ({ id: card.id, name: card.name }));
    if (input.scope === 'director') {
        const cast = input.cards.map(card => ({
            id: card.id,
            name: card.name,
            brief: cardBrief(card),
        }));
        const system = buildDirectorSystem({
            world: input.world ?? { scene: '', facts: [], hidden: [] },
            cast,
            stage: sampleStage(sample),
            layout: input.layout,
            worldbook: input.worldbook,
            playerInput: sample,
            ...(input.limits === undefined ? {} : { limits: input.limits }),
        });
        const lore = activateEntries({
            entries: input.worldbook,
            scanText: sample,
            recentLines: stageScanLines(sampleStage(sample)),
            reader: { kind: 'director' },
            ...(input.limits?.loreMaxEntries === undefined ? {} : { maxEntries: input.limits.loreMaxEntries }),
            ...(input.limits?.loreMaxChars === undefined ? {} : { maxChars: input.limits.loreMaxChars }),
        });
        return {
            scope: 'director',
            system,
            cards,
            lore: hitRefs(lore),
            loreChars: sumChars(lore),
            sample,
        };
    }
    const card = input.cardId === undefined
        ? input.cards[0]
        : input.cards.find(item => item.id === input.cardId) ?? input.cards[0];
    if (card === undefined) {
        throw new Error('这个酒馆还没有角色卡，无法预览角色提示词');
    }
    const entries = [...input.worldbook, ...fromCardEntries(card.entries)];
    const system = buildCharacterSystem({
        layout: input.layout,
        card,
        stage: sampleStage(sample),
        worldbook: entries,
        playerInput: sample,
        ...(input.persona === undefined ? {} : { persona: input.persona }),
        ...(input.personaById === undefined ? {} : { personaById: input.personaById }),
        ...(input.limits === undefined ? {} : { limits: input.limits }),
    });
    const lore = activateEntries({
        entries,
        scanText: sample,
        recentLines: stageScanLines(sampleStage(sample)),
        reader: { kind: 'character', characterId: card.id },
        ...(input.limits?.loreMaxEntries === undefined ? {} : { maxEntries: input.limits.loreMaxEntries }),
        ...(input.limits?.loreMaxChars === undefined ? {} : { maxChars: input.limits.loreMaxChars }),
    });
    const activated = lore;
    return {
        scope: 'character',
        system,
        cardName: card.name,
        cards,
        lore: hitRefs(activated),
        loreChars: sumChars(activated),
        sample,
    };
}
/** Stage the sample line would create, so scans and rendering agree. */
function sampleStage(sample) {
    if (sample.length === 0)
        return [];
    return [{
            seq: 1,
            at: new Date(0).toISOString(),
            kind: 'narration',
            text: sample,
            scope: 'observable',
        }];
}
function hitRefs(entries) {
    return entries.map(entry => ({
        id: entry.id,
        name: entry.name,
        visibility: entry.visibility,
        chars: entry.content.length,
    }));
}
function sumChars(entries) {
    return entries.reduce((total, entry) => total + entry.content.length, 0);
}
