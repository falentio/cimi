import type { Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type { LifecycleLock, LifecycleOperationStatusReader } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import { RetentionPolicyRepositoryDrizzle } from './repository.drizzle.ts'
import { retentionPolicyRouter } from './router.ts'
import { RetentionPolicyService, type RetentionPolicyIdFactory } from './service.ts'

export { retentionPolicyRouter }
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
}

export function createRetentionPolicy({
  db,
  lock,
  lifecycle,
  scope,
  clock,
  ids,
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
  return { service, router }
}

export type RetentionPolicyModule = ReturnType<typeof createRetentionPolicy>
