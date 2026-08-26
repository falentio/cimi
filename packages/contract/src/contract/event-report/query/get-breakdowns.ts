import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import {
  SOffsetPaginationInput,
  SSortDirection,
  isValidReportRange,
} from '../../../schema/index.ts'
import { SEventBreakdowns, SEventReportFieldsSchema, SEventSiteFields } from '../schema.ts'

export const SEventBreakdownsInput = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      SEventSiteFields,
      SEventReportFieldsSchema,
      SOffsetPaginationInput,
      v.strictObject({
        sort: v.optional(v.picklist(['value', 'count'])),
        direction: v.optional(SSortDirection),
      }),
    ]),
  ),
  v.check((input) => isValidReportRange(input), 'Report date ranges must be ordered.'),
)
export type SEventBreakdownsInput = v.InferOutput<typeof SEventBreakdownsInput>
export const SEventBreakdownsOutput = SEventBreakdowns
export type SEventBreakdownsOutput = v.InferOutput<typeof SEventBreakdownsOutput>

export const getEventBreakdowns = oc
  .route({
    method: 'GET',
    path: '/event-report/getEventBreakdowns',
    operationId: 'getEventBreakdowns',
    summary: 'Get event breakdowns',
    description: 'Provide bounded reports for standard Event dimensions.',
    tags: ['event-report'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    QUERY_LIMIT_EXCEEDED: {},
    SERVICE_UNAVAILABLE: {},
  })
  .input(SEventBreakdownsInput)
  .output(SEventBreakdownsOutput)
