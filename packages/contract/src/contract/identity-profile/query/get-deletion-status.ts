import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SDateTime } from '../../../schema/index.ts'
import { SDeletionCleanupStatus, SProfileIdentityFields, SProfileStatus } from '../schema.ts'

export const SDeletionStatusInput = SProfileIdentityFields
export type SDeletionStatusInput = v.InferOutput<typeof SDeletionStatusInput>
export const SDeletionStatusOutput = v.strictObject({
  status: SProfileStatus,
  updatedAt: SDateTime,
  derivedCleanup: SDeletionCleanupStatus,
  backupCleanup: SDeletionCleanupStatus,
})
export type SDeletionStatusOutput = v.InferOutput<typeof SDeletionStatusOutput>

export const getDeletionStatus = oc
  .route({
    method: 'GET',
    path: '/getDeletionStatus',
    operationId: 'getDeletionStatus',
    summary: 'Get profile deletion status',
    description: 'Report asynchronous deletion progress for a Site-scoped identity profile.',
    tags: ['identity-profile'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
  })
  .input(SDeletionStatusInput)
  .output(SDeletionStatusOutput)
