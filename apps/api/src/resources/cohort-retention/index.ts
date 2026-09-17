import type { AnalyticsDb, Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type { LifecycleLock, ReportingAdmissionService } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import type { ReportQueryKernel } from '../reporting/index.ts'
import { CohortRepositoryDrizzle } from './repository.drizzle.ts'
import { cohortRetentionRouter } from './router.ts'
import { CohortService } from './service.ts'

export { cohortRetentionRouter }
export { CohortService, type CohortServiceDependencies } from './service.ts'
export {
  CohortRepositoryDrizzle,
  type CohortRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { CohortRepository } from './repository.ts'

export interface CreateCohortDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly admission: ReportingAdmissionService
  readonly lifecycleLock: LifecycleLock
  readonly query?: ReportQueryKernel | undefined
  readonly scope?: SiteScopeGuardDependencies | undefined
  readonly clock?: (() => Date) | undefined
  readonly ids?: { readonly cohortId: () => string } | undefined
}

export function createCohort({
  db,
  analytics,
  admission,
  lifecycleLock,
  query,
  scope,
  clock,
  ids,
}: CreateCohortDependencies) {
  const repository = new CohortRepositoryDrizzle({ db })
  const service = new CohortService({
    repository,
    analytics,
    db,
    admission,
    lifecycleLock,
    ...(query === undefined ? {} : { query }),
    scope: scope ?? createSiteScopeDependencies({ db }),
    ...(clock === undefined ? {} : { clock }),
    ...(ids === undefined ? {} : { ids }),
  })
  return { repository, service, router: cohortRetentionRouter(service) }
}

export type CohortModule = ReturnType<typeof createCohort>
