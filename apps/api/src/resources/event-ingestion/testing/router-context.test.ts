import { describe, expect, it } from 'vitest'
import { trustedSourceIp } from '../router.ts'

function headersWith(entries: Record<string, string>): Headers {
  return new Headers(entries)
}

describe('trustedSourceIp', () => {
  it('takes the rightmost proxy-added entry from X-Forwarded-For', () => {
    expect(trustedSourceIp(headersWith({ 'x-forwarded-for': '203.0.113.10, 198.51.100.7' }))).toBe(
      '198.51.100.7',
    )
  })

  it('falls back to x-real-ip', () => {
    expect(trustedSourceIp(headersWith({ 'x-real-ip': '203.0.113.10' }))).toBe('203.0.113.10')
  })

  it('returns undefined without proxy headers', () => {
    expect(trustedSourceIp(headersWith({}))).toBeUndefined()
  })

  it('ignores a blank X-Forwarded-For and falls back to x-real-ip', () => {
    expect(trustedSourceIp(headersWith({ 'x-forwarded-for': ' ', 'x-real-ip': '10.0.0.1' }))).toBe(
      '10.0.0.1',
    )
  })
})
