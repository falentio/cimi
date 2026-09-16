import { describe, expect, it } from 'vitest'

import {
  createXoroshiro128PlusPlus,
  type Xoroshiro128PlusPlus,
  type Xoroshiro128PlusPlusOptions,
  type Xoroshiro128PlusPlusState,
} from '../index.ts'

const MASK = (1n << 64n) - 1n

function createAtRuntime(value: unknown): unknown {
  return Reflect.apply(createXoroshiro128PlusPlus, undefined, [value])
}

function nextIntAtRuntime(generator: Xoroshiro128PlusPlus, maxExclusive: unknown): unknown {
  return Reflect.apply(generator.nextInt, generator, [maxExclusive])
}

describe('createXoroshiro128PlusPlus', () => {
  it('exposes the selected typed options and generator interface', () => {
    const state: Xoroshiro128PlusPlusState = [1n, 2n]
    const seedOptions: Xoroshiro128PlusPlusOptions = { seed: 1n }
    const stateOptions: Xoroshiro128PlusPlusOptions = { state }
    const generator: Xoroshiro128PlusPlus = createXoroshiro128PlusPlus(seedOptions)

    expect(generator.nextUint64()).toBeTypeOf('bigint')
    expect(generator.nextDouble()).toBeTypeOf('number')
    expect(generator.nextInt(10)).toBeGreaterThanOrEqual(0)
    expect(createXoroshiro128PlusPlus(stateOptions).nextUint64()).toBe(
      createXoroshiro128PlusPlus({ state }).nextUint64(),
    )

    // @ts-expect-error
    const invalidOptionsWithBoth: Xoroshiro128PlusPlusOptions = {
      seed: 1n,
      state,
    }
    void invalidOptionsWithBoth

    // @ts-expect-error
    const invalidOptionsWithNeither: Xoroshiro128PlusPlusOptions = {}
    void invalidOptionsWithNeither
  })

  it('follows the official transition for a known state vector', () => {
    const generator = createXoroshiro128PlusPlus({
      state: [0x0123456789abcdefn, 0xfedcba9876543210n],
    })

    expect([
      generator.nextUint64(),
      generator.nextUint64(),
      generator.nextUint64(),
      generator.nextUint64(),
    ]).toEqual([0x0123456789abcdeen, 0xa06b17e864202464n, 0xcc9792ef68e54a58n, 0xa2ae0ceb8a9b12a3n])
  })

  it('masks 64-bit addition and state transitions', () => {
    const generator = createXoroshiro128PlusPlus({ state: [MASK, 1n] })

    expect(generator.nextUint64()).toBe(MASK)
    expect(generator.nextUint64()).toBe(0xffffdf7fffc20000n)
  })

  it('expands a seed with two consecutive SplitMix64 outputs', () => {
    const generator = createXoroshiro128PlusPlus({ seed: 0n })
    const explicitState = createXoroshiro128PlusPlus({
      state: [0xe220a8397b1dcdafn, 0x6e789e6aa1b965f4n],
    })

    expect([
      generator.nextUint64(),
      generator.nextUint64(),
      generator.nextUint64(),
      generator.nextUint64(),
    ]).toEqual([0x6f68e1e7e2646ee1n, 0xbf971b7f454094adn, 0x48f2de556f30de38n, 0x6ea7c59f89bbfc75n])
    expect(explicitState.nextUint64()).toBe(0x6f68e1e7e2646ee1n)
  })

  it('is deterministic for equal seeds', () => {
    const first = createXoroshiro128PlusPlus({ seed: 123456789n })
    const second = createXoroshiro128PlusPlus({ seed: 123456789n })

    expect(Array.from({ length: 32 }, () => first.nextUint64())).toEqual(
      Array.from({ length: 32 }, () => second.nextUint64()),
    )
  })

  it('is deterministic for equal explicit states', () => {
    const state: Xoroshiro128PlusPlusState = [0x123456789abcdef0n, 0x0fedcba987654321n]
    const first = createXoroshiro128PlusPlus({ state })
    const second = createXoroshiro128PlusPlus({ state: [...state] })

    expect(Array.from({ length: 32 }, () => first.nextUint64())).toEqual(
      Array.from({ length: 32 }, () => second.nextUint64()),
    )
  })

  it('copies an explicit state at creation', () => {
    const mutableState: [bigint, bigint] = [1n, 2n]
    const generator = createXoroshiro128PlusPlus({ state: mutableState })
    const expected = createXoroshiro128PlusPlus({ state: [1n, 2n] })

    mutableState[0] = MASK
    mutableState[1] = MASK

    expect(generator.nextUint64()).toBe(expected.nextUint64())
  })

  it('rejects invalid options and explicit states at the boundary', () => {
    expect(() => createAtRuntime(null)).toThrowError(TypeError)
    expect(() => createAtRuntime({})).toThrowError(TypeError)
    expect(() => createAtRuntime({ seed: 1n, state: [1n, 2n] })).toThrowError(TypeError)
    expect(() => createAtRuntime({ seed: 1 })).toThrowError(TypeError)
    expect(() => createAtRuntime({ state: [1n] })).toThrowError(TypeError)
    expect(() => createAtRuntime({ state: [1n, 2] })).toThrowError(TypeError)
    expect(() => createAtRuntime({ seed: -1n })).toThrowError(RangeError)
    expect(() => createAtRuntime({ seed: MASK + 1n })).toThrowError(RangeError)
    expect(() => createAtRuntime({ state: [-1n, 0n] })).toThrowError(RangeError)
    expect(() => createAtRuntime({ state: [0n, MASK + 1n] })).toThrowError(RangeError)
    expect(() => createAtRuntime({ state: [0n, 0n] })).toThrowError(RangeError)
  })

  it('converts one output to an exact double in the half-open unit interval', () => {
    const low = createXoroshiro128PlusPlus({ state: [0n, 1n] })
    const high = createXoroshiro128PlusPlus({ state: [0n, MASK] })

    expect(low.nextDouble()).toBe(2 ** -47)
    expect(high.nextDouble()).toBe(Number(MASK >> 11n) / 2 ** 53)
    expect(high.nextDouble()).toBeLessThan(1)
    expect(high.nextDouble()).toBeGreaterThanOrEqual(0)
  })

  it('consumes exactly one output for nextDouble', () => {
    const generator = createXoroshiro128PlusPlus({ state: [0n, 1n] })
    const expected = createXoroshiro128PlusPlus({ state: [0n, 1n] })

    expected.nextUint64()
    const expectedNext = expected.nextUint64()

    generator.nextDouble()

    expect(generator.nextUint64()).toBe(expectedNext)
  })

  it('validates nextInt bounds and keeps results within varied ranges', () => {
    const invalidBounds = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]

    for (const maxExclusive of invalidBounds) {
      expect(() => createXoroshiro128PlusPlus({ seed: 1n }).nextInt(maxExclusive)).toThrowError(
        RangeError,
      )
    }
    expect(() => nextIntAtRuntime(createXoroshiro128PlusPlus({ seed: 1n }), '10')).toThrowError(
      TypeError,
    )

    const generator = createXoroshiro128PlusPlus({ seed: 987654321n })
    expect(generator.nextInt(1)).toBe(0)

    for (const maxExclusive of [1, 2, 3, 7, 10, 257, Number.MAX_SAFE_INTEGER]) {
      const values = Array.from({ length: 128 }, () => generator.nextInt(maxExclusive))

      expect(values.every((value) => value >= 0 && value < maxExclusive)).toBe(true)
    }
  })

  it('rejects an outlying output before returning a nextInt result', () => {
    const reference = createXoroshiro128PlusPlus({ state: [0n, MASK] })
    expect(reference.nextUint64()).toBe(MASK)
    const expected = reference.nextUint64() % 3n
    expect(expected).not.toBe(MASK)

    const generator = createXoroshiro128PlusPlus({ state: [0n, MASK] })

    expect(generator.nextInt(3)).toBe(Number(expected))
  })
})
