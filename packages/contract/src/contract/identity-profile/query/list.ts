import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead, SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SProfile, SProfileIdentityFields } from '../schema.ts'

export const SProfileListInput = v.strictObject(
  v.entriesFromObjects([v.pick(SProfileIdentityFields, ['siteId']), SPaginationInput]),
)
export type SProfileListInput = v.InferOutput<typeof SProfileListInput>
export const SProfileListOutput = v.strictObject({
  items: v.array(SProfile),
  nextCursor: v.nullable(SCursor),
})
export type SProfileListOutput = v.InferOutput<typeof SProfileListOutput>

export const listProfiles = oc
  .route({ method: 'GET', path: '/listProfiles' })
  .meta({ auth: 'authenticated' })
  .errors(ERead)
  .input(SProfileListInput)
  .output(SProfileListOutput)
