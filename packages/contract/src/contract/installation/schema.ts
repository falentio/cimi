import * as v from 'valibot'
import { SDateTime, SId } from '../../schema/index.ts'
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
export const SLifecycleOperationKind = v.picklist([
  'backup',
  'restore',
  'upgrade',
  'retention',
  'cleanup',
  'site_deletion',
  'site_recovery',
  'site_purge',
])
export const SLifecycleOperationPhase = v.picklist([
  'pre_upgrade_safety',
  'site_transition',
  'lifecycle_transition',
])
export const SLifecycleOperationCheckpoint = v.picklist([
  'none',
  'sqlite_captured',
  'duckdb_rebuilt',
  'structurally_ready',
])
export const SLifecycleOperationStatus = v.strictObject({
  operationId: SId,
  kind: SLifecycleOperationKind,
  phase: SLifecycleOperationPhase,
  checkpoint: SLifecycleOperationCheckpoint,
  progress: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  lastSafeSequence: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  errorCode: v.nullable(SLifecycleErrorCode),
})
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
    if (status === 'running')
      return startedAt !== null && completedAt === null && errorCode === null
    if (status === 'completed')
      return startedAt !== null && completedAt !== null && errorCode === null
    return startedAt !== null && completedAt !== null && errorCode !== null
  }, 'Cleanup stage timestamps and errors must match its status.'),
)
export const SInstallation = v.pipe(
  v.strictObject({
    status: SInstallationStatus,
    defaultRetention: SRetentionPolicy,
    dataDirectoryReady: v.boolean(),
    activeOperation: v.nullable(SLifecycleOperationStatus),
    cleanupPending: v.boolean(),
    derivedCleanup: SCleanupStage,
    backupCleanup: SCleanupStage,
    updatedAt: SDateTime,
  }),
  v.check(({ status, dataDirectoryReady, cleanupPending, derivedCleanup, backupCleanup }) => {
    if (status === 'ready' && !dataDirectoryReady) return false
    const pending = [derivedCleanup.status, backupCleanup.status].some(
      (stage) => stage !== 'not_applicable' && stage !== 'completed',
    )
    if (cleanupPending !== pending) return false
    if (
      ['pending', 'running', 'completed', 'failed'].includes(backupCleanup.status) &&
      backupCleanup.status !== 'pending' &&
      derivedCleanup.status !== 'completed'
    ) {
      return false
    }
    return true
  }, 'Installation readiness, cleanup, and lifecycle fields must agree.'),
)

export const DEFAULT_RETENTION_POLICY = {
  eventMonths: 12,
  profileMonths: 12,
  replayMonths: null,
} as const
export const SInstallationInitializeFields = v.strictObject({
  defaultRetention: v.optional(SRetentionPolicy, DEFAULT_RETENTION_POLICY),
})
