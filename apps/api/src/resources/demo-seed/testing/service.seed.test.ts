import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { DemoSeedRetentionPort } from '../ports.ts'
import { createDemoSeedFixture, seededEvents } from '../fixture.ts'

describe('DemoSeedService.seed', () => {
  it('creates the site, appends the fabric, then projects it for that site', async () => {
    const { sites, journal, controlDb, analytics, service } = createDemoSeedFixture()
    journal.appendGenerated.mockResolvedValue(3)

    await expect(service.seed({ organizationId: 'org_1', ownerUserId: 'user_1' })).resolves.toEqual(
      { siteId: 'ste_1', appendedEventCount: 3 },
    )
    expect(sites.createDemoSite).toHaveBeenCalledWith({
      organizationId: 'org_1',
      ownerUserId: 'user_1',
    })
    expect(journal.appendGenerated).toHaveBeenCalledWith({
      siteId: 'ste_1',
      events: expect.any(Array),
    })
    expect(analytics.appendProjectedEvents).toHaveBeenCalledWith({
      controlDb,
      siteId: 'ste_1',
    })
    expect(sites.createDemoSite.mock.invocationCallOrder[0]).toBeLessThan(
      journal.appendGenerated.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(journal.appendGenerated.mock.invocationCallOrder[0]).toBeLessThan(
      analytics.appendProjectedEvents.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('spans ninety days back to the site creation date', async () => {
    const { journal, service } = createDemoSeedFixture()

    await service.seed({ organizationId: 'org_1', ownerUserId: 'user_1' })

    const times = seededEvents(journal).map((event) => new Date(event.occurrenceTime).getTime())

    expect(times.length).toBeGreaterThan(27_000 * 0.85)
    expect(times.length).toBeLessThan(27_000 * 1.15)
    expect(Math.min(...times)).toBeGreaterThanOrEqual(
      new Date('2026-01-01T12:00:00.000Z').getTime(),
    )
    expect(Math.max(...times)).toBeLessThanOrEqual(now.getTime())
  })

  it('clips the window to the retention horizon', async () => {
    const { journal, service } = createDemoSeedFixture({
      policy: { eventMonths: 1, profileMonths: 1, replayMonths: null },
    })

    await service.seed({ organizationId: 'org_1', ownerUserId: 'user_1' })

    const times = seededEvents(journal).map((event) => new Date(event.occurrenceTime).getTime())

    expect(times.length).toBeGreaterThan(0)
    expect(times.length).toBeLessThan(27_000 * 0.5)
    expect(Math.min(...times)).toBeGreaterThanOrEqual(
      new Date('2026-03-01T00:00:00.000Z').getTime(),
    )
  })

  it('reads the retention boundary for the created site, not the organization', async () => {
    const retention = mock<DemoSeedRetentionPort>()
    retention.effective.mockResolvedValue(GOLDEN_POLICY)
    const { service } = createDemoSeedFixture({ retention })

    await service.seed({ organizationId: 'org_1', ownerUserId: 'user_1' })

    expect(retention.effective).toHaveBeenCalledWith('ste_1')
  })

  it('does not project when the journal write fails', async () => {
    const { journal, analytics, service } = createDemoSeedFixture()
    journal.appendGenerated.mockRejectedValue(new Error('journal closed'))

    await expect(service.seed({ organizationId: 'org_1', ownerUserId: 'user_1' })).rejects.toThrow(
      'journal closed',
    )
    expect(analytics.appendProjectedEvents).not.toHaveBeenCalled()
  })
})

const now = new Date('2026-04-01T12:00:00.000Z')

const GOLDEN_POLICY = {
  eventMonths: 12,
  profileMonths: 12,
  replayMonths: null,
}
