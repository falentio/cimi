import type { AnalyticsDb, Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type { LifecycleLock, ReportingAdmissionService } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import type { ReportQueryKernel } from '../reporting/index.ts'
import { GoalRepositoryDrizzle } from './repository.drizzle.ts'
import { goalRouter } from './router.ts'
import { GoalService } from './service.ts'

export { goalRouter }
export { GoalService, type GoalServiceDependencies } from './service.ts'
export {
  GoalRepositoryDrizzle,
  type GoalRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { GoalRepository } from './repository.ts'

export interface CreateGoalDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly admission: ReportingAdmissionService
  readonly lifecycleLock: LifecycleLock
  readonly query?: ReportQueryKernel | undefined
  readonly scope?: SiteScopeGuardDependencies | undefined
  readonly clock?: (() => Date) | undefined
  readonly ids?: { readonly goalId: () => string } | undefined
}

export function createGoal({
  db,
  analytics,
  admission,
  lifecycleLock,
  query,
  scope,
  clock,
  ids,
}: CreateGoalDependencies) {
  const repository = new GoalRepositoryDrizzle({ db })
  const service = new GoalService({
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
  return { repository, service, router: goalRouter(service) }
}

export type GoalModule = ReturnType<typeof createGoal>
