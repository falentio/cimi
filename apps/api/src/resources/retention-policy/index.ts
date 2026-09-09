import type { Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type { LifecycleLock, LifecycleOperationStatusReader } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import { RetentionPolicyRepositoryDrizzle } from './repository.drizzle.ts'
import { retentionPolicyRouter } from './router.ts'
import { RetentionPolicyService, type RetentionPolicyIdFactory } from './service.ts'
import {
  RetentionCleanupWorker,
  type RetentionCleanupPort,
  type RetentionCleanupWorkerDependencies,
} from './cleanup.ts'

export { retentionPolicyRouter }
export {
  RetentionCleanupWorker,
  type RetentionCleanupPort,
  type RetentionCleanupBatchResult,
  type RetentionCleanupWorkerDependencies,
} from './cleanup.ts'
export {
  RetentionPolicyService,
  type RetentionPolicyServiceDependencies,
  type RetentionPolicyIdFactory,
} from './service.ts'
export {
  RetentionPolicyRepositoryDrizzle,
  type RetentionPolicyRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { RetentionPolicyRepository } from './repository.ts'

export interface CreateRetentionPolicyDependencies {
  db: Db
  lock: LifecycleLock
  lifecycle: LifecycleOperationStatusReader
  scope?: SiteScopeGuardDependencies | undefined
  clock?: (() => Date) | undefined
  ids?: RetentionPolicyIdFactory | undefined
  cleanup?: RetentionCleanupPort | undefined
}

export function createRetentionPolicy({
  db,
  lock,
  lifecycle,
  scope,
  clock,
  ids,
  cleanup,
}: CreateRetentionPolicyDependencies) {
  const repository = new RetentionPolicyRepositoryDrizzle({ db })
  const service = new RetentionPolicyService({
    repository,
    lock,
    scope: scope ?? createSiteScopeDependencies({ db }),
    lifecycle,
    ...(clock === undefined ? {} : { clock }),
    ...(ids === undefined ? {} : { ids }),
  })
  const router = retentionPolicyRouter(service)
  const workerDependencies: RetentionCleanupWorkerDependencies = {
    repository,
    lock,
    ...(cleanup === undefined ? {} : { cleanup }),
  }
  const worker = new RetentionCleanupWorker(workerDependencies)
  return { service, router, worker }
}

export type RetentionPolicyModule = ReturnType<typeof createRetentionPolicy>
