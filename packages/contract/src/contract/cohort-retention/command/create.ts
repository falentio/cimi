import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import {
  areDistinctCohortActions,
  SCohort,
  SCohortDefinitionFields,
  SCohortSiteFields,
} from '../schema.ts'

const SCohortCreateRecord = v.strictObject(
  v.entriesFromObjects([SCohortSiteFields, SCohortDefinitionFields]),
)
export const SCohortCreateInput = v.pipe(
  SCohortCreateRecord,
  v.check(
    (input: v.InferOutput<typeof SCohortCreateRecord>) => areDistinctCohortActions(input),
    'Entry and retention actions must be distinct.',
  ),
)
export type SCohortCreateInput = v.InferOutput<typeof SCohortCreateInput>
export const SCohortCreateOutput = SCohort
export type SCohortCreateOutput = v.InferOutput<typeof SCohortCreateOutput>

export const createCohort = oc
  .route({
    method: 'POST',
    path: '/createCohort',
    operationId: 'createCohort',
    summary: 'Create a cohort',
    description: 'Persist a bounded cohort retention definition for a Site.',
    tags: ['cohort-retention'],
    successStatus: 201,
  })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SCohortCreateInput)
  .output(SCohortCreateOutput)
