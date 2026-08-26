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
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    CONFLICT: {},
    INCOMPATIBLE_BACKUP: {},
    INSUFFICIENT_STORAGE: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SBackupRestoreInput)
  .output(SBackupRestoreOutput)
