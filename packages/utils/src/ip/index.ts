import { Address4, Address6 } from 'ip-address'

export type IpFamily = 4 | 6
export type IpPatternKind = 'address' | 'cidr' | 'range'

export interface ParsedIpPattern {
  readonly kind: IpPatternKind
  readonly family: IpFamily
  readonly source: string
  matches(ip: string): boolean
}

export interface IpMatcher {
  matches(ip: string): boolean
}

type IpAddress = Address4 | Address6

interface CompiledIpPattern {
  readonly kind: IpPatternKind
  readonly family: IpFamily
  readonly source: string
  matchesAddress(ip: PreparedIpAddress): boolean
  readonly needsCanonical: boolean
  readonly needsValue: boolean
}

interface PreparedIpAddress {
  readonly family: IpFamily
  readonly canonical?: string
  readonly value?: bigint
}

interface PatternGroup {
  readonly patterns: readonly CompiledIpPattern[]
  readonly needsCanonical: boolean
  readonly needsValue: boolean
}

export function parseIpPattern(value: string): ParsedIpPattern | null {
  const compiled = compileIpPattern(value)
  if (!compiled) return null

  return {
    kind: compiled.kind,
    family: compiled.family,
    source: compiled.source,
    matches: (ip) => {
      const address = parseIpAddress(ip)
      return address !== null && compiled.matchesAddress(prepareIpAddress(address, compiled))
    },
  }
}

export function createIpMatcher(patterns: readonly string[]): IpMatcher {
  const compiled = patterns.map((pattern) => {
    const result = compileIpPattern(pattern)
    if (!result) {
      throw new TypeError(`Invalid IP pattern: ${pattern}`)
    }
    return result
  })

  const ipv4Patterns = compiled.filter((pattern) => pattern.family === 4)
  const ipv6Patterns = compiled.filter((pattern) => pattern.family === 6)
  const ipv4Group = createPatternGroup(ipv4Patterns)
  const ipv6Group = createPatternGroup(ipv6Patterns)

  return {
    matches(ip) {
      const address = parseIpAddress(ip)
      if (!address) return false

      const group = address instanceof Address4 ? ipv4Group : ipv6Group
      const prepared = prepareIpAddress(address, group)
      return group.patterns.some((pattern) => pattern.matchesAddress(prepared))
    },
  }
}

function compileIpPattern(value: string): CompiledIpPattern | null {
  const source = value.trim()
  if (!source) return null

  if (source.includes('/')) {
    return compileCidr(source)
  }

  if (source.includes('-')) {
    return compileRange(source)
  }

  const address = parseIpAddress(source)
  if (!address) return null
  const canonical = address.correctForm()

  return {
    kind: 'address',
    family: address instanceof Address4 ? 4 : 6,
    source,
    needsCanonical: true,
    needsValue: false,
    matchesAddress: (candidate) => candidate.canonical === canonical,
  }
}

function compileCidr(source: string): CompiledIpPattern | null {
  try {
    const address = source.includes(':') ? new Address6(source) : new Address4(source)
    const family: IpFamily = address instanceof Address4 ? 4 : 6
    const mask = createSubnetMask(family, address.subnetMask)
    const network = address.bigInt() & mask
    return {
      kind: 'cidr',
      family,
      source,
      needsCanonical: false,
      needsValue: true,
      matchesAddress: (candidate) =>
        candidate.family === family &&
        candidate.value !== undefined &&
        (candidate.value & mask) === network,
    }
  } catch {
    return null
  }
}

function compileRange(source: string): CompiledIpPattern | null {
  const parts = source.split('-')
  if (parts.length !== 2) return null

  const start = parseIpAddress(parts[0]!.trim())
  const end = parseIpAddress(parts[1]!.trim())
  if (!(start instanceof Address4) || !(end instanceof Address4)) return null
  const startValue = start.bigInt()
  const endValue = end.bigInt()
  if (startValue > endValue) return null

  return {
    kind: 'range',
    family: 4,
    source,
    needsCanonical: false,
    needsValue: true,
    matchesAddress: (candidate) =>
      candidate.family === 4 &&
      candidate.value !== undefined &&
      candidate.value >= startValue &&
      candidate.value <= endValue,
  }
}

function parseIpAddress(value: string): IpAddress | null {
  if (value.includes('/') || value.includes('%')) return null

  try {
    return value.includes(':') ? new Address6(value) : new Address4(value)
  } catch {
    return null
  }
}

function prepareIpAddress(
  address: IpAddress,
  requirements: Pick<PatternGroup, 'needsCanonical' | 'needsValue'>,
): PreparedIpAddress {
  return {
    family: address instanceof Address4 ? 4 : 6,
    ...(requirements.needsCanonical ? { canonical: address.correctForm() } : {}),
    ...(requirements.needsValue ? { value: address.bigInt() } : {}),
  }
}

function createPatternGroup(patterns: readonly CompiledIpPattern[]): PatternGroup {
  return {
    patterns,
    needsCanonical: patterns.some((pattern) => pattern.needsCanonical),
    needsValue: patterns.some((pattern) => pattern.needsValue),
  }
}

function createSubnetMask(family: IpFamily, subnetMask: number): bigint {
  const bits = BigInt(family === 4 ? 32 : 128)
  if (subnetMask === 0) return 0n
  return ((1n << bits) - 1n) ^ ((1n << (bits - BigInt(subnetMask))) - 1n)
}
