import * as v from 'valibot'
import { SDateTime, SId } from '../../schema/index.ts'

export const SBackupStatus = v.picklist(['creating', 'available', 'restoring', 'failed'])
export const SBackup = v.strictObject({
  id: SId,
  status: SBackupStatus,
  createdAt: SDateTime,
  completedAt: v.nullable(SDateTime),
  scope: v.picklist(['installation']),
  errorCode: v.nullable(v.string()),
})
export const SBackupIdFields = v.strictObject({ backupId: SId })
export const SBackupRestoreFields = v.strictObject(
  v.entriesFromObjects([SBackupIdFields, v.strictObject({ confirmation: v.literal('RESTORE') })]),
)
