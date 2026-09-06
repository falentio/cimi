import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import type { BackupRestoreCleanupPort } from '../cleanup.ts'
import { BackupRestoreCleanupWorker } from '../cleanup.ts'
import type { BackupRestoreRepository, AvailableOperation } from '../repository.ts'
import { createBackupOperation } from './fixture.ts'

function createPendingOperation(): AvailableOperation {
  return {
    ...createBackupOperation(),
    status: 'available',
    phase: 'cleanup_pending',
    progress: 1,
    checkpoint: 'structurally_ready',
    completedAt: new Date('2026-09-01T00:00:01.000Z'),
    cleanupPending: true,
    readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
    derivedCleanup: { status: 'pending', startedAt: null, completedAt: null, errorCode: null },
    backupCleanup: { status: 'pending', startedAt: null, completedAt: null, errorCode: null },
  }
}

describe('BackupRestoreCleanupWorker', () => {
  it('runs derived cleanup before historical backup cleanup', async () => {
    const repository = mock<BackupRestoreRepository>()
    const cleanup = mock<BackupRestoreCleanupPort>()
    const operation = createPendingOperation()
    let derivedComplete = false
    const calls: string[] = []

    repository.findCleanupPending.mockImplementation(async () => ({
      ...operation,
      derivedCleanup: {
        ...operation.derivedCleanup,
        status: derivedComplete ? 'completed' : 'pending',
      },
    }))
    repository.claimCleanupStage.mockImplementation(async ({ stage }) => {
      if (stage === 'backup_cleanup' && !derivedComplete) return undefined
      return { operationId: operation.id, stage }
    })
    repository.completeCleanupStage.mockImplementation(async ({ stage }) => {
      calls.push(`complete:${stage}`)
      if (stage === 'derived_cleanup') derivedComplete = true
    })
    cleanup.runDerived.mockImplementation(async () => {
      calls.push('run:derived')
    })
    cleanup.runBackup.mockImplementation(async () => {
      calls.push('run:backup')
    })

    const worker = new BackupRestoreCleanupWorker({
      repository,
      lock: new InMemoryLifecycleLock(),
      cleanup,
      ownerToken: () => 'cleanup_owner',
      clock: () => new Date('2026-09-01T00:00:02.000Z'),
    })

    await worker.runOnce()
    await worker.runOnce()

    expect(calls).toEqual([
      'run:derived',
      'complete:derived_cleanup',
      'run:backup',
      'complete:backup_cleanup',
    ])
  })
})
