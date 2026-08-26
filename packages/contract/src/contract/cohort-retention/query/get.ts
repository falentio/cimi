import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SCohort, SCohortIdentityFields } from '../schema.ts'

export const SCohortGetInput = SCohortIdentityFields
export type SCohortGetInput = v.InferOutput<typeof SCohortGetInput>
export const SCohortGetOutput = SCohort
export type SCohortGetOutput = v.InferOutput<typeof SCohortGetOutput>

export const getCohort = oc
  .route({
    method: 'GET',
    path: '/cohort-retention/getCohort',
    operationId: 'getCohort',
    summary: 'Get a cohort',
    description: 'Return one cohort definition after Site authorization.',
    tags: ['cohort-retention'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: {},
    NOT_FOUND: {},
  })
  .input(SCohortGetInput)
  .output(SCohortGetOutput)
