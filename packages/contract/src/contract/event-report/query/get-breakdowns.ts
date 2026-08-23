import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SQueryInput } from '../../../schema/index.ts'
import { SEventBreakdowns, SEventSiteFields } from '../schema.ts'

export const SEventBreakdownsInput = v.strictObject(
  v.entriesFromObjects([SEventSiteFields, SQueryInput]),
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
