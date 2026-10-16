import { describe, expect, it } from 'vitest'

import { createXoroshiro128PlusPlus, seedFromString } from '../index.ts'

describe('seedFromString', () => {
  it('hashes the empty string to the FNV-1a 64-bit offset basis', () => {
    expect(seedFromString('')).toBe(0xcbf29ce484222325n)
  })

  it('is stable for a string and separated for two strings', () => {
    expect(seedFromString('ste_demo')).toBe(seedFromString('ste_demo'))
    expect(seedFromString('ab')).not.toBe(seedFromString('ba'))
    expect(seedFromString('ste_demo')).not.toBe(seedFromString('ste_other'))
  })

  it('stays an unsigned 64-bit word', () => {
    for (const value of ['', 'a', 'ste_demo', '\u0000', '\u{1f600}']) {
      const seed = seedFromString(value)

      expect(seed).toBeGreaterThanOrEqual(0n)
      expect(seed).toBeLessThan(1n << 64n)
    }
  })

  it('drives the same stream for the same text', () => {
    const first = createXoroshiro128PlusPlus({ seed: seedFromString('ste_demo') })
    const second = createXoroshiro128PlusPlus({ seed: seedFromString('ste_demo') })

    expect([first.nextDouble(), first.nextDouble(), first.nextInt(1_000)]).toEqual([
      second.nextDouble(),
      second.nextDouble(),
      second.nextInt(1_000),
    ])
  })
})
