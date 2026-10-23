import { describe, expect, it } from 'vitest'
import { replyPrefix, speakerNameOf } from '../src/client/reply-to.ts'

/**
 * Minimal element stub standing in for the rendered transcript.
 *
 * The module reads only `tagName`, `closest`, `firstElementChild`, and one
 * scoped query, so a plain object models the paragraph without pulling a DOM
 * implementation into an offline test.
 * @param options - the paragraph's tag, its name text, and the quote around it.
 * @returns an object usable wherever the module expects an Element.
 */
function paragraph(options: {
  readonly isFirstChild: boolean
  readonly name?: string | undefined
  readonly tagName?: string
}): { closest: (selector: string) => unknown } {
  // The quote points back at this exact object: the module compares identity
  // (`first !== element`), so a copy would model the wrong case.
  const element: Record<string, unknown> = {
    tagName: options.tagName ?? 'P',
    firstElementChild: null,
    querySelector: (selector: string) => (selector === ':scope > strong:only-child' && options.name !== undefined
      ? { textContent: options.name }
      : null),
  }
  const quote = {
    firstElementChild: options.isFirstChild ? element : { tagName: 'P', querySelector: () => null },
  }
  element.closest = (selector: string) => (selector === 'blockquote' ? quote : null)
  return element as { closest: (selector: string) => unknown }
}

describe('speaker name detection', () => {
  it('reads the name from a bubble’s first bold-only paragraph', () => {
    expect(speakerNameOf(paragraph({ isFirstChild: true, name: '白鹭' }) as never)).toBe('白鹭')
  })

  it('ignores a paragraph that is not the bubble’s first child', () => {
    expect(speakerNameOf(paragraph({ isFirstChild: false, name: '白鹭' }) as never)).toBeUndefined()
  })

  it('ignores prose outside a blockquote and empty names', () => {
    const plain = paragraph({ isFirstChild: true, name: '白鹭' })
    expect(speakerNameOf({ ...plain, closest: () => null } as never)).toBeUndefined()
    expect(speakerNameOf(paragraph({ isFirstChild: true, name: '   ' }) as never)).toBeUndefined()
  })

  it('prefills an addressed line rather than a script-style speaker tag', () => {
    // The tavern routes a reply to whoever the player names, so the prefix is
    // what carries that name; it must read as prose the player finishes.
    expect(replyPrefix('白鹭')).toBe('对白鹭说：')
  })
})
