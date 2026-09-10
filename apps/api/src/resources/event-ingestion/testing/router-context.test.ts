import { describe, expect, it } from 'vitest'
import { extractRequestContext, trustedSourceIp } from '../../../request-context.ts'

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

describe('extractRequestContext', () => {
  it('extracts the shared request context', () => {
    expect(
      extractRequestContext(
        headersWith({
          'x-forwarded-for': '203.0.113.10, 198.51.100.7',
          'user-agent': 'Googlebot/2.1',
        }),
        { trustProxyHeaders: true, countryResolver: () => 'US' },
      ),
    ).toEqual({
      sourceIp: '198.51.100.7',
      userAgent: 'Googlebot/2.1',
      isBot: true,
      country: 'US',
    })
  })

  it('omits proxy-derived context when proxy headers are not trusted', () => {
    expect(
      extractRequestContext(
        headersWith({
          'x-forwarded-for': '198.51.100.7',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        }),
      ),
    ).toEqual({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      isBot: false,
    })
  })
})
