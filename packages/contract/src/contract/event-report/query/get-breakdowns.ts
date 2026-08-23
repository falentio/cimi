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
  .route({ method: 'GET', path: '/getEventBreakdowns' })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SEventBreakdownsInput)
  .output(SEventBreakdownsOutput)
