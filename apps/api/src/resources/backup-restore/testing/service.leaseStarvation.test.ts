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
import { createBackupOperation, createSourceManifest } from './fixture.ts'

const admin = { id: 'user_1', role: 'admin', installationGrant: true } as unknown as AuthUser

function createStarvationFixture() {
  const lock = new InMemoryLifecycleLock()
  const repository = mock<BackupRestoreRepository>()
  const executor = mock<BackupRestoreExecutor>()
  const operation = createBackupOperation()
  repository.beginBackup.mockResolvedValue(operation)
  repository.advance.mockResolvedValue(operation)
  repository.findAuthoritativeArtifact.mockResolvedValue(undefined)
  repository.recordBackupArtifact.mockResolvedValue(operation)
  repository.complete.mockResolvedValue({
    ...operation,
    status: 'available',
    phase: 'ready',
    progress: 1,
    checkpoint: 'structurally_ready',
    completedAt: operation.createdAt,
    readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
  })
  executor.captureBackup.mockResolvedValue(createSourceManifest())
  const service = new BackupRestoreService({
    repository,
    executor,
    lock,
    acceptance: new InMemoryAcceptanceQuiescencePort(async () => ({ lastSafeSequence: 42 })),
    reads: new InMemoryReadQuiescencePort(),
    dataDirectoryReady: true,
    clock: () => new Date('2026-09-01T00:00:00.000Z'),
    ids: {
      operationId: () => 'bop_1',
      artifactId: () => 'bar_1',
      ownerToken: () => 'own_1',
    },
  })
  return { lock, repository, executor, service }
}

describe('BackupRestoreService.leaseStarvation', () => {
  it('acquires the exclusive backup lease once an in-flight ingestion lease drains', async () => {
    const { lock, service } = createStarvationFixture()
    const ingestionLease = lock.acquire('ingestion')
    expect(ingestionLease).toBeDefined()

    const pending = service.createBackup({}, admin)
    ingestionLease?.release()

    await expect(pending).resolves.toMatchObject({ status: 'creating', id: 'bop_1' })
    await service.stop()
  })
})
