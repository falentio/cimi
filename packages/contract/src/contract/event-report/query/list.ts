import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import {
  SOffsetPaginationInput,
  SSortDirection,
  isValidReportRange,
} from '../../../schema/index.ts'
import { SEventPageResult, SEventReportListFieldsSchema, SEventSiteFields } from '../schema.ts'

export const SEventListInput = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      SEventSiteFields,
      SEventReportListFieldsSchema,
      SOffsetPaginationInput,
      v.strictObject({
        sort: v.optional(v.literal('occurredAt')),
        direction: v.optional(SSortDirection),
      }),
    ]),
  ),
  v.check((input) => isValidReportRange(input), 'Report date ranges must be ordered.'),
)
export type SEventListInput = v.InferOutput<typeof SEventListInput>
export const SEventListOutput = SEventPageResult
export type SEventListOutput = v.InferOutput<typeof SEventListOutput>

export const listEvents = oc
  .route({
    method: 'GET',
    path: '/event-report/listEvents',
    operationId: 'listEvents',
    summary: 'List events',
    description: 'Explore accepted Events for debugging and analysis with offset pagination.',
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
  .input(SEventListInput)
  .output(SEventListOutput)
