import { describe, expect, it } from 'vitest'
import { TAVERN_ROW_ATTRIBUTE, applyMark, tavernWorkspaceIdOf } from '../src/client/marks.ts'
import type { MarkableRow } from '../src/client/marks.ts'

/** A row that records the attribute operations applied to it. */
function row(rowKey: string | null, marked = false): MarkableRow & { marked: boolean } {
  return {
    rowKey,
    marked,
    setAttribute(name, value) {
      if (name === TAVERN_ROW_ATTRIBUTE && value === 'true') this.marked = true
    },
    removeAttribute(name) {
      if (name === TAVERN_ROW_ATTRIBUTE) this.marked = false
    },
  }
}

describe('tavernWorkspaceIdOf', () => {
  it('reads the id from a workspace row key', () => {
    expect(tavernWorkspaceIdOf('workspace:dfaebbbe-9163-4c79')).toBe('dfaebbbe-9163-4c79')
  })

  it('rejects the ungrouped bucket, other row kinds, and absent keys', () => {
    expect(tavernWorkspaceIdOf('workspace:')).toBeUndefined()
    expect(tavernWorkspaceIdOf('session:abc')).toBeUndefined()
    expect(tavernWorkspaceIdOf(null)).toBeUndefined()
    expect(tavernWorkspaceIdOf('')).toBeUndefined()
  })
})

describe('applyMark', () => {
  const taverns = new Set(['w1', 'w2'])

  it('marks a workspace the registry reports', () => {
    const target = row('workspace:w1')
    expect(applyMark(target, taverns)).toBe(true)
    expect(target.marked).toBe(true)
  })

  it('leaves an ordinary workspace unmarked', () => {
    const target = row('workspace:w3')
    expect(applyMark(target, taverns)).toBe(false)
    expect(target.marked).toBe(false)
  })

  it('clears a stale mark after the workspace stops being a tavern', () => {
    const target = row('workspace:w1', true)
    applyMark(target, new Set(['w2']))
    expect(target.marked).toBe(false)
  })

  it('never marks the ungrouped bucket', () => {
    const target = row('workspace:')
    expect(applyMark(target, new Set(['']))).toBe(false)
    expect(target.marked).toBe(false)
  })
})
