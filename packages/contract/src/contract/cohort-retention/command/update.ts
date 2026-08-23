import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SCohort, SCohortDefinitionFields, SCohortIdentityFields } from '../schema.ts'

export const SCohortUpdateInput = v.strictObject(
  v.entriesFromObjects([SCohortIdentityFields, SCohortDefinitionFields]),
)
export type SCohortUpdateInput = v.InferOutput<typeof SCohortUpdateInput>
export const SCohortUpdateOutput = SCohort
export type SCohortUpdateOutput = v.InferOutput<typeof SCohortUpdateOutput>

export const updateCohort = oc
  .route({
    method: 'POST',
    path: '/updateCohort',
    operationId: 'updateCohort',
    summary: 'Update a cohort',
    description: 'Update an existing cohort retention definition.',
    tags: ['cohort-retention'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SCohortUpdateInput)
  .output(SCohortUpdateOutput)
