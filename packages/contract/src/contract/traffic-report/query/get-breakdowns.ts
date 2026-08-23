import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SQueryInput } from '../../../schema/index.ts'
import { STrafficBreakdown, STrafficBreakdownFields } from '../schema.ts'

export const STrafficBreakdownsInput = v.strictObject(
  v.entriesFromObjects([STrafficBreakdownFields, SQueryInput]),
)
export type STrafficBreakdownsInput = v.InferOutput<typeof STrafficBreakdownsInput>
export const STrafficBreakdownsOutput = STrafficBreakdown
export type STrafficBreakdownsOutput = v.InferOutput<typeof STrafficBreakdownsOutput>

export const getTrafficBreakdowns = oc
  .route({ method: 'GET', path: '/getTrafficBreakdowns' })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(STrafficBreakdownsInput)
  .output(STrafficBreakdownsOutput)
