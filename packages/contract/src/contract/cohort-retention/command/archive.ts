import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SCohortIdentityFields } from '../schema.ts'

export const SCohortArchiveInput = SCohortIdentityFields
export type SCohortArchiveInput = v.InferOutput<typeof SCohortArchiveInput>
export const SCohortArchiveOutput = v.strictObject({ archived: v.literal(true) })
export type SCohortArchiveOutput = v.InferOutput<typeof SCohortArchiveOutput>

export const archiveCohort = oc
  .route({ method: 'POST', path: '/archiveCohort' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SCohortArchiveInput)
  .output(SCohortArchiveOutput)
