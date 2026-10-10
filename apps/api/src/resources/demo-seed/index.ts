import type { AnalyticsDb, Db } from '@cimi/db'
import type { DemoSitePort, DemoSeedJournalPort, DemoSeedRetentionPort } from './ports.ts'
import {
  DemoSeedService,
  type DemoSeedInput,
  type DemoSeedResult,
  type DemoSeedServiceDependencies,
} from './service.ts'

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

export function createDemoSeed({
  sites,
  journal,
  retention,
  controlDb,
  analytics,
}: CreateDemoSeedDependencies): DemoSeedService {
  const dependencies: DemoSeedServiceDependencies = {
    sites,
    journal,
    retention,
    controlDb,
    analytics,
  }

  return new DemoSeedService(dependencies)
}

export type DemoSeedModule = DemoSeedService
