import * as v from 'valibot'
import { SDateTime } from '../../schema/index.ts'
import { SRetentionPolicy } from '../retention-policy/schema.ts'

export const SInstallationStatus = v.picklist([
  'uninitialized',
  'ready',
  'degraded',
  'maintenance',
  'recovering',
])
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
export const SLifecycleOperationStatus = v.strictObject({
  kind: v.picklist(['backup', 'restore', 'upgrade', 'retention', 'cleanup']),
  phase: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  progress: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  lastSafeSequence: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  errorCode: v.nullable(SLifecycleErrorCode),
})
export const SInstallation = v.strictObject({
  status: SInstallationStatus,
  defaultRetention: SRetentionPolicy,
  dataDirectoryReady: v.boolean(),
  activeOperation: v.nullable(SLifecycleOperationStatus),
  cleanupPending: v.boolean(),
  updatedAt: SDateTime,
})
export const SInstallationInitializeFields = v.strictObject({ defaultRetention: SRetentionPolicy })
