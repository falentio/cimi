import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SQueryInput } from '../../../schema/index.ts'
import { SEventSiteFields, SEventTimeseries } from '../schema.ts'

export const SEventTimeseriesInput = v.strictObject(
  v.entriesFromObjects([SEventSiteFields, SQueryInput]),
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
