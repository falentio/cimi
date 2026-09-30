import { describe, expect, it } from 'vitest'
import type { Backup, BackupList } from './backup-restore.types'
import { createInitialBackupRestoreData, reduceBackupRestoreData } from './backup-restore.reducer'

const cleanupStage = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

function sourceBackup(id: string): Backup {
  return {
    id,
    status: 'available',
    createdAt: '2026-09-18T10:00:00Z',
    completedAt: '2026-09-18T10:02:00Z',
    scope: 'installation',
    phase: 'ready',
    progress: 1,
    checkpoint: 'structurally_ready',
    lastSafeSequence: 12,
    readiness: {
      controlStore: 'ready',
      analyticsStore: 'ready',
      structural: 'ready',
    },
    cleanupPending: false,
    derivedCleanup: cleanupStage,
    backupCleanup: cleanupStage,
    restoreSourceBackupId: null,
    preRestoreSafetyArtifact: null,
    errorCode: null,
  }
}

function creatingBackup(id: string): Backup {
  return {
    ...sourceBackup(id),
    status: 'creating',
    completedAt: null,
    phase: 'capturing_sqlite',
    progress: 0.2,
    checkpoint: 'none',
    lastSafeSequence: null,
    readiness: {
      controlStore: 'not_ready',
      analyticsStore: 'not_ready',
      structural: 'not_ready',
    },
  }
}

function page(items: readonly Backup[], nextOffset: number | null = null): BackupList {
  return {
    items: [...items],
    nextOffset,
    hasMore: nextOffset !== null,
    totalCount: items.length,
  }
}

describe('backup restore data reducer', () => {
  it('replaces and appends pages without changing existing order', () => {
    const first = sourceBackup('backup-first')
    const second = sourceBackup('backup-second')
    const third = sourceBackup('backup-third')
    let state = reduceBackupRestoreData(createInitialBackupRestoreData(), {
      kind: 'list-replaced',
      page: page([first, second], 2),
    })

    state = reduceBackupRestoreData(state, {
      kind: 'list-appended',
      page: page([second, third]),
    })

    expect(state.order).toEqual(['backup-first', 'backup-second', 'backup-third'])
    expect(state.nextOffset).toBeNull()
    expect(state.records.get('backup-second')).toEqual(second)
  })

  it('shows a command result immediately without treating a restore as catalog history', () => {
    const source = sourceBackup('backup-source')
    const restore = {
      ...sourceBackup('restore-result'),
      status: 'restoring' as const,
      phase: 'restoring_sqlite' as const,
      completedAt: null,
      progress: 0.4,
      checkpoint: 'sqlite_restored' as const,
      restoreSourceBackupId: source.id,
      preRestoreSafetyArtifact: {
        id: 'safety-1',
        createdAt: '2026-09-18T10:03:00Z',
        status: 'ready' as const,
        lastSafeSequence: 12,
        errorCode: null,
      },
      readiness: {
        controlStore: 'not_ready' as const,
        analyticsStore: 'not_ready' as const,
        structural: 'not_ready' as const,
      },
    } satisfies Backup
    let state = reduceBackupRestoreData(createInitialBackupRestoreData(), {
      kind: 'list-replaced',
      page: page([source]),
    })

    state = reduceBackupRestoreData(state, { kind: 'operation-received', operation: restore })

    expect(state.order).toEqual(['backup-source'])
    expect(state.trackedOperation).toEqual(restore)
    expect(state.records.get(restore.id)).toEqual(restore)
  })

  it('keeps selection and operation clearing constrained to known current records', () => {
    const first = sourceBackup('backup-first')
    const second = sourceBackup('backup-second')
    let state = reduceBackupRestoreData(createInitialBackupRestoreData(), {
      kind: 'list-replaced',
      page: page([first, second]),
    })

    state = reduceBackupRestoreData(state, {
      kind: 'selection-changed',
      backupId: 'missing-backup',
    })
    expect(state.selectedBackupId).toBeNull()

    state = reduceBackupRestoreData(state, {
      kind: 'selection-changed',
      backupId: first.id,
    })
    expect(state.selectedBackupId).toBe(first.id)

    state = reduceBackupRestoreData(state, { kind: 'operation-received', operation: first })
    state = reduceBackupRestoreData(state, { kind: 'operation-received', operation: second })
    state = reduceBackupRestoreData(state, {
      kind: 'operation-cleared',
      operationId: first.id,
    })
    expect(state.trackedOperation?.id).toBe(second.id)
  })

  it('keeps a newer lifecycle snapshot when stale operation data arrives later', () => {
    const latest = sourceBackup('backup-operation')
    const stale = creatingBackup(latest.id)
    let state = reduceBackupRestoreData(createInitialBackupRestoreData(), {
      kind: 'operation-received',
      operation: latest,
    })

    state = reduceBackupRestoreData(state, { kind: 'operation-received', operation: stale })

    expect(state.records.get(latest.id)).toEqual(latest)
    expect(state.trackedOperation).toEqual(latest)
  })
})
