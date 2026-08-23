import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SQueryInput } from '../../../schema/index.ts'
import { SEventPageResult, SEventSiteFields } from '../schema.ts'

export const SEventListInput = v.strictObject(v.entriesFromObjects([SEventSiteFields, SQueryInput]))
export type SEventListInput = v.InferOutput<typeof SEventListInput>
export const SEventListOutput = SEventPageResult
export type SEventListOutput = v.InferOutput<typeof SEventListOutput>

export const listEvents = oc
  .route({ method: 'GET', path: '/listEvents' })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SEventListInput)
  .output(SEventListOutput)
