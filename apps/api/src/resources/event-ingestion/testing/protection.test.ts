import { describe, expect, it } from 'vitest'
import { InMemoryIngestionProtection } from '../protection.ts'

describe('InMemoryIngestionProtection', () => {
  it('allows the configured site burst and refills it over time', async () => {
    const protection = new InMemoryIngestionProtection({
      siteRatePerSecond: 10,
      siteBurst: 2,
      sourceIpRatePerSecond: 10,
      sourceIpBurst: 2,
    })
    const first = new Date('2026-09-05T00:00:00.000Z')

    await protection.consume({ siteId: 'ste_1', units: 2, now: first })
    await expect(
      protection.consume({ siteId: 'ste_1', units: 1, now: first }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    await protection.consume({
      siteId: 'ste_1',
      units: 1,
      now: new Date(first.getTime() + 100),
    })
  })

  it('charges site and source IP buckets independently', async () => {
    const protection = new InMemoryIngestionProtection({
      siteRatePerSecond: 10,
      siteBurst: 10,
      sourceIpRatePerSecond: 1,
      sourceIpBurst: 1,
    })
    const now = new Date('2026-09-05T00:00:00.000Z')

    await protection.consume({ siteId: 'ste_1', sourceIp: '203.0.113.10', units: 1, now })
    await expect(
      protection.consume({ siteId: 'ste_1', sourceIp: '203.0.113.10', units: 1, now }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    await protection.consume({ siteId: 'ste_1', sourceIp: '203.0.113.11', units: 1, now })
  })
})
