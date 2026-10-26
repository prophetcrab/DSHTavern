import { describe, expect, it } from 'vitest'
import { PANEL_CSS, STORY_CSS, TOOLBOX_CSS } from '../src/client/styles.ts'

/**
 * Structural guards for the two side headers. Both grew a third button when
 * import/export landed; with the title sharing one flex row it collapsed to
 * zero width, so these rules are load-bearing rather than cosmetic.
 */
const ALL_CSS = `${PANEL_CSS}\n${STORY_CSS}\n${TOOLBOX_CSS}`

/** Extract the last rule block for one exact selector (earlier ones may only declare tokens). */
function ruleFor(selector: string): string {
  const start = ALL_CSS.lastIndexOf(`${selector} {`)
  if (start === -1) return ''
  const end = ALL_CSS.indexOf('}', start)
  return end === -1 ? '' : ALL_CSS.slice(start, end)
}

describe('pre-chat opening card', () => {
  it('lives in the always-mounted stylesheet, not the toolbox overlay', () => {
    // The overlay only exists while its window is open, and the opening card
    // renders in the conversation dock — an overlay-only rule would leave it
    // completely unstyled, which is what happened when it shipped there.
    expect(PANEL_CSS).toContain('.dshtavern-greeting {')
    expect(PANEL_CSS).toContain('.dshtavern-opening-narration {')
    expect(TOOLBOX_CSS).not.toContain('.dshtavern-greeting {')
  })

  it('declares its tokens on the card element, outside the panel', () => {
    // The card is not inside `.dshtavern-panel`, so a panel-only `--tv-scale`
    // would leave every calc() unresolved. The turn-tail regeneration row has
    // the same problem: it renders in the conversation, not in the panel.
    expect(PANEL_CSS).toContain('.dshtavern-panel,\n.dshtavern-greeting,\n.dshtavern-regenerate-row,\n.dshtavern-image-turn,\n.dshtavern-image-workshop {')
    expect(PANEL_CSS).toContain('--tv-scale: 1;')
  })

  it('keeps the card from spanning the whole conversation width', () => {
    expect(ruleFor('.dshtavern-greeting')).toContain('max-width')
  })

  it('ships a generating state with a spinner', () => {
    // Generation is a real model call; without a waiting state the player sees
    // an empty pane and assumes nothing happened.
    expect(PANEL_CSS).toContain('.dshtavern-opening-spinner')
    expect(PANEL_CSS).toContain('@keyframes dshtavern-spin')
    expect(PANEL_CSS).toContain('.dshtavern-opening-loading-title')
  })

  it('stops the spinner for reduced-motion users', () => {
    const reduce = PANEL_CSS.slice(PANEL_CSS.indexOf('.dshtavern-opening-spinner'))
    expect(reduce).toContain('prefers-reduced-motion')
  })
})

describe('side header layout', () => {
  it.each([
    ['.dshtavern-wb-side-head', '.dshtavern-wb-side-title', '.dshtavern-wb-side-actions'],
    ['.dshtavern-character-side-head', '.dshtavern-character-side-title', '.dshtavern-character-side-actions'],
  ])('%s stacks a title row above an action row', (head, title, actions) => {
    expect(ruleFor(head)).toContain('flex-direction: column')
    expect(ruleFor(title)).toContain('display: flex')
    expect(ruleFor(actions)).toContain('display: flex')
  })

  it('counts never shrink, so the heading keeps the remaining width', () => {
    expect(ruleFor('.dshtavern-wb-count')).toContain('flex: none')
    expect(ruleFor('.dshtavern-character-count')).toContain('flex: none')
  })

  it('actions share the row evenly instead of overflowing it', () => {
    expect(ALL_CSS).toContain('.dshtavern-wb-side-actions .dshtavern-button { flex: 1 1 0;')
    expect(ALL_CSS).toContain('.dshtavern-character-side-actions .dshtavern-button { flex: 1 1 0;')
  })
})
