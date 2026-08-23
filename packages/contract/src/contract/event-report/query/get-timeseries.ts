import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, isValidGranularReportRange } from '../../../schema/index.ts'
import { SEventGranularReportFieldsSchema, SEventSiteFields, SEventTimeseries } from '../schema.ts'

export const SEventTimeseriesInput = v.pipe(
  v.strictObject(v.entriesFromObjects([SEventSiteFields, SEventGranularReportFieldsSchema])),
  v.check(
    (input) => isValidGranularReportRange(input),
    'Report range is invalid for its granularity.',
  ),
)
export type SEventTimeseriesInput = v.InferOutput<typeof SEventTimeseriesInput>
export const SEventTimeseriesOutput = SEventTimeseries
export type SEventTimeseriesOutput = v.InferOutput<typeof SEventTimeseriesOutput>

export const getEventTimeseries = oc
  .route({
    method: 'GET',
    path: '/getEventTimeseries',
    operationId: 'getEventTimeseries',
    summary: 'Get event timeseries',
    description: 'Return bounded time buckets containing accepted Event counts.',
    tags: ['event-report'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SEventTimeseriesInput)
  .output(SEventTimeseriesOutput)
