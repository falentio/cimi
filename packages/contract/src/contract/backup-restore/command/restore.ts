import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SBackup, SBackupRestoreFields } from '../schema.ts'

export const SBackupRestoreInput = SBackupRestoreFields
export type SBackupRestoreInput = v.InferOutput<typeof SBackupRestoreInput>
export const SBackupRestoreOutput = SBackup
export type SBackupRestoreOutput = v.InferOutput<typeof SBackupRestoreOutput>

export const restoreBackup = oc
  .route({
    method: 'POST',
    path: '/backup-restore/restoreBackup',
    operationId: 'restoreBackup',
    summary: 'Restore a backup',
    description:
      'Restore an operator-selected backup after creating a separate internal SQLite safety artifact.',
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
    INCOMPATIBLE_BACKUP: { status: 422 },
    INSUFFICIENT_STORAGE: { status: 507 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SBackupRestoreInput)
  .output(SBackupRestoreOutput)
