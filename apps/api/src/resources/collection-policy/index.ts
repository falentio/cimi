import type { Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import { createSiteScopeDependencies } from '../site/scope.ts'
import type { LifecycleLock, LifecycleOperationStatusReader } from '@cimi/kernel'
import { CollectionPolicyRepositoryDrizzle } from './repository.drizzle.ts'
import { collectionPolicyRouter } from './router.ts'
import { CollectionPolicyService, type CollectionPolicyIdFactory } from './service.ts'

export { collectionPolicyRouter }
export {
  CollectionPolicyReportingProfileFilter,
  type CollectionPolicyReportingProfileFilterDependencies,
} from './reporting-profile-filter.ts'
export {
  CollectionPolicyService,
  type CollectionPolicyIdFactory,
  type CollectionPolicyServiceDependencies,
} from './service.ts'
export {
  CollectionPolicyRepositoryDrizzle,
  type CollectionPolicyRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { CollectionPolicyRepository } from './repository.ts'
export {
  clonePolicyValues,
  resolvePolicy,
  validatePolicyCombination,
  PolicyValidationError,
} from './model.ts'
export type {
  PolicyField,
  PolicyLayers,
  PolicyProvenance,
  PolicyResolution,
  PolicyRevision,
  PolicyTarget,
  PolicyValues,
} from './model.ts'
export { evaluateAdmission, sanitizeProperties, sanitizeUrls } from './evaluator.ts'
export type {
  AdmissionDecision,
  AdmissionInput,
  AdmissionRejection,
  CollectionContext,
  FrozenPolicyValues,
  NormalizedAdmissionOutcome,
  SanitizedUrls,
  ScalarValue,
} from './evaluator.ts'

export interface CreateCollectionPolicyDependencies {
  readonly db: Db
  readonly lock: LifecycleLock
  readonly lifecycle: LifecycleOperationStatusReader
  readonly scope?: SiteScopeGuardDependencies | undefined
  readonly clock?: (() => Date) | undefined
  readonly ids?: CollectionPolicyIdFactory | undefined
}

export function createCollectionPolicy({
  db,
  lock,
  lifecycle,
  scope,
  clock,
  ids,
}: CreateCollectionPolicyDependencies) {
  const repository = new CollectionPolicyRepositoryDrizzle({ db })
  const service = new CollectionPolicyService({
    repository,
    lock,
    scope: scope ?? createSiteScopeDependencies({ db }),
    lifecycle,
    ...(clock === undefined ? {} : { clock }),
    ...(ids === undefined ? {} : { ids }),
  })
  return { repository, service, router: collectionPolicyRouter(service) }
}

export type CollectionPolicyModule = ReturnType<typeof createCollectionPolicy>
