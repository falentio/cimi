import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery } from '../../../schema/index.ts'
import { SCohort, SCohortIdentityFields } from '../schema.ts'

export const SCohortGetInput = SCohortIdentityFields
export type SCohortGetInput = v.InferOutput<typeof SCohortGetInput>
export const SCohortGetOutput = SCohort
export type SCohortGetOutput = v.InferOutput<typeof SCohortGetOutput>

export const getCohort = oc
  .route({ method: 'GET', path: '/getCohort' })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SCohortGetInput)
  .output(SCohortGetOutput)
