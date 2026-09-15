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
import { createSourceManifest } from './fixture.ts'

const admin = { id: 'user_1', role: 'admin', installationGrant: true } as unknown as AuthUser

describe('BackupRestoreService.restoreBackup', () => {
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
})
