import type { AnalyticsDb, Db } from '@cimi/db'
import type { ReportingAdmissionService } from '@cimi/kernel'
import { ReportingDataDrizzleDuckDb } from './data.drizzle-duckdb.ts'
import { createReportQueryKernel, type ReportQueryKernel } from './query.ts'

export function createReportQueryKernelFromInfrastructure(input: {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly admission: ReportingAdmissionService
}): ReportQueryKernel {
  return createReportQueryKernel({
    admission: input.admission,
    data: new ReportingDataDrizzleDuckDb({ db: input.db, analytics: input.analytics }),
  })
}

export {
  cohortReportWork,
  createReportQueryKernel,
  funnelReportWork,
  goalReportWork,
  type ReportDataPort,
  type ReportQueryKernel,
  type ReportQueryKernelDependencies,
  type ReportRun,
  type ReportWindow,
  type StatefulReportWork,
} from './query.ts'
export type { ReportEvaluationInput } from './evaluation.ts'
export { toOrpcReportingError } from './errors.ts'
export {
  ReportingDataDrizzleDuckDb,
  type ReportingDataDrizzleDuckDbDependencies,
} from './data.drizzle-duckdb.ts'
export { readActiveProfiles, readActiveProfileTraits, readProfileTrait } from './profiles.ts'
