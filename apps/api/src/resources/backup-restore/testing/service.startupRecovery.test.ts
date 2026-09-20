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
import { createBackupOperation } from './fixture.ts'

describe('BackupRestoreService.startupRecovery', () => {
  it('records startup quiescence failures as safe operation failures', async () => {
    const repository = mock<BackupRestoreRepository>()
    const operation = createBackupOperation()
    const claimed = { ...operation, updatedAt: new Date('2026-09-01T00:01:00.000Z') }
    const failure = new Error('acceptance drain failed')
    const errors: Array<{ error: unknown; context: unknown }> = []
    repository.findActive.mockResolvedValue(operation)
    repository.claim.mockResolvedValue(claimed)
    repository.fail.mockResolvedValue(undefined)
    const acceptance = new InMemoryAcceptanceQuiescencePort(async () => {
      throw failure
    })
    const service = new BackupRestoreService({
      repository,
      executor: mock<BackupRestoreExecutor>(),
      lock: new InMemoryLifecycleLock(),
      acceptance,
      reads: new InMemoryReadQuiescencePort(),
      dataDirectoryReady: true,
      clock: () => new Date('2026-09-01T00:02:00.000Z'),
      ids: {
        operationId: () => 'bop_1',
        artifactId: () => 'bar_1',
        ownerToken: () => 'own_startup',
      },
      onError: (error, context) => errors.push({ error, context }),
    })

    await service.start()

    expect(repository.fail).toHaveBeenCalledWith({
      operationId: 'bop_1',
      ownerToken: 'own_startup',
      errorCode: 'INTERNAL_SERVER_ERROR',
      now: new Date('2026-09-01T00:02:00.000Z'),
    })
    expect(errors).toContainEqual({
      error: failure,
      context: expect.objectContaining({
        operation: 'backup.create',
        stage: 'startup',
        operationId: 'bop_1',
      }),
    })
  })
})
