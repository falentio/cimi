import type { AnalyticsDb, Db } from '@cimi/db'
import type { LifecycleLock, ReportingAdmissionService } from '@cimi/kernel'
import { ReportingDataDrizzleDuckDb } from './data.drizzle-duckdb.ts'
import { createReportQueryKernel, type ReportQueryKernel } from './query.ts'

export function createReportQueryKernelFromInfrastructure(input: {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly admission: ReportingAdmissionService
  readonly lifecycleLock: LifecycleLock
}): ReportQueryKernel {
  return createReportQueryKernel({
    admission: input.admission,
    data: new ReportingDataDrizzleDuckDb({ db: input.db, analytics: input.analytics }),
    lifecycleLock: input.lifecycleLock,
  })
}

export {
  cohortReportWork,
  createReportQueryKernel,
  funnelReportWork,
  goalReportWork,
  type ReportDataPort,
  type HistoricalDefinition,
  type HistoricalDefinitionPlan,
  type ReportQueryKernel,
  type ReportQueryPlan,
  type ReportQueryPlanningContext,
  type ReportQueryKernelDependencies,
  type ReportRun,
  type ReportWindow,
  type StatefulReportWork,
  coverageForDefinitions,
  historicalDefinitionFor,
} from './query.ts'
export type { ReportEvaluationInput } from './evaluation.ts'
export { toOrpcReportingError } from './errors.ts'
export {
  ReportingDataDrizzleDuckDb,
  type ReportingDataDrizzleDuckDbDependencies,
} from './data.drizzle-duckdb.ts'
export { readActiveProfiles, readActiveProfileTraits, readProfileTrait } from './profiles.ts'
