import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SQueryInput } from '../../../schema/index.ts'
import { STrafficOverview, STrafficSiteFields } from '../schema.ts'

export const STrafficOverviewInput = v.strictObject(
  v.entriesFromObjects([STrafficSiteFields, SQueryInput]),
)
export type STrafficOverviewInput = v.InferOutput<typeof STrafficOverviewInput>
export const STrafficOverviewOutput = STrafficOverview
export type STrafficOverviewOutput = v.InferOutput<typeof STrafficOverviewOutput>

export const getTrafficOverview = oc
  .route({ method: 'GET', path: '/getTrafficOverview' })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(STrafficOverviewInput)
  .output(STrafficOverviewOutput)
