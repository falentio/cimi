import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SId, SReportFieldsSchema, isValidReportRange } from '../../../schema/index.ts'
import { SCohortReport } from '../schema.ts'

export const SCohortReportInput = v.pipe(
  v.strictObject(v.entriesFromObjects([v.strictObject({ cohortId: SId }), SReportFieldsSchema])),
  v.check((input) => isValidReportRange(input), 'Report date ranges must be ordered.'),
)
export const SCohortReportOutput = SCohortReport
export type SCohortReportInput = v.InferOutput<typeof SCohortReportInput>
export type SCohortReportOutput = v.InferOutput<typeof SCohortReportOutput>

export const getRetentionReport = oc
  .route({
    method: 'GET',
    path: '/getRetentionReport',
    operationId: 'getRetentionReport',
    summary: 'Get a retention report',
    description: 'Return cohort size and retained counts and rates by bounded Site-local period.',
    tags: ['cohort-retention'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SCohortReportInput)
  .output(SCohortReportOutput)
