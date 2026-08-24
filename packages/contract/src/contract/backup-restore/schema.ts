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
export const SBackupErrorCode = v.picklist([
  'INCOMPATIBLE_BACKUP',
  'INSUFFICIENT_STORAGE',
  'CONFLICT',
  'INTERNAL_SERVER_ERROR',
])
export const SBackupCleanupStageStatus = v.picklist([
  'not_applicable',
  'not_started',
  'pending',
  'running',
  'completed',
  'failed',
])
export const SBackupCleanupStage = v.pipe(
  v.strictObject({
    status: SBackupCleanupStageStatus,
    startedAt: v.nullable(SDateTime),
    completedAt: v.nullable(SDateTime),
    errorCode: v.nullable(SBackupErrorCode),
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
export const SBackupReadiness = v.strictObject({
  controlStore: v.picklist(['not_ready', 'ready']),
  analyticsStore: v.picklist(['not_ready', 'ready', 'rebuilding']),
  structural: v.picklist(['not_ready', 'ready']),
})
export const SBackupCheckpoint = v.picklist([
  'none',
  'sqlite_captured',
  'sqlite_restored',
  'duckdb_rebuilt',
  'structurally_ready',
])
export const SPreRestoreSafetyArtifact = v.pipe(
  v.strictObject({
    id: SId,
    createdAt: SDateTime,
    status: v.picklist(['creating', 'ready', 'failed']),
    lastSafeSequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
    errorCode: v.nullable(SBackupErrorCode),
  }),
  v.check(({ status, errorCode }) => {
    if (status === 'failed') return errorCode !== null
    return errorCode === null
  }, 'Safety artifact errors must match the artifact status.'),
)
const isCleanupPending = (status: v.InferOutput<typeof SBackupCleanupStageStatus>) =>
  status !== 'not_applicable' && status !== 'completed'
export const SBackup = v.pipe(
  v.strictObject({
    id: SId,
    status: SBackupStatus,
    createdAt: SDateTime,
    completedAt: v.nullable(SDateTime),
    scope: v.picklist(['installation']),
    phase: SBackupPhase,
    progress: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    checkpoint: SBackupCheckpoint,
    lastSafeSequence: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
    readiness: SBackupReadiness,
    cleanupPending: v.boolean(),
    derivedCleanup: SBackupCleanupStage,
    backupCleanup: SBackupCleanupStage,
    restoreSourceBackupId: v.nullable(SId),
    preRestoreSafetyArtifact: v.nullable(SPreRestoreSafetyArtifact),
    errorCode: v.nullable(SBackupErrorCode),
  }),
  v.check(
    ({
      status,
      phase,
      completedAt,
      createdAt,
      progress,
      checkpoint,
      readiness,
      cleanupPending,
      derivedCleanup,
      backupCleanup,
      restoreSourceBackupId,
      preRestoreSafetyArtifact,
      errorCode,
    }) => {
      const cleanupIsPending =
        isCleanupPending(derivedCleanup.status) || isCleanupPending(backupCleanup.status)
      if (cleanupPending !== cleanupIsPending) return false
      if (
        ['running', 'completed', 'failed'].includes(backupCleanup.status) &&
        derivedCleanup.status !== 'completed'
      ) {
        return false
      }
      const terminal = status === 'available' || status === 'failed'
      if ((terminal && completedAt === null) || (!terminal && completedAt !== null)) return false
      if (completedAt !== null && new Date(String(completedAt)) < new Date(String(createdAt))) {
        return false
      }
      if (status === 'failed') return phase === 'failed' && errorCode !== null
      if (errorCode !== null) return false
      if (status === 'creating') {
        return phase === 'capturing_sqlite' && progress < 1 && checkpoint !== 'structurally_ready'
      }
      if (status === 'restoring') {
        if (restoreSourceBackupId === null || preRestoreSafetyArtifact === null) return false
        if (preRestoreSafetyArtifact.status === 'failed') return false
        if (phase === 'rebuilding_duckdb') {
          return (
            progress < 1 &&
            readiness.structural === 'not_ready' &&
            readiness.analyticsStore === 'rebuilding'
          )
        }
        if (phase === 'cleanup_pending') {
          return progress === 1 && cleanupPending && readiness.structural === 'ready'
        }
        if (phase === 'ready') {
          return progress === 1 && !cleanupPending && readiness.structural === 'ready'
        }
        return (
          phase === 'restoring_sqlite' &&
          progress < 1 &&
          checkpoint !== 'structurally_ready' &&
          readiness.structural === 'not_ready'
        )
      }
      if (status === 'available') {
        return (
          progress === 1 &&
          checkpoint === 'structurally_ready' &&
          readiness.controlStore === 'ready' &&
          readiness.analyticsStore === 'ready' &&
          readiness.structural === 'ready' &&
          (phase === 'ready' || (phase === 'cleanup_pending' && cleanupPending))
        )
      }
      return false
    },
    'Backup status, phase, readiness, cleanup, and timestamp fields must describe one lifecycle state.',
  ),
)
export const SBackupIdFields = v.strictObject({ backupId: SId })
export const SBackupRestoreFields = v.strictObject(
  v.entriesFromObjects([SBackupIdFields, v.strictObject({ confirmation: v.literal('RESTORE') })]),
)
