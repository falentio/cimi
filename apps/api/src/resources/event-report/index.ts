import { DuckDbReportingQuery, type AnalyticsDb, type Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import { ReportingAdmissionService } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import type { HealthLifecycle } from '../../health.ts'
import {
  ReportingEvidenceDrizzleDuckDb,
  ReportingMetadataDrizzle,
  createReportingReadinessPort,
} from '../traffic-report/index.ts'
import { eventReportRouter } from './router.ts'
import { EventReportService } from './service.ts'

export { eventReportRouter }
export { EventReportService, type EventReportServiceDependencies } from './service.ts'
export { toOrpcReportingError } from './errors.ts'
export type {
  EventBreakdownsInput,
  EventBreakdownsOutput,
  EventListInput,
  EventListOutput,
  EventOverviewInput,
  EventOverviewOutput,
  EventTimeseriesInput,
  EventTimeseriesOutput,
} from './service.ts'

export interface CreateEventReportDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly lifecycle: HealthLifecycle
  readonly dataDirectoryReady: boolean | (() => boolean)
  readonly scope?: SiteScopeGuardDependencies | undefined
  readonly profileFilterKeys?: readonly string[] | (() => readonly string[]) | undefined
}

export function createEventReport({
  db,
  analytics,
  lifecycle,
  dataDirectoryReady,
  scope,
  profileFilterKeys,
}: CreateEventReportDependencies) {
  const metadata = new ReportingMetadataDrizzle({ db })
  const evidence = new ReportingEvidenceDrizzleDuckDb({ db, analytics })
  const query = new DuckDbReportingQuery({ analytics })
  const admission = new ReportingAdmissionService({
    metadata,
    evidence,
    analyticsReadiness: createReportingReadinessPort({
      health: { db, analytics, dataDirectoryReady },
      lifecycle,
    }),
  })
  const service = new EventReportService({
    admission,
    query,
    profileFilterKeys: profileFilterKeys ?? [],
    scope: scope ?? createSiteScopeDependencies({ db }),
  })
  return { metadata, evidence, admission, query, service, router: eventReportRouter(service) }
}

export type EventReportModule = ReturnType<typeof createEventReport>
