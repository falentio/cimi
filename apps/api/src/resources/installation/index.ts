import { schema, type AnalyticsDb, type Db } from '@cimi/db'
import { InMemoryAcceptanceJournalPort } from '@cimi/kernel'
import type { AcceptanceJournalPort, AcceptanceQuiescencePort, LifecycleLock } from '@cimi/kernel'
import { InstallationRepositoryDrizzle } from './repository.drizzle.ts'
import { installationRouter } from './router.ts'
import { InstallationService } from './service.ts'
import { SqliteUpgradeExecutor } from './upgrade-executor.ts'
import type { DataDirectoryReadiness, InstallationIdFactory, UpgradeExecutor } from './service.ts'

export { installationRouter }
export {
  InstallationService,
  type DataDirectoryReadiness,
  type InstallationServiceDependencies,
  type UpgradeExecutor,
} from './service.ts'
export type { InstallationIdFactory } from './service.ts'
export {
  InstallationRepositoryDrizzle,
  type InstallationRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export { SqliteUpgradeExecutor } from './upgrade-executor.ts'
export type { SqliteUpgradeExecutorDependencies } from './upgrade-executor.ts'
export type { InstallationRepository } from './repository.ts'

export interface CreateInstallationDependencies {
  db: Db
  analytics: AnalyticsDb
  lock: LifecycleLock
  journal?: AcceptanceJournalPort | undefined
  acceptance?: AcceptanceQuiescencePort | undefined
  dataDirectoryReady: DataDirectoryReadiness
  controlDatabasePath: string
  dataDirectoryPath: string
  migrationsFolder?: string | undefined
  clock?: (() => Date) | undefined
  ids?: InstallationIdFactory | undefined
  upgradeExecutor?: UpgradeExecutor | undefined
}

export function createInstallation({
  db,
  analytics,
  lock,
  journal,
  acceptance,
  dataDirectoryReady,
  controlDatabasePath,
  dataDirectoryPath,
  migrationsFolder,
  clock,
  ids,
  upgradeExecutor,
}: CreateInstallationDependencies) {
  const repository = new InstallationRepositoryDrizzle({ db })
  const executor =
    upgradeExecutor ??
    new SqliteUpgradeExecutor({
      db,
      controlDatabasePath,
      dataDirectoryPath,
      migrationsFolder,
      analyticsRebuild: () => analytics.rebuild({ controlDb: db }),
    })
  const service = new InstallationService({
    repository,
    lock,
    journal: journal ?? new InMemoryAcceptanceJournalPort(),
    ...(acceptance === undefined ? {} : { acceptance }),
    analyticsProjectionReady: () => isAnalyticsProjectionReady({ db, analytics }),
    dataDirectoryReady,
    ...(clock === undefined ? {} : { clock }),
    ...(ids === undefined ? {} : { ids }),
    upgradeExecutor: executor,
  })
  const router = installationRouter(service)
  return { service, router }
}

export type InstallationModule = ReturnType<typeof createInstallation>

async function isAnalyticsProjectionReady(input: {
  readonly db: Db
  readonly analytics: AnalyticsDb
}): Promise<boolean> {
  if (!(await input.analytics.ready())) return false
  const sites = input.db.select({ id: schema.TSite.id }).from(schema.TSite).all()
  for (const site of sites) {
    const snapshot = await input.analytics.readProjectionSnapshot({ siteId: site.id })
    if (snapshot.checkpoint === null) return false
    if (snapshot.checkpoint.projectedFactCardinality !== snapshot.factCardinality) return false
  }
  return true
}
