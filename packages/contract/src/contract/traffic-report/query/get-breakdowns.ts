import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import {
  SGranularReportFieldsSchema,
  SOffsetPaginationInput,
  SSortDirection,
  isValidGranularReportRange,
} from '../../../schema/index.ts'
import {
  STrafficBreakdown,
  STrafficBreakdownFields,
  isWithinAuthenticatedReportBucketLimit,
} from '../schema.ts'

export const STrafficBreakdownsInput = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      STrafficBreakdownFields,
      SGranularReportFieldsSchema,
      SOffsetPaginationInput,
      v.strictObject({
        sort: v.optional(v.picklist(['value', 'count', 'percentage'])),
        direction: v.optional(SSortDirection),
      }),
    ]),
  ),
  v.check(
    (input) => isValidGranularReportRange(input) && isWithinAuthenticatedReportBucketLimit(input),
    'Report range is invalid for its granularity.',
  ),
)
export type STrafficBreakdownsInput = v.InferOutput<typeof STrafficBreakdownsInput>
export const STrafficBreakdownsOutput = STrafficBreakdown
export type STrafficBreakdownsOutput = v.InferOutput<typeof STrafficBreakdownsOutput>

export const getTrafficBreakdowns = oc
  .route({
    method: 'GET',
    path: '/getTrafficBreakdowns',
    operationId: 'getTrafficBreakdowns',
    summary: 'Get traffic breakdowns',
    description: 'Return bounded traffic dimension breakdowns for an authorized Site.',
    tags: ['traffic-report'],
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
  .input(STrafficBreakdownsInput)
  .output(STrafficBreakdownsOutput)
