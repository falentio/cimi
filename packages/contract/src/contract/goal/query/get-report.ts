import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import {
  SId,
  SReportFieldsSchema,
  VALIDATION_KEYS,
  isValidReportRange,
} from '../../../schema/index.ts'
import { SGoalReport } from '../schema.ts'

export const SGoalReportInput = v.pipe(
  v.strictObject(v.entriesFromObjects([v.strictObject({ goalId: SId }), SReportFieldsSchema])),
  v.check((input) => isValidReportRange(input), VALIDATION_KEYS.contract.report.dateRangeOrdered),
)
export const SGoalReportOutput = SGoalReport
export type SGoalReportInput = v.InferOutput<typeof SGoalReportInput>
export type SGoalReportOutput = v.InferOutput<typeof SGoalReportOutput>

export const getGoalReport = oc
  .route({
    method: 'GET',
    path: '/goal/getGoalReport',
    operationId: 'getGoalReport',
    summary: 'Get a goal report',
    description: 'Count Goal conversions and calculate the conversion rate for a bounded period.',
    tags: ['goal'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated', admission: 'analytics-read' })
  .errors({
    UNAUTHORIZED: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    QUERY_LIMIT_EXCEEDED: {},
    SERVICE_UNAVAILABLE: {},
  })
  .input(SGoalReportInput)
  .output(SGoalReportOutput)
