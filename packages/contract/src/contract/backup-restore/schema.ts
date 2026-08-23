import * as v from 'valibot'
import { SDateTime, SId } from '../../schema/index.ts'

export const SBackupStatus = v.picklist(['creating', 'available', 'restoring', 'failed'])
export const SBackupPhase = v.picklist([
  'capturing_sqlite',
  'restoring_sqlite',
  'rebuilding_duckdb',
  'cleanup_pending',
  'ready',
  'failed',
])
export const SBackup = v.strictObject({
  id: SId,
  status: SBackupStatus,
  createdAt: SDateTime,
  completedAt: v.nullable(SDateTime),
  scope: v.picklist(['installation']),
  phase: SBackupPhase,
  cleanupPending: v.boolean(),
  errorCode: v.nullable(
    v.picklist([
      'INCOMPATIBLE_BACKUP',
      'INSUFFICIENT_STORAGE',
      'CONFLICT',
      'INTERNAL_SERVER_ERROR',
    ]),
  ),
})
export const SBackupIdFields = v.strictObject({ backupId: SId })
export const SBackupRestoreFields = v.strictObject(
  v.entriesFromObjects([SBackupIdFields, v.strictObject({ confirmation: v.literal('RESTORE') })]),
)
