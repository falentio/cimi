import { describe, expect, it } from 'vitest'
import { createIpMatcher, parseIpPattern } from '../index.ts'

describe('parseIpPattern', () => {
  it('parses a CIDR pattern and matches addresses in its subnet', () => {
    const pattern = parseIpPattern(' 192.168.1.0/24 ')

    expect(pattern).toMatchObject({ kind: 'cidr', family: 4, source: '192.168.1.0/24' })
    expect(pattern?.matches('192.168.1.42')).toBe(true)
    expect(pattern?.matches('192.168.2.1')).toBe(false)
  })

  it('parses exact IPv4 and IPv6 addresses', () => {
    const ipv4 = parseIpPattern('203.0.113.10')
    const ipv6 = parseIpPattern('2001:db8::1')

    expect(ipv4).toMatchObject({ kind: 'address', family: 4 })
    expect(ipv4?.matches('203.0.113.10')).toBe(true)
    expect(ipv4?.matches('203.0.113.11')).toBe(false)
    expect(ipv6).toMatchObject({ kind: 'address', family: 6 })
    expect(ipv6?.matches('2001:db8::1')).toBe(true)
    expect(ipv6?.matches('2001:db8::2')).toBe(false)
  })

  it('matches equivalent IPv6 spellings without accepting zone identifiers', () => {
    const pattern = parseIpPattern('2001:0db8:0:0:0:0:0:1')

    expect(pattern?.matches('2001:db8::1')).toBe(true)
    expect(parseIpPattern('fe80::1%eth0')).toBeNull()
    expect(pattern?.matches('2001:db8::1%eth0')).toBe(false)
  })

  it('matches CIDR boundaries and host bits in the pattern', () => {
    const ipv4 = parseIpPattern('192.168.1.5/24')
    const ipv6 = parseIpPattern('2001:db8::1/128')
    const anyIpv4 = parseIpPattern('0.0.0.0/0')

    expect(ipv4?.matches('192.168.1.255')).toBe(true)
    expect(ipv4?.matches('192.168.2.1')).toBe(false)
    expect(ipv6?.matches('2001:db8::1')).toBe(true)
    expect(ipv6?.matches('2001:db8::2')).toBe(false)
    expect(anyIpv4?.matches('198.51.100.10')).toBe(true)
    expect(anyIpv4?.matches('2001:db8::1')).toBe(false)
  })

  it('parses inclusive IPv4 ranges', () => {
    const pattern = parseIpPattern('192.168.1.10 - 192.168.1.20')

    expect(pattern).toMatchObject({ kind: 'range', family: 4 })
    expect(pattern?.matches('192.168.1.10')).toBe(true)
    expect(pattern?.matches('192.168.1.20')).toBe(true)
    expect(pattern?.matches('192.168.1.21')).toBe(false)
  })

  it('rejects malformed, reversed, mixed-family, and IPv6 range patterns', () => {
    for (const pattern of [
      '',
      '192.168.1.1/33',
      '192.168.1.20-192.168.1.10',
      '192.168.1.1-2001:db8::1',
      '2001:db8::1-2001:db8::2',
    ]) {
      expect(parseIpPattern(pattern)).toBeNull()
    }
  })
})

describe('createIpMatcher', () => {
  it('matches an address against compiled patterns', () => {
    const matcher = createIpMatcher(['203.0.113.10', '2001:db8::/32'])

    expect(matcher.matches('203.0.113.10')).toBe(true)
    expect(matcher.matches('2001:db8::42')).toBe(true)
    expect(matcher.matches('203.0.113.11')).toBe(false)
  })

  it('handles unsigned IPv4 values across the high half of the address space', () => {
    const matcher = createIpMatcher(['127.0.0.0-255.255.255.255'])

    expect(matcher.matches('128.0.0.1')).toBe(true)
    expect(matcher.matches('255.255.255.255')).toBe(true)
    expect(matcher.matches('126.255.255.255')).toBe(false)
  })

  it('returns false for an empty matcher and malformed candidate addresses', () => {
    const matcher = createIpMatcher([])

    expect(matcher.matches('192.168.1.1')).toBe(false)
    expect(matcher.matches(' 192.168.1.1')).toBe(false)
    expect(matcher.matches('not-an-ip')).toBe(false)
  })

  it('rejects invalid patterns before entering the matching hot path', () => {
    expect(() => createIpMatcher(['not-an-ip'])).toThrow('Invalid IP pattern: not-an-ip')
  })
})
