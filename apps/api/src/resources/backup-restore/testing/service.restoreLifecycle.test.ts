import type { AuthUser } from '@cimi/auth'
import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import {
  InMemoryAcceptanceQuiescencePort,
  InMemoryReadQuiescencePort,
  InMemoryLifecycleLock,
} from '@cimi/kernel'
import { BackupRestoreService } from '../service.ts'
import type { BackupRestoreExecutor } from '../executor.ts'
import type { BackupRestoreRepository } from '../repository.ts'
import { createRestoreOperation, createSafetyManifest, createSourceManifest } from './fixture.ts'

const admin = { id: 'user_1', role: 'admin', installationGrant: true } as unknown as AuthUser

describe('BackupRestoreService.restoreLifecycle', () => {
  it('keeps the global lock held until an asynchronous restore is terminal', async () => {
    let release: (() => void) | undefined
    const restore = new Promise<void>((resolve) => {
      release = resolve
    })
    const repository = mock<BackupRestoreRepository>()
    const executor = mock<BackupRestoreExecutor>()
    const lock = new InMemoryLifecycleLock()
    const operation = createRestoreOperation()
    repository.findSourceManifest.mockResolvedValue(createSourceManifest())
    repository.beginRestore.mockResolvedValue(operation)
    repository.advance.mockResolvedValue(operation)
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue({
      ...operation,
      status: 'restoring',
      phase: 'restoring_sqlite',
      preRestoreSafetyArtifact: createSafetyManifest(),
    })
    repository.complete.mockResolvedValue({
      ...operation,
      status: 'available',
      phase: 'ready',
      completedAt: operation.createdAt,
      progress: 1,
      checkpoint: 'structurally_ready',
      readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
    })
    executor.validateManifest.mockResolvedValue(undefined)
    executor.createPreRestoreSafety.mockResolvedValue(createSafetyManifest())
    executor.restoreSqlite.mockImplementation(() => restore)

    const service = new BackupRestoreService({
      repository,
      executor,
      lock,
      acceptance: new InMemoryAcceptanceQuiescencePort(async () => ({ lastSafeSequence: 42 })),
      reads: new InMemoryReadQuiescencePort(),
      dataDirectoryReady: true,
      ids: {
        operationId: () => 'bop_restore',
        artifactId: () => 'bar_safety',
        ownerToken: () => 'own_restore',
      },
    })

    await service.restoreBackup({ backupId: 'bop_source', confirmation: 'RESTORE' }, admin)
    expect(lock.acquire('backup')).toBeUndefined()
    release?.()
    await service.stop()
  })
})
