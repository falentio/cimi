import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SCohort, SCohortSiteFields } from '../schema.ts'

export const SCohortListInput = v.strictObject(
  v.entriesFromObjects([SCohortSiteFields, SPaginationInput]),
)
export type SCohortListInput = v.InferOutput<typeof SCohortListInput>
export const SCohortListOutput = v.strictObject({
  items: v.array(SCohort),
  nextCursor: v.nullable(SCursor),
})
export type SCohortListOutput = v.InferOutput<typeof SCohortListOutput>

export const listCohorts = oc
  .route({ method: 'GET', path: '/listCohorts' })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SCohortListInput)
  .output(SCohortListOutput)
