import type { Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type {
  LifecycleLock,
  PublicDashboardQueryPort,
  ReportingAdmissionService,
} from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import { PublicDashboardRepositoryDrizzle } from './repository.drizzle.ts'
import { publicDashboardRouter } from './router.ts'
import { PublicDashboardService } from './service.ts'
import type { PublicDashboardRateLimiter } from './protection.ts'

export { publicDashboardRouter }
export {
  InMemoryPublicDashboardRateLimiter,
  PublicDashboardRateLimitError,
  type PublicDashboardRateLimiter,
} from './protection.ts'
export {
  PublicDashboardService,
  type PublicDashboardIdentifierFactory,
  type PublicDashboardServiceDependencies,
} from './service.ts'
export {
  PublicDashboardRepositoryDrizzle,
  type PublicDashboardRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { PublicDashboardRepository } from './repository.ts'
export { hashPublicDashboardIdentifier, mintPublicDashboardIdentifier } from './token.ts'

export interface CreatePublicDashboardDependencies {
  readonly db: Db
  readonly lock: LifecycleLock
  readonly admission?: ReportingAdmissionService | undefined
  readonly query?: PublicDashboardQueryPort | undefined
  readonly rateLimiter?: PublicDashboardRateLimiter | undefined
  readonly scope?: SiteScopeGuardDependencies | undefined
  readonly clock?: (() => Date) | undefined
  readonly identifiers?: {
    mint(): { readonly identifier: string; readonly hash: string }
  }
}

export function createPublicDashboard({
  db,
  lock,
  admission,
  query,
  rateLimiter,
  scope,
  clock,
  identifiers,
}: CreatePublicDashboardDependencies) {
  const repository = new PublicDashboardRepositoryDrizzle({ db })
  const service = new PublicDashboardService({
    repository,
    lock,
    ...(admission === undefined ? {} : { admission }),
    ...(query === undefined ? {} : { query }),
    ...(rateLimiter === undefined ? {} : { rateLimiter }),
    scope: scope ?? createSiteScopeDependencies({ db }),
    ...(clock === undefined ? {} : { clock }),
    ...(identifiers === undefined ? {} : { identifiers }),
  })
  return {
    repository,
    service,
    router: publicDashboardRouter(service),
  }
}

export type PublicDashboardModule = ReturnType<typeof createPublicDashboard>
