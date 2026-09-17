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

describe('BackupRestoreService.getStatus', () => {
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
})
