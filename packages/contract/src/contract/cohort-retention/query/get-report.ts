import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SId, SQueryInput } from '../../../schema/index.ts'
import { SCohortReport } from '../schema.ts'

export const SCohortReportInput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ cohortId: SId }), SQueryInput]),
)
export const SCohortReportOutput = SCohortReport
export type SCohortReportInput = v.InferOutput<typeof SCohortReportInput>
export type SCohortReportOutput = v.InferOutput<typeof SCohortReportOutput>

export const getRetentionReport = oc
  .route({ method: 'GET', path: '/getRetentionReport' })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SCohortReportInput)
  .output(SCohortReportOutput)
