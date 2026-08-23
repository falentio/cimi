import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead, SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SSite, SSiteOrganizationFields } from '../schema.ts'

export const SSiteListInput = v.strictObject(
  v.entriesFromObjects([SSiteOrganizationFields, SPaginationInput]),
)
export type SSiteListInput = v.InferOutput<typeof SSiteListInput>
export const SSiteListOutput = v.strictObject({
  items: v.array(SSite),
  nextCursor: v.nullable(SCursor),
})
export type SSiteListOutput = v.InferOutput<typeof SSiteListOutput>

export const listSites = oc
  .route({ method: 'GET', path: '/listSites' })
  .meta({ auth: 'authenticated' })
  .errors(ERead)
  .input(SSiteListInput)
  .output(SSiteListOutput)
