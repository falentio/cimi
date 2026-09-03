import type { Db } from '@cimi/db'
import { InMemoryAcceptanceJournalPort, InMemoryLifecycleLock } from '@cimi/kernel'
import type { AcceptanceJournalPort, LifecycleLock } from '@cimi/kernel'
import { InstallationRepositoryDrizzle } from './repository.drizzle.ts'
import { installationRouter } from './router.ts'
import { InstallationService } from './service.ts'
import type { InstallationIdFactory, UpgradeArtifactPort } from './service.ts'

export { installationRouter }
export { InstallationService, type InstallationServiceDependencies } from './service.ts'
export type { InstallationIdFactory, UpgradeArtifactPort } from './service.ts'
export {
  InstallationRepositoryDrizzle,
  type InstallationRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { InstallationRepository } from './repository.ts'

export interface CreateInstallationDependencies {
  db: Db
  lock?: LifecycleLock | undefined
  journal?: AcceptanceJournalPort | undefined
  clock?: (() => Date) | undefined
  ids?: InstallationIdFactory | undefined
  upgradeArtifact?: UpgradeArtifactPort | undefined
}

export function createInstallation({
  db,
  lock,
  journal,
  clock,
  ids,
  upgradeArtifact,
}: CreateInstallationDependencies) {
  const repository = new InstallationRepositoryDrizzle({ db })
  const service = new InstallationService({
    repository,
    lock: lock ?? new InMemoryLifecycleLock(),
    journal: journal ?? new InMemoryAcceptanceJournalPort(),
    ...(clock === undefined ? {} : { clock }),
    ...(ids === undefined ? {} : { ids }),
    ...(upgradeArtifact === undefined ? {} : { upgradeArtifact }),
  })
  const router = installationRouter(service)
  return { service, router }
}

export type InstallationModule = ReturnType<typeof createInstallation>
