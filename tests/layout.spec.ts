import { describe, expect, it } from 'vitest'
import { PANEL_CSS, STORY_CSS, TOOLBOX_CSS } from '../src/client/styles.ts'

/**
 * Structural guards for the two side headers. Both grew a third button when
 * import/export landed; with the title sharing one flex row it collapsed to
 * zero width, so these rules are load-bearing rather than cosmetic.
 */
const ALL_CSS = `${PANEL_CSS}\n${STORY_CSS}\n${TOOLBOX_CSS}`

/** Extract one rule block by selector. */
function ruleFor(selector: string): string {
  const start = ALL_CSS.indexOf(`${selector} {`)
  if (start === -1) return ''
  const end = ALL_CSS.indexOf('}', start)
  return end === -1 ? '' : ALL_CSS.slice(start, end)
}

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
