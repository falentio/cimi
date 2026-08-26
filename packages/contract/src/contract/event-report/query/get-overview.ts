import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { isValidReportRange } from '../../../schema/index.ts'
import { SEventOverview, SEventReportFieldsSchema, SEventSiteFields } from '../schema.ts'

export const SEventOverviewInput = v.pipe(
  v.strictObject(v.entriesFromObjects([SEventSiteFields, SEventReportFieldsSchema])),
  v.check((input) => isValidReportRange(input), 'Report date ranges must be ordered.'),
)
export type SEventOverviewInput = v.InferOutput<typeof SEventOverviewInput>
export const SEventOverviewOutput = SEventOverview
export type SEventOverviewOutput = v.InferOutput<typeof SEventOverviewOutput>

export const getEventOverview = oc
  .route({
    method: 'GET',
    path: '/event-report/getEventOverview',
    operationId: 'getEventOverview',
    summary: 'Get event overview',
    description: 'Report event counts and unique Session and Visitor context by Event Kind.',
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
  .input(SEventOverviewInput)
  .output(SEventOverviewOutput)
