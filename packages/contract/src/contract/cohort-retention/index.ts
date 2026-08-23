import { archiveCohort } from './command/archive.ts'
import { createCohort } from './command/create.ts'
import { updateCohort } from './command/update.ts'
import { getCohort } from './query/get.ts'
import { getRetentionReport } from './query/get-report.ts'
import { listCohorts } from './query/list.ts'

export const cohortRetention = {
  listCohorts,
  getCohort,
  getRetentionReport,
  createCohort,
  updateCohort,
  archiveCohort,
}
