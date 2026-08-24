import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import * as psl from 'psl'

// TODO: Consume from apps/api origin normalization and apps/frontend domain grouping once their contracts settle.
export function getRegistrableDomain(input: string): string | null {
  const hostname = extractHostname(input)
  if (!hostname) return null

  const normalizedHostname = normalizeHostname(hostname)
  if (!normalizedHostname) return null

  if (isIP(normalizedHostname)) return normalizedHostname
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
  if (isIP(value) || isBracketedIpv6(value)) return value
  if (value.includes(':')) return null

  return value
}

function normalizeHostname(hostname: string): string | null {
  const unbracketed = isBracketedIpv6(hostname) ? hostname.slice(1, -1) : hostname
  if (isIP(unbracketed)) return unbracketed.toLowerCase()

  const withoutTrailingDot = unbracketed.endsWith('.') ? unbracketed.slice(0, -1) : unbracketed
  if (withoutTrailingDot === '' || withoutTrailingDot.endsWith('.')) return null
  if (isNumericHostAlias(withoutTrailingDot)) return null

  return domainToASCII(withoutTrailingDot).toLowerCase() || null
}

function isBracketedIpv6(value: string): boolean {
  return value.startsWith('[') && value.endsWith(']') && isIP(value.slice(1, -1)) === 6
}

function isNumericHostAlias(value: string): boolean {
  return value.split('.').every((label) => /^\d+$/.test(label) || /^0[xX][\da-fA-F]+$/.test(label))
}
