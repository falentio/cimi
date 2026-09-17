import { describe, expect, it } from 'vitest'
import { InMemoryPublicDashboardRateLimiter, PublicDashboardRateLimitError } from '../protection.ts'

const now = new Date('2026-09-17T12:00:00.000Z')

describe('InMemoryPublicDashboardRateLimiter.consume', () => {
  it('enforces the Site limit before the IP limit', () => {
    const limiter = new InMemoryPublicDashboardRateLimiter()
    for (let index = 0; index < 360; index += 1) {
      limiter.consume({ siteId: 'ste_1', sourceIp: `192.0.2.${index}`, now })
    }

    expect(() => limiter.consume({ siteId: 'ste_1', sourceIp: '192.0.2.1', now })).toThrowError(
      expect.objectContaining<Partial<PublicDashboardRateLimitError>>({
        failure: expect.objectContaining({
          scope: 'site',
          limit: 360,
          remaining: 0,
        }),
      }),
    )
  })

  it('resets both windows at the next minute', () => {
    const limiter = new InMemoryPublicDashboardRateLimiter()
    for (let index = 0; index < 360; index += 1) {
      limiter.consume({ siteId: 'ste_1', sourceIp: '192.0.2.1', now })
    }

    expect(() =>
      limiter.consume({
        siteId: 'ste_1',
        sourceIp: '192.0.2.1',
        now: new Date(now.getTime() + 60_000),
      }),
    ).not.toThrow()
  })

  it('returns the IP limit after 600 requests across Sites', () => {
    const limiter = new InMemoryPublicDashboardRateLimiter()
    for (let index = 0; index < 600; index += 1) {
      limiter.consume({ siteId: `ste_${index}`, sourceIp: '192.0.2.1', now })
    }

    expect(() => limiter.consume({ siteId: 'ste_600', sourceIp: '192.0.2.1', now })).toThrowError(
      expect.objectContaining<Partial<PublicDashboardRateLimitError>>({
        failure: expect.objectContaining({
          scope: 'ip',
          limit: 600,
          remaining: 0,
        }),
      }),
    )
  })
})
