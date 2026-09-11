import type { AnalyticsDb, Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import { ReportingAdmissionService } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import type { HealthLifecycle } from '../../health.ts'
import { ReportingEvidenceDrizzleDuckDb } from './evidence.drizzle-duckdb.ts'
import { ReportingMetadataDrizzle } from './metadata.drizzle.ts'
import { createReportingReadinessPort } from './readiness.ts'
import { trafficReportRouter } from './router.ts'
import { TrafficReportService } from './service.ts'

export { trafficReportRouter }
export { TrafficReportService, type TrafficReportServiceDependencies } from './service.ts'
export { ReportingEvidenceDrizzleDuckDb } from './evidence.drizzle-duckdb.ts'
export { ReportingMetadataDrizzle } from './metadata.drizzle.ts'
export { createReportingReadinessPort } from './readiness.ts'
export { toOrpcReportingError } from './errors.ts'
export type {
  TrafficBreakdownsInput,
  TrafficBreakdownsOutput,
  TrafficOverviewInput,
  TrafficOverviewOutput,
} from './service.ts'

export interface CreateTrafficReportDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly lifecycle: HealthLifecycle
  readonly dataDirectoryReady: boolean | (() => boolean)
  readonly scope?: SiteScopeGuardDependencies | undefined
}

export function createTrafficReport({
  db,
  analytics,
  lifecycle,
  dataDirectoryReady,
  scope,
}: CreateTrafficReportDependencies) {
  const metadata = new ReportingMetadataDrizzle({ db })
  const evidence = new ReportingEvidenceDrizzleDuckDb({ db, analytics })
  const admission = new ReportingAdmissionService({
    metadata,
    evidence,
    analyticsReadiness: createReportingReadinessPort({
      health: { db, analytics, dataDirectoryReady },
      lifecycle,
    }),
  })
  const service = new TrafficReportService({
    admission,
    scope: scope ?? createSiteScopeDependencies({ db }),
  })
  return { metadata, evidence, admission, service, router: trafficReportRouter(service) }
}

export type TrafficReportModule = ReturnType<typeof createTrafficReport>
