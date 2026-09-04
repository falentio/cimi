import type { Db } from '@cimi/db'
import type { LifecycleLock, LifecycleOperationStatusReader } from '@cimi/kernel'
import type { OrganizationMembershipReconciler } from '../organization/service.ts'
import { SiteLifecycleWorker, type SiteLifecycleWorkerDependencies } from './lifecycle.ts'
import { SiteRepositoryDrizzle } from './repository.drizzle.ts'
import { siteRouter } from './router.ts'
import { createSiteScopeDependencies } from './scope.ts'
import { SiteService } from './service.ts'

export { siteRouter }
export { SiteService, type SiteServiceDependencies } from './service.ts'
export { SiteLifecycleWorker, type SiteLifecycleWorkerDependencies } from './lifecycle.ts'
export {
  SiteRepositoryDrizzle,
  type SiteRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { SiteRepository } from './repository.ts'
export { createSiteScopeDependencies, type SiteScopeDependencies } from './scope.ts'

export interface CreateSiteDependencies {
  db: Db
  lock: LifecycleLock
  lifecycle: LifecycleOperationStatusReader
  membership?: OrganizationMembershipReconciler | undefined
}

export interface CreateSiteLifecycleWorkerDependencies {
  db: Db
  lock: LifecycleLock
  intervalMs?: number | undefined
  onError?: ((error: unknown) => void) | undefined
}

export function createSiteLifecycleWorker({
  db,
  lock,
  intervalMs,
  onError,
}: CreateSiteLifecycleWorkerDependencies): SiteLifecycleWorker {
  const repository = new SiteRepositoryDrizzle({ db })
  const dependencies: SiteLifecycleWorkerDependencies = { repository, lock }
  if (intervalMs !== undefined) dependencies.intervalMs = intervalMs
  if (onError !== undefined) dependencies.onError = onError
  return new SiteLifecycleWorker(dependencies)
}

export function createSite({ db, lock, lifecycle, membership }: CreateSiteDependencies) {
  const repository = new SiteRepositoryDrizzle({ db })
  const scope = createSiteScopeDependencies({ db })
  const service = new SiteService({ repository, scope, lock, lifecycle, membership })
  const router = siteRouter(service)
  return { service, router }
}

export type SiteModule = ReturnType<typeof createSite>
