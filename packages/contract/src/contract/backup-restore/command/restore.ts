import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SBackup, SBackupRestoreFields } from '../schema.ts'

export const SBackupRestoreInput = SBackupRestoreFields
export type SBackupRestoreInput = v.InferOutput<typeof SBackupRestoreInput>
export const SBackupRestoreOutput = SBackup
export type SBackupRestoreOutput = v.InferOutput<typeof SBackupRestoreOutput>

export const restoreBackup = oc
  .route({
    method: 'POST',
    path: '/restoreBackup',
    operationId: 'restoreBackup',
    summary: 'Restore a backup',
    description:
      'Restore an operator-selected backup manifest after explicit recovery confirmation.',
    tags: ['backup-restore'],
    successStatus: 202,
  })
  .meta({ auth: 'admin' })
  .errors({
    ...ECommand,
    INCOMPATIBLE_BACKUP: { status: 422 },
    INSUFFICIENT_STORAGE: { status: 507 },
  })
  .input(SBackupRestoreInput)
  .output(SBackupRestoreOutput)
