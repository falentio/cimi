import * as v from 'valibot'
import { SDateTime } from './index.ts'

export const SLifecycleErrorCode = v.picklist([
  'BACKUP_FAILED',
  'RESTORE_FAILED',
  'UPGRADE_FAILED',
  'RETENTION_FAILED',
  'CLEANUP_FAILED',
  'INCOMPATIBLE_BACKUP',
  'INSUFFICIENT_STORAGE',
  'CONFLICT',
  'INTERNAL_SERVER_ERROR',
])

export const SCleanupStageStatus = v.picklist([
  'not_applicable',
  'not_started',
  'pending',
  'running',
  'completed',
  'failed',
])

export const SCleanupStage = v.pipe(
  v.strictObject({
    status: SCleanupStageStatus,
    startedAt: v.nullable(SDateTime),
    completedAt: v.nullable(SDateTime),
    errorCode: v.nullable(SLifecycleErrorCode),
  }),
  v.check(({ status, startedAt, completedAt, errorCode }) => {
    if (status === 'not_applicable' || status === 'not_started' || status === 'pending') {
      return startedAt === null && completedAt === null && errorCode === null
    }
    if (status === 'running') {
      return startedAt !== null && completedAt === null && errorCode === null
    }
    if (status === 'completed') {
      return startedAt !== null && completedAt !== null && errorCode === null
    }
    return startedAt !== null && completedAt !== null && errorCode !== null
  }, 'Cleanup stage timestamps and errors must match its status.'),
)
