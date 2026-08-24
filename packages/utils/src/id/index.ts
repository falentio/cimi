const DAY_IN_MILLISECONDS = 86_400_000
const DAY_MODULUS = 65_536
const TIME_FRAGMENT_BYTES = 2
const ENTROPY_BYTES = 14
const ENTROPY_POOL_SIZE = 65_536
const ID_FRAGMENT_BYTES = TIME_FRAGMENT_BYTES + ENTROPY_BYTES
const ID_FRAGMENT_LENGTH = Math.ceil((ID_FRAGMENT_BYTES * 8) / 5)
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

export type EntityId<Prefix extends string> = `${Prefix}_${string}`

// TODO: Adopt this utility in packages/db and apps/api when entity identifier migrations land.
export interface IdGeneratorOptions {
  readonly now?: () => number
  readonly getRandomValues?: (bytes: Uint8Array<ArrayBuffer>) => void
}

export function createIdGenerator(options: IdGeneratorOptions = {}) {
  const now = options.now ?? (() => Date.now())
  const getRandomValues =
    options.getRandomValues ??
    ((bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes))
  const entropyPool = new Uint8Array(ENTROPY_POOL_SIZE)
  let entropyOffset = ENTROPY_POOL_SIZE

  return function generate<const Prefix extends string>(prefix: Prefix): EntityId<Prefix> {
    validatePrefix(prefix)

    const timeFragment = getTimeFragment(now)
    const entropy = takeEntropy()
    return `${prefix}_${encodeIdFragment(timeFragment, entropy)}` as EntityId<Prefix>

    function takeEntropy(): Uint8Array {
      if (entropyOffset + ENTROPY_BYTES > ENTROPY_POOL_SIZE) {
        getRandomValues(entropyPool)
        entropyOffset = 0
      }

      const entropy = entropyPool.subarray(entropyOffset, entropyOffset + ENTROPY_BYTES)
      entropyOffset += ENTROPY_BYTES
      return entropy
    }
  }
}

const defaultGenerateId = createIdGenerator()

export function generateId<const Prefix extends string>(prefix: Prefix): EntityId<Prefix> {
  return defaultGenerateId(prefix)
}

function validatePrefix(prefix: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(prefix)) {
    throw new TypeError('ID prefix must match [a-z][a-z0-9-]*')
  }
}

function getTimeFragment(now: () => number): number {
  const day = Math.floor(now() / DAY_IN_MILLISECONDS)
  return ((day % DAY_MODULUS) + DAY_MODULUS) % DAY_MODULUS
}

function encodeIdFragment(timeFragment: number, entropy: Uint8Array): string {
  let buffer = timeFragment
  let bits = TIME_FRAGMENT_BYTES * 8
  let encoded = ''

  for (const byte of entropy) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      encoded += BASE32_ALPHABET[(buffer >> bits) & 31]!
      buffer &= (1 << bits) - 1
    }
  }

  if (bits > 0) {
    encoded += BASE32_ALPHABET[(buffer << (5 - bits)) & 31]!
  }

  return encoded.padStart(ID_FRAGMENT_LENGTH, 'A')
}
