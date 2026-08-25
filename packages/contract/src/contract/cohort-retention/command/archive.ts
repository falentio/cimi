import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SCohortIdentityFields } from '../schema.ts'

export const SCohortArchiveInput = SCohortIdentityFields
export type SCohortArchiveInput = v.InferOutput<typeof SCohortArchiveInput>
export const SCohortArchiveOutput = v.void()
export type SCohortArchiveOutput = v.InferOutput<typeof SCohortArchiveOutput>

export const archiveCohort = oc
  .route({
    method: 'POST',
    path: '/cohort-retention/archiveCohort',
    operationId: 'archiveCohort',
    summary: 'Archive a cohort',
    description: 'Archive a cohort definition without deleting its historical retention reports.',
    tags: ['cohort-retention'],
    successStatus: 204,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    CONFLICT: { status: 409 },
  })
  .input(SCohortArchiveInput)
  .output(SCohortArchiveOutput)
