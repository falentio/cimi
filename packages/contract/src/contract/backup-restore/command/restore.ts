import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SBackup, SBackupRestoreFields } from '../schema.ts'

export const SBackupRestoreInput = SBackupRestoreFields
export type SBackupRestoreInput = v.InferOutput<typeof SBackupRestoreInput>
export const SBackupRestoreOutput = SBackup
export type SBackupRestoreOutput = v.InferOutput<typeof SBackupRestoreOutput>

export const restoreBackup = oc
  .route({ method: 'POST', path: '/restoreBackup' })
  .meta({ auth: 'admin' })
  .errors({ ...ECommand, INCOMPATIBLE_BACKUP: {}, INSUFFICIENT_STORAGE: {} })
  .input(SBackupRestoreInput)
  .output(SBackupRestoreOutput)
