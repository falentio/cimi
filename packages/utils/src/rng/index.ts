const MASK_64 = (1n << 64n) - 1n
const UINT64_RANGE = 1n << 64n
const SPLITMIX_INCREMENT = 0x9e3779b97f4a7c15n
const SPLITMIX_MULTIPLIER_1 = 0xbf58476d1ce4e5b9n
const SPLITMIX_MULTIPLIER_2 = 0x94d049bb133111ebn

export type Xoroshiro128PlusPlusState = readonly [s0: bigint, s1: bigint]

export type Xoroshiro128PlusPlusOptions =
  | { readonly seed: bigint; readonly state?: never }
  | { readonly state: Xoroshiro128PlusPlusState; readonly seed?: never }

export interface Xoroshiro128PlusPlus {
  nextUint64(): bigint
  nextDouble(): number
  nextInt(maxExclusive: number): number
}

export function createXoroshiro128PlusPlus(
  options: Xoroshiro128PlusPlusOptions,
): Xoroshiro128PlusPlus {
  const initialState = parseOptions(options)
  let s0 = initialState[0]
  let s1 = initialState[1]

  const nextUint64 = (): bigint => {
    const previousS0 = s0
    const previousS1 = s1
    const result = (rotateLeft((previousS0 + previousS1) & MASK_64, 17n) + previousS0) & MASK_64

    s1 = (previousS1 ^ previousS0) & MASK_64
    s0 = (rotateLeft(previousS0, 49n) ^ s1 ^ ((s1 << 21n) & MASK_64)) & MASK_64
    s1 = rotateLeft(s1, 28n)

    return result & MASK_64
  }

  return {
    nextUint64,
    nextDouble() {
      return Number(nextUint64() >> 11n) / 2 ** 53
    },
    nextInt(maxExclusive) {
      validateMaxExclusive(maxExclusive)
      const bound = BigInt(maxExclusive)
      const limit = UINT64_RANGE - (UINT64_RANGE % bound)
      let value = nextUint64()

      while (value >= limit) {
        value = nextUint64()
      }

      return Number(value % bound)
    },
  }
}

function parseOptions(options: unknown): Xoroshiro128PlusPlusState {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('Options must contain exactly one seed or state')
  }

  if ('seed' in options) {
    if ('state' in options) {
      throw new TypeError('Options must contain exactly one seed or state')
    }
    return parseState(createSeedState(parseUint64(options.seed)))
  }

  if (!('state' in options)) {
    throw new TypeError('Options must contain exactly one seed or state')
  }

  return parseState(options.state)
}

function parseState(value: unknown): Xoroshiro128PlusPlusState {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError('State must contain exactly two unsigned 64-bit words')
  }

  const s0 = parseUint64(value[0])
  const s1 = parseUint64(value[1])

  if (s0 === 0n && s1 === 0n) {
    throw new RangeError('State must not be all zero')
  }

  return [s0, s1]
}

function parseUint64(value: unknown): bigint {
  if (typeof value !== 'bigint') {
    throw new TypeError('State words must be bigint values')
  }
  if (value < 0n || value > MASK_64) {
    throw new RangeError('State words must be unsigned 64-bit values')
  }
  return value
}

function createSeedState(seed: bigint): Xoroshiro128PlusPlusState {
  let splitmixState = seed

  return [nextSplitmix64(), nextSplitmix64()]

  function nextSplitmix64(): bigint {
    splitmixState = (splitmixState + SPLITMIX_INCREMENT) & MASK_64
    let value = splitmixState
    value = ((value ^ ((value >> 30n) & MASK_64)) * SPLITMIX_MULTIPLIER_1) & MASK_64
    value = ((value ^ ((value >> 27n) & MASK_64)) * SPLITMIX_MULTIPLIER_2) & MASK_64
    return (value ^ ((value >> 31n) & MASK_64)) & MASK_64
  }
}

function rotateLeft(value: bigint, shift: bigint): bigint {
  value &= MASK_64
  return (((value << shift) & MASK_64) | ((value >> (64n - shift)) & MASK_64)) & MASK_64
}

function validateMaxExclusive(maxExclusive: number): void {
  if (typeof maxExclusive !== 'number') {
    throw new TypeError('maxExclusive must be a number')
  }
  if (
    !Number.isSafeInteger(maxExclusive) ||
    maxExclusive < 1 ||
    maxExclusive > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError('maxExclusive must be an integer from 1 through Number.MAX_SAFE_INTEGER')
  }
}
