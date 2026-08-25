import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { isValidGranularReportRange } from '../../../schema/index.ts'
import {
  SEventGranularReportFieldsSchema,
  SEventSiteFields,
  SEventTimeseries,
  isWithinAuthenticatedEventBucketLimit,
} from '../schema.ts'

export const SEventTimeseriesInput = v.pipe(
  v.strictObject(v.entriesFromObjects([SEventSiteFields, SEventGranularReportFieldsSchema])),
  v.check(
    (input) => isValidGranularReportRange(input) && isWithinAuthenticatedEventBucketLimit(input),
    'Report range is invalid for its granularity.',
  ),
)
export type SEventTimeseriesInput = v.InferOutput<typeof SEventTimeseriesInput>
export const SEventTimeseriesOutput = SEventTimeseries
export type SEventTimeseriesOutput = v.InferOutput<typeof SEventTimeseriesOutput>

export const getEventTimeseries = oc
  .route({
    method: 'GET',
    path: '/event-report/getEventTimeseries',
    operationId: 'getEventTimeseries',
    summary: 'Get event timeseries',
    description: 'Return bounded time buckets containing accepted Event counts.',
    tags: ['event-report'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    QUERY_LIMIT_EXCEEDED: { status: 422 },
    SERVICE_UNAVAILABLE: { status: 503 },
  })
  .input(SEventTimeseriesInput)
  .output(SEventTimeseriesOutput)
