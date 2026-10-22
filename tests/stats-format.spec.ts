import { describe, expect, it } from 'vitest'
import { formatPercent, formatTokens } from '../src/client/stats.ts'

describe('formatTokens', () => {
  it('shows small counts verbatim', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('compacts thousands and millions with stable precision', () => {
    expect(formatTokens(1000)).toBe('1.00k')
    expect(formatTokens(12_150)).toBe('12.2k')
    expect(formatTokens(999_999)).toBe('1000.0k')
    expect(formatTokens(1_500_000)).toBe('1.50M')
  })

  it('renders an absent value as a dash', () => {
    expect(formatTokens(undefined)).toBe('—')
  })
})

describe('formatPercent', () => {
  it('uses two decimals for small ratios and one above ten percent', () => {
    expect(formatPercent(0.0105)).toBe('1.05%')
    expect(formatPercent(0.123)).toBe('12.3%')
    expect(formatPercent(1)).toBe('100.0%')
  })

  it('renders an absent or non-finite ratio as a dash', () => {
    expect(formatPercent(undefined)).toBe('—')
    expect(formatPercent(Number.NaN)).toBe('—')
  })
})
