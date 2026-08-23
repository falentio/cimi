import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SCohort, SCohortDefinitionFields, SCohortSiteFields } from '../schema.ts'

export const SCohortCreateInput = v.strictObject(
  v.entriesFromObjects([SCohortSiteFields, SCohortDefinitionFields]),
)
export type SCohortCreateInput = v.InferOutput<typeof SCohortCreateInput>
export const SCohortCreateOutput = SCohort
export type SCohortCreateOutput = v.InferOutput<typeof SCohortCreateOutput>

export const createCohort = oc
  .route({ method: 'POST', path: '/createCohort' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SCohortCreateInput)
  .output(SCohortCreateOutput)
