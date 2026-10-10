import type { AnalyticsDb, Db } from '@cimi/db'
import { InMemoryRetentionResolver, type RetentionPolicy } from '@cimi/kernel'
import { mock, type MockProxy } from 'vitest-mock-extended'
import type {
  DemoSeedEvent,
  DemoSitePort,
  DemoSeedJournalPort,
  DemoSeedRetentionPort,
} from './ports.ts'
import { DemoSeedService } from './service.ts'

const now = new Date('2026-04-01T12:00:00.000Z')

export interface DemoSeedFixtureOptions {
  readonly policy?: RetentionPolicy
  readonly retention?: DemoSeedRetentionPort
}

export function createDemoSeedFixture({ policy, retention }: DemoSeedFixtureOptions = {}) {
  const sites = mock<DemoSitePort>()
  sites.createDemoSite.mockResolvedValue({ siteId: 'ste_1' })
  const journal = mock<DemoSeedJournalPort>()
  journal.appendGenerated.mockResolvedValue(0)

  const resolved =
    retention ??
    (policy === undefined ? new InMemoryRetentionResolver() : new InMemoryRetentionResolver(policy))

  const controlDb = mock<Db>()
  const analytics = mock<AnalyticsDb>()
  analytics.purgeSite.mockResolvedValue(undefined)
  analytics.appendProjectedEvents.mockResolvedValue({
    appendedEventCount: 0,
    appendedPropertyCount: 0,
    appendedVisitorCount: 0,
    appendedSessionCount: 0,
    chunkCount: 0,
    projectedReplaySequence: 0,
    projectedFactCardinality: 0,
    projectionGeneration: 0,
  })

  const service = new DemoSeedService({
    sites,
    journal,
    retention: resolved,
    controlDb,
    analytics,
    clock: () => now,
  })

  return { sites, journal, retention: resolved, controlDb, analytics, service }
}

export function seededEvents(journal: MockProxy<DemoSeedJournalPort>): readonly DemoSeedEvent[] {
  return journal.appendGenerated.mock.calls[0]?.[0].events ?? []
}
