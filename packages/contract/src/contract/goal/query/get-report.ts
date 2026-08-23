import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SId, SQueryInput } from '../../../schema/index.ts'
import { SGoalReport } from '../schema.ts'

export const SGoalReportInput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ goalId: SId }), SQueryInput]),
)
export const SGoalReportOutput = SGoalReport
export type SGoalReportInput = v.InferOutput<typeof SGoalReportInput>
export type SGoalReportOutput = v.InferOutput<typeof SGoalReportOutput>

export const getGoalReport = oc
  .route({
    method: 'GET',
    path: '/getGoalReport',
    operationId: 'getGoalReport',
    summary: 'Get a goal report',
    description: 'Count Goal conversions and calculate the conversion rate for a bounded period.',
    tags: ['goal'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SGoalReportInput)
  .output(SGoalReportOutput)
