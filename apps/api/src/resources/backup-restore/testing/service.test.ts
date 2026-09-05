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
import {
  createBackupOperation,
  createRestoreOperation,
  createSafetyManifest,
  createSourceManifest,
} from './fixture.ts'

const admin = { id: 'user_1', role: 'admin', installationGrant: true } as unknown as AuthUser

describe('BackupRestoreService', () => {
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

  it('rejects restore without the literal confirmation before acquiring lifecycle state', async () => {
    const repository = mock<BackupRestoreRepository>()
    const service = new BackupRestoreService({
      repository,
      executor: mock<BackupRestoreExecutor>(),
      lock: new InMemoryLifecycleLock(),
      acceptance: new InMemoryAcceptanceQuiescencePort(),
      reads: new InMemoryReadQuiescencePort(),
      dataDirectoryReady: true,
    })

    await expect(
      service.restoreBackup({ backupId: 'bop_1', confirmation: 'RESTORE' }, admin),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.beginRestore).not.toHaveBeenCalled()
  })

  it('does not expose executor storage details in the public operation', async () => {
    const repository = mock<BackupRestoreRepository>()
    repository.find.mockResolvedValue(createBackupOperation())
    const service = new BackupRestoreService({
      repository,
      executor: mock<BackupRestoreExecutor>(),
      lock: new InMemoryLifecycleLock(),
      acceptance: new InMemoryAcceptanceQuiescencePort(),
      reads: new InMemoryReadQuiescencePort(),
      dataDirectoryReady: true,
    })

    const result = await service.getStatus({ backupId: 'bop_1' }, admin)

    expect(result).not.toHaveProperty('storageKey')
    expect(result).not.toHaveProperty('checksumValue')
    expect(result).not.toHaveProperty('ownerToken')
  })

  it('maps an incompatible manifest during preflight to the contract error', async () => {
    const repository = mock<BackupRestoreRepository>()
    const executor = mock<BackupRestoreExecutor>()
    repository.findSourceManifest.mockResolvedValue(createSourceManifest())
    executor.validateManifest.mockRejectedValue(new Error('manifest is newer'))
    const service = new BackupRestoreService({
      repository,
      executor,
      lock: new InMemoryLifecycleLock(),
      acceptance: new InMemoryAcceptanceQuiescencePort(),
      reads: new InMemoryReadQuiescencePort(),
      dataDirectoryReady: true,
    })

    await expect(
      service.restoreBackup({ backupId: 'bop_1', confirmation: 'RESTORE' }, admin),
    ).rejects.toMatchObject({ code: 'INCOMPATIBLE_BACKUP' })
  })

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

  it('records asynchronous capture failures as safe backup failures', async () => {
    const repository = mock<BackupRestoreRepository>()
    const executor = mock<BackupRestoreExecutor>()
    const operation = createBackupOperation()
    repository.beginBackup.mockResolvedValue(operation)
    repository.advance.mockResolvedValue({ ...operation, lastSafeSequence: 0 })
    repository.findAuthoritativeArtifact.mockResolvedValue(undefined)
    repository.fail.mockResolvedValue(undefined)
    executor.captureBackup.mockRejectedValue(new Error('capture failed'))
    const service = new BackupRestoreService({
      repository,
      executor,
      lock: new InMemoryLifecycleLock(),
      acceptance: new InMemoryAcceptanceQuiescencePort(),
      reads: new InMemoryReadQuiescencePort(),
      dataDirectoryReady: true,
    })

    await service.createBackup({}, admin)
    await service.stop()

    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'BACKUP_FAILED' }),
    )
  })
})
