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
import { createBackupOperation } from './fixture.ts'

const admin = { id: 'user_1', role: 'admin', installationGrant: true } as unknown as AuthUser

describe('BackupRestoreService.backupFailure', () => {
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
