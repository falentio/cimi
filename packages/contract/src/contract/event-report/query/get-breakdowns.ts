import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import {
  EQuery,
  SOffsetPaginationInput,
  isValidGranularReportRange,
} from '../../../schema/index.ts'
import { SEventBreakdowns, SEventGranularReportFieldsSchema, SEventSiteFields } from '../schema.ts'

export const SEventBreakdownsInput = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      SEventSiteFields,
      SEventGranularReportFieldsSchema,
      SOffsetPaginationInput,
    ]),
  ),
  v.check(
    (input) => isValidGranularReportRange(input),
    'Report range is invalid for its granularity.',
  ),
)
export type SEventBreakdownsInput = v.InferOutput<typeof SEventBreakdownsInput>
export const SEventBreakdownsOutput = SEventBreakdowns
export type SEventBreakdownsOutput = v.InferOutput<typeof SEventBreakdownsOutput>

export const getEventBreakdowns = oc
  .route({
    method: 'GET',
    path: '/getEventBreakdowns',
    operationId: 'getEventBreakdowns',
    summary: 'Get event breakdowns',
    description: 'Provide bounded reports for standard Event dimensions.',
    tags: ['event-report'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SEventBreakdownsInput)
  .output(SEventBreakdownsOutput)
