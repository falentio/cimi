import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SBackup } from '../schema.ts'

export const SBackupCreateInput = v.strictObject({})
export type SBackupCreateInput = v.InferOutput<typeof SBackupCreateInput>
export const SBackupCreateOutput = SBackup
export type SBackupCreateOutput = v.InferOutput<typeof SBackupCreateOutput>

export const createBackup = oc
  .route({
    method: 'POST',
    path: '/createBackup',
    operationId: 'createBackup',
    summary: 'Create a backup',
    description:
      'Create a consistent SQLite-canonical backup of configured data for operator recovery.',
    tags: ['backup-restore'],
    successStatus: 202,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    CONFLICT: { status: 409 },
    INSUFFICIENT_STORAGE: { status: 507 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SBackupCreateInput)
  .output(SBackupCreateOutput)
