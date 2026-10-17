import type { AnalyticsDb, Db } from '@cimi/db'
import type { RetentionResolver } from '@cimi/kernel'
import type { DemoSitePort, DemoSeedJournalPort } from './ports.ts'
import { DemoSeedService, type DemoSeedInput, type DemoSeedResult } from './service.ts'

export { DemoSeedService, type DemoSeedInput, type DemoSeedResult }

export type { DemoSitePort, DemoSeedEvent, DemoSeedJournalPort } from './ports.ts'

export { generateEventFabric } from './fabric.ts'

export interface CreateDemoSeedDependencies {
  readonly sites: DemoSitePort
  readonly journal: DemoSeedJournalPort
  readonly retention: RetentionResolver
  readonly controlDb: Db
  readonly analytics: AnalyticsDb
  readonly historyDays?: number | undefined
}

export function createDemoSeed(dependencies: CreateDemoSeedDependencies): DemoSeedService {
  return new DemoSeedService(dependencies)
}
