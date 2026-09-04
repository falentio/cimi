import type { Db } from '@cimi/db'
import { InMemoryAcceptanceJournalPort } from '@cimi/kernel'
import type { AcceptanceJournalPort, LifecycleLock } from '@cimi/kernel'
import { InstallationRepositoryDrizzle } from './repository.drizzle.ts'
import { installationRouter } from './router.ts'
import { InstallationService } from './service.ts'
import { SqliteUpgradeExecutor } from './upgrade-executor.ts'
import type { InstallationIdFactory, UpgradeExecutor } from './service.ts'

export { installationRouter }
export {
  InstallationService,
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
  lock: LifecycleLock
  journal?: AcceptanceJournalPort | undefined
  dataDirectoryReady: boolean
  controlDatabasePath: string
  dataDirectoryPath: string
  clock?: (() => Date) | undefined
  ids?: InstallationIdFactory | undefined
  upgradeExecutor?: UpgradeExecutor | undefined
}

export function createInstallation({
  db,
  lock,
  journal,
  dataDirectoryReady,
  controlDatabasePath,
  dataDirectoryPath,
  clock,
  ids,
  upgradeExecutor,
}: CreateInstallationDependencies) {
  const repository = new InstallationRepositoryDrizzle({ db })
  const executor =
    upgradeExecutor ?? new SqliteUpgradeExecutor({ db, controlDatabasePath, dataDirectoryPath })
  const service = new InstallationService({
    repository,
    lock,
    journal: journal ?? new InMemoryAcceptanceJournalPort(),
    dataDirectoryReady,
    ...(clock === undefined ? {} : { clock }),
    ...(ids === undefined ? {} : { ids }),
    upgradeExecutor: executor,
  })
  const router = installationRouter(service)
  return { service, router }
}

export type InstallationModule = ReturnType<typeof createInstallation>
