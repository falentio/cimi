import type { AnalyticsDb, Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type { ReportingAdmissionService } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import type { ReportQueryKernel } from '../reporting/index.ts'
import { funnelRouter } from './router.ts'
import { FunnelRepositoryDrizzle } from './repository.drizzle.ts'
import { FunnelService } from './service.ts'

export { funnelRouter }
export { FunnelService, type FunnelServiceDependencies } from './service.ts'
export {
  FunnelRepositoryDrizzle,
  type FunnelRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { FunnelRepository } from './repository.ts'

export interface CreateFunnelDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly admission: ReportingAdmissionService
  readonly query?: ReportQueryKernel | undefined
  readonly scope?: SiteScopeGuardDependencies | undefined
  readonly clock?: (() => Date) | undefined
  readonly ids?: { readonly funnelId: () => string } | undefined
}

export function createFunnel({
  db,
  analytics,
  admission,
  query,
  scope,
  clock,
  ids,
}: CreateFunnelDependencies) {
  const repository = new FunnelRepositoryDrizzle({ db })
  const service = new FunnelService({
    repository,
    analytics,
    db,
    admission,
    ...(query === undefined ? {} : { query }),
    scope: scope ?? createSiteScopeDependencies({ db }),
    ...(clock === undefined ? {} : { clock }),
    ...(ids === undefined ? {} : { ids }),
  })
  return { repository, service, router: funnelRouter(service) }
}

export type FunnelModule = ReturnType<typeof createFunnel>
