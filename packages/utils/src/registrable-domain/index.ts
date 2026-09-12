import { Address4, Address6 } from 'ip-address'
import * as psl from 'psl'

// TODO: Consume from apps/api origin normalization and apps/web domain grouping once their contracts settle.
export function getRegistrableDomain(input: string): string | null {
  const hostname = extractHostname(input)
  if (!hostname) return null

  const normalizedHostname = normalizeHostname(hostname)
  if (!normalizedHostname) return null

  if (isIp(normalizedHostname)) return normalizedHostname
  if (normalizedHostname === 'localhost') return normalizedHostname

  const parsed = psl.parse(normalizedHostname)
  if ('error' in parsed) return null
  if (!parsed.domain) return parsed.listed ? null : normalizedHostname

  return parsed.domain
}

function extractHostname(input: string): string | null {
  const value = input.trim()
  if (value === '') return null

  if (value.includes('://')) {
    try {
      return new URL(value).hostname
    } catch {
      return null
    }
  }

  if (value.startsWith('//') || /[/?#]/.test(value)) return null
  if (isIp(value) || isBracketedIpv6(value)) return value
  if (value.includes(':')) return null

  return value
}

function normalizeHostname(hostname: string): string | null {
  const unbracketed = isBracketedIpv6(hostname) ? hostname.slice(1, -1) : hostname
  if (isIp(unbracketed)) return unbracketed.toLowerCase()

  const withoutTrailingDot = unbracketed.endsWith('.') ? unbracketed.slice(0, -1) : unbracketed
  if (withoutTrailingDot === '' || withoutTrailingDot.endsWith('.')) return null
  if (isNumericHostAlias(withoutTrailingDot)) return null

  const ascii = toAsciiHostname(withoutTrailingDot).toLowerCase()
  return ascii === '' || isIp(ascii) ? null : ascii
}

function isBracketedIpv6(value: string): boolean {
  return value.startsWith('[') && value.endsWith(']') && isIp(value.slice(1, -1)) === 6
}

function isIp(value: string): 0 | 4 | 6 {
  if (Address4.isValid(value)) return 4
  if (Address6.isValid(value)) return 6
  return 0
}

function toAsciiHostname(value: string): string {
  try {
    return new URL(`http://${value}`).hostname
  } catch {
    return ''
  }
}

function isNumericHostAlias(value: string): boolean {
  return value.split('.').every((label) => /^\d+$/.test(label) || /^0[xX][\da-fA-F]+$/.test(label))
}
