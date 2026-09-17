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

describe('BackupRestoreService.createBackup', () => {
  it('persists before quiescing and captures only after a safe acceptance sequence', async () => {
    const order: string[] = []
    const repository = mock<BackupRestoreRepository>()
    const executor = mock<BackupRestoreExecutor>()
    const acceptance = new InMemoryAcceptanceQuiescencePort(async () => {
      order.push('drain')
      return { lastSafeSequence: 42 }
    })
    const reads = new InMemoryReadQuiescencePort()
    const operation = createBackupOperation()
    const captured = createSourceManifest()

    repository.beginBackup.mockImplementation(async () => {
      order.push('begin')
      return operation
    })
    repository.advance.mockImplementation(async (input) => {
      order.push(`advance:${input.lastSafeSequence ?? 'none'}`)
      return { ...operation, lastSafeSequence: input.lastSafeSequence }
    })
    repository.findAuthoritativeArtifact.mockResolvedValue(undefined)
    repository.recordBackupArtifact.mockImplementation(async () => {
      order.push('record')
      return operation
    })
    repository.complete.mockImplementation(async () => {
      order.push('complete')
      return {
        ...operation,
        status: 'available',
        phase: 'ready',
        progress: 1,
        checkpoint: 'structurally_ready',
        completedAt: operation.createdAt,
        readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
      }
    })
    executor.captureBackup.mockImplementation(async () => {
      order.push('capture')
      return captured
    })

    const service = new BackupRestoreService({
      repository,
      executor,
      lock: new InMemoryLifecycleLock(),
      acceptance,
      reads,
      dataDirectoryReady: true,
      clock: () => new Date('2026-09-01T00:00:00.000Z'),
      ids: {
        operationId: () => 'bop_1',
        artifactId: () => 'bar_1',
        ownerToken: () => 'own_1',
      },
    })

    await service.createBackup({}, admin)
    await service.stop()

    expect(order).toEqual(['begin', 'drain', 'advance:42', 'capture', 'record', 'complete'])
    expect(repository.beginBackup).toHaveBeenCalledBefore(repository.advance)
    expect(executor.captureBackup).toHaveBeenCalledWith({
      operationId: 'bop_1',
      artifactId: 'bar_1',
      lastSafeSequence: 42,
    })
  })
})
