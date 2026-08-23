import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SQueryInput } from '../../../schema/index.ts'
import { SEventOverview, SEventSiteFields } from '../schema.ts'

export const SEventOverviewInput = v.strictObject(
  v.entriesFromObjects([SEventSiteFields, SQueryInput]),
)
export type SEventOverviewInput = v.InferOutput<typeof SEventOverviewInput>
export const SEventOverviewOutput = SEventOverview
export type SEventOverviewOutput = v.InferOutput<typeof SEventOverviewOutput>

export const getEventOverview = oc
  .route({
    method: 'GET',
    path: '/getEventOverview',
    operationId: 'getEventOverview',
    summary: 'Get event overview',
    description: 'Report event counts and unique Session and Visitor context by Event Kind.',
    tags: ['event-report'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SEventOverviewInput)
  .output(SEventOverviewOutput)
