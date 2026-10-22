import { describe, expect, it } from 'vitest'
import { finalReplacement } from '../src/client/regenerate.ts'

describe('finalReplacement', () => {
  it('returns nothing for a turn that still stands', () => {
    expect(finalReplacement(new Map(), 3)).toBeUndefined()
    expect(finalReplacement(new Map([[2, 3]]), 3)).toBeUndefined()
  })

  it('follows one replacement', () => {
    expect(finalReplacement(new Map([[2, 3]]), 2)).toBe(3)
  })

  it('follows a chain to the reply that currently stands', () => {
    // Regenerating a regeneration adds a hop; the older marker must name the
    // reply the player can actually read.
    expect(finalReplacement(new Map([[2, 3], [3, 4], [4, 5]]), 2)).toBe(5)
  })

  it('stops at a corrupted cycle instead of looping forever', () => {
    expect(finalReplacement(new Map([[2, 3], [3, 2]]), 2)).toBe(2)
  })
})
