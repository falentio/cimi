import type { AnalyticsDb, Db } from '@cimi/db'
import type { DemoSitePort, DemoSeedJournalPort, DemoSeedRetentionPort } from './ports.ts'
import { DemoSeedService, type DemoSeedInput, type DemoSeedResult } from './service.ts'

export { DemoSeedService, type DemoSeedInput, type DemoSeedResult }

export type {
  DemoSitePort,
  DemoSeedEvent,
  DemoSeedJournalPort,
  DemoSeedRetentionPort,
} from './ports.ts'

export { generateEventFabric } from './fabric.ts'

export interface CreateDemoSeedDependencies {
  readonly sites: DemoSitePort
  readonly journal: DemoSeedJournalPort
  readonly retention: DemoSeedRetentionPort
  readonly controlDb: Db
  readonly analytics: AnalyticsDb
}

export function createDemoSeed(dependencies: CreateDemoSeedDependencies): DemoSeedService {
  return new DemoSeedService(dependencies)
}
