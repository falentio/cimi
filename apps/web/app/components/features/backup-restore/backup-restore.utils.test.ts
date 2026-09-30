import { describe, expect, it } from 'vitest'
import type {
  Backup,
  BackupRestoreFailure,
  Installation,
  InstallationSignal,
  LockSectionView,
} from './backup-restore.types'
import {
  deriveBackupRestoreActions,
  deriveLifecycleLock,
  formatBackupDate,
  isExactRestoreConfirmation,
  isRestorableSource,
  normalizeBackupRestoreError,
  toBackupOperationSection,
  toBackupRestoreViewModel,
} from './backup-restore.utils'

const none = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

const readyInstallation = {
  status: 'ready',
  defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  dataDirectoryReady: true,
  activeOperation: null,
  cleanupPending: false,
  derivedCleanup: none,
  backupCleanup: none,
  updatedAt: '2026-09-18T10:00:00Z',
} satisfies Installation

function sourceBackup(overrides: Partial<Backup> = {}): Backup {
  return {
    id: 'backup-source',
    status: 'available',
    createdAt: '2026-09-18T10:00:00Z',
    completedAt: '2026-09-18T10:02:00Z',
    scope: 'installation',
    phase: 'ready',
    progress: 1,
    checkpoint: 'structurally_ready',
    lastSafeSequence: 12,
    readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
    cleanupPending: false,
    derivedCleanup: none,
    backupCleanup: none,
    restoreSourceBackupId: null,
    preRestoreSafetyArtifact: null,
    errorCode: null,
    ...overrides,
  }
}

function installationSignal(
  installation: Installation = readyInstallation,
): Extract<InstallationSignal, { kind: 'ready' }> {
  return { kind: 'ready', installation, refreshing: false }
}

describe('backup restore utilities', () => {
  it('allows only available source backups as restore candidates', () => {
    expect(isRestorableSource(sourceBackup())).toBe(true)
    expect(isRestorableSource(sourceBackup({ status: 'restoring' }))).toBe(false)
    expect(isRestorableSource(sourceBackup({ restoreSourceBackupId: 'another-backup' }))).toBe(
      false,
    )
  })

  it('accepts only the exact uppercase restore confirmation', () => {
    expect(isExactRestoreConfirmation('RESTORE')).toBe(true)
    expect(isExactRestoreConfirmation('restore')).toBe(false)
    expect(isExactRestoreConfirmation('RESTORE ')).toBe(false)
  })

  it('keeps restoring and cleanup-pending lifecycle stages distinct', () => {
    const restoring = sourceBackup({
      status: 'restoring',
      phase: 'ready',
      completedAt: null,
      restoreSourceBackupId: 'backup-source',
      preRestoreSafetyArtifact: {
        id: 'safety-1',
        createdAt: '2026-09-18T10:03:00Z',
        status: 'ready',
        lastSafeSequence: 12,
        errorCode: null,
      },
    })
    const cleanupPending = sourceBackup({
      id: 'backup-complete',
      phase: 'cleanup_pending',
      cleanupPending: true,
      backupCleanup: {
        status: 'pending',
        startedAt: null,
        completedAt: null,
        errorCode: null,
      },
    })

    expect(toBackupOperationSection(restoring, { kind: 'idle' })).toMatchObject({
      kind: 'active',
      operation: 'restore',
      stage: 'structurally-ready',
    })
    expect(
      toBackupOperationSection(cleanupPending, {
        kind: 'automatic',
        operationId: cleanupPending.id,
        attempt: 2,
        maxAttempts: 20,
        resumedAfterReload: false,
      }),
    ).toMatchObject({
      kind: 'available',
      cleanupPending: true,
    })
  })

  it('maps every contract error to safe operator copy', () => {
    const codes = [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'BAD_REQUEST',
      'CONFLICT',
      'INCOMPATIBLE_BACKUP',
      'INSUFFICIENT_STORAGE',
      'INTERNAL_SERVER_ERROR',
      'BACKUP_FAILED',
    ] as const

    for (const code of codes) {
      const failure = normalizeBackupRestoreError(
        { code, status: 500, message: '/private/path and checksum=secret' },
        'create',
      )
      expect(failure.code).toBe(code)
      expect(failure.message).not.toContain('/private/path')
      expect(failure.message).not.toContain('checksum')
      expect(JSON.stringify(failure)).not.toContain('secret')
    }
  })

  it('blocks actions while lock state is unknown, held, or cleanup-pending', () => {
    expect(deriveLifecycleLock({ installation: { kind: 'loading' } })).toEqual({ kind: 'loading' })
    const states: readonly LockSectionView[] = [
      { kind: 'loading' },
      { kind: 'unknown', message: 'Refresh to verify installation state.' },
      {
        kind: 'held',
        operationId: 'operation-1',
        operationKind: 'upgrade',
        operationLabel: 'Upgrade',
      },
      { kind: 'cleanup-pending', message: 'Installation cleanup is pending.' },
    ]

    for (const lock of states) {
      expect(
        deriveBackupRestoreActions({
          lock,
          command: { kind: 'idle' },
          trackedOperation: null,
        }),
      ).toMatchObject({ canCreate: false, canRestore: false })
    }

    expect(
      deriveBackupRestoreActions({
        lock: { kind: 'available' },
        command: { kind: 'idle' },
        trackedOperation: null,
      }),
    ).toMatchObject({ canCreate: true, canRestore: true })
  })

  it('preserves ordered cleanup details and safe date labels in the view', () => {
    const backup = sourceBackup({
      cleanupPending: true,
      phase: 'cleanup_pending',
      derivedCleanup: {
        status: 'completed',
        startedAt: '2026-09-18T10:03:00Z',
        completedAt: '2026-09-18T10:04:00Z',
        errorCode: null,
      },
      backupCleanup: {
        status: 'failed',
        startedAt: '2026-09-18T10:04:00Z',
        completedAt: '2026-09-18T10:05:00Z',
        errorCode: 'BACKUP_FAILED',
      },
    })
    const view = toBackupRestoreViewModel({
      data: {
        order: [backup.id],
        records: new Map([[backup.id, backup]]),
        totalCount: 1,
        nextOffset: null,
        hasMore: false,
        selectedBackupId: null,
        trackedOperationId: backup.id,
        trackedOperation: backup,
      },
      list: { kind: 'ready', refreshing: false, loadingMore: false },
      installation: installationSignal({ ...readyInstallation, cleanupPending: true }),
      command: { kind: 'idle' },
      polling: { kind: 'idle' },
      restoreDialog: { kind: 'closed' },
    })

    expect(view.kind).toBe('ready')
    if (view.kind !== 'ready') return
    expect(view.cleanup.kind).toBe('visible')
    if (view.cleanup.kind !== 'visible') return
    expect(view.cleanup.stages.map((stage) => stage.kind)).toEqual(['derived', 'backup'])
    expect(view.cleanup.stages[1].error?.code).toBe('BACKUP_FAILED')
    expect(view.cleanup.stages.map((stage) => stage.statusLabel)).toEqual(['Completed', 'Failed'])
    expect(formatBackupDate('2026-09-18T10:00:00Z')).toContain('2026')
    expect(view.announcement).toContain('cleanup')
  })

  it('shows installation cleanup without inventing an operation', () => {
    const view = toBackupRestoreViewModel({
      data: {
        order: [],
        records: new Map(),
        totalCount: 0,
        nextOffset: null,
        hasMore: false,
        selectedBackupId: null,
        trackedOperationId: null,
        trackedOperation: null,
      },
      list: { kind: 'ready', refreshing: false, loadingMore: false },
      installation: installationSignal({
        ...readyInstallation,
        cleanupPending: true,
        derivedCleanup: {
          status: 'pending',
          startedAt: null,
          completedAt: null,
          errorCode: null,
        },
      }),
      command: { kind: 'idle' },
      polling: { kind: 'idle' },
      restoreDialog: { kind: 'closed' },
    })

    expect(view).toMatchObject({
      kind: 'ready',
      operation: { kind: 'none' },
      cleanup: { kind: 'visible', pending: true },
    })
  })

  it('does not expose access errors or raw exception text', () => {
    const failure = normalizeBackupRestoreError(new Error('storage key /tmp/secret'), 'status')
    expect(failure.kind).toBe('retryable')
    expect(failure).not.toHaveProperty('message', expect.stringContaining('/tmp/secret'))
    expect((failure as BackupRestoreFailure).message).toBe(
      'Backup status could not be loaded. Refresh and try again.',
    )
  })
})
