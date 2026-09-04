import type { AuthUser } from '@cimi/auth'
import { InMemoryAcceptanceJournalPort, InMemoryLifecycleLock } from '@cimi/kernel'
import { describe, expect, it, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'
import {
  createInstallationFixture,
  createFakeUpgradeExecutor,
  createInstallationRecord,
} from '../fixture.ts'
import type { InstallationRepository } from '../repository.ts'
import { InstallationService } from '../service.ts'

const admin = { id: 'user_1', role: 'admin' } as unknown as AuthUser
const input = { confirmation: 'UPGRADE' } as const
const ids = {
  installationId: () => 'ins_1',
  retentionPolicyId: () => 'rtn_1',
  operationId: () => 'bop_1',
  artifactId: () => 'bar_1',
}
const maintenanceRecord = () =>
  createInstallationRecord({
    status: 'maintenance',
    activeOperation: {
      operationId: 'bop_1',
      kind: 'upgrade',
      phase: 'pre_upgrade_safety',
      checkpoint: 'none',
      progress: 0,
      lastSafeSequence: null,
      errorCode: null,
    },
  })

describe('InstallationService.upgrade', () => {
  it('persists the operation before draining and returns accepted maintenance', async () => {
    const order: string[] = []
    const repository = mock<InstallationRepository>()
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockImplementation(async () => {
      order.push('begin')
      return maintenanceRecord()
    })
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockImplementation(async () => {
      order.push('artifact')
      return maintenanceRecord()
    })
    repository.updateUpgradeProgress.mockResolvedValue(maintenanceRecord())
    repository.completeUpgrade.mockResolvedValue(createInstallationRecord())
    const service = new InstallationService({
      repository,
      lock: new InMemoryLifecycleLock(),
      journal: new InMemoryAcceptanceJournalPort(() => {
        order.push('drain')
      }),
      dataDirectoryReady: true,
      ids,
      upgradeExecutor: createFakeUpgradeExecutor(),
    })

    const accepted = await service.upgrade(input, admin)
    await service.stop()

    expect(accepted).toMatchObject({ status: 'maintenance' })
    expect(order.slice(0, 2)).toEqual(['begin', 'drain'])
  })

  it('holds admission until the asynchronous executor reaches a terminal state', async () => {
    let releaseMigration: (() => void) | undefined
    const migration = new Promise<void>((resolve) => {
      releaseMigration = resolve
    })
    const executor = createFakeUpgradeExecutor({ migrate: () => migration })
    const { repository, lock, service } = createInstallationFixture({
      ids,
      upgradeExecutor: executor,
    })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue(maintenanceRecord())
    repository.updateUpgradeProgress.mockResolvedValue(maintenanceRecord())
    repository.completeUpgrade.mockResolvedValue(createInstallationRecord())

    const accepted = await service.upgrade(input, admin)

    expect(accepted).toMatchObject({
      status: 'maintenance',
      activeOperation: { operationId: 'bop_1', kind: 'upgrade', checkpoint: 'none' },
    })
    expect(lock.acquire('backup')).toBeUndefined()
    releaseMigration?.()
    await service.stop()
    expect(repository.completeUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'bop_1' }),
    )
    const lease = lock.acquire('backup')
    expect(lease).toBeDefined()
    await lease?.release()
  })

  it('keeps the acceptance journal after durable operation creation', async () => {
    const order: string[] = []
    const repository = mock<InstallationRepository>()
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockImplementation(async () => {
      order.push('begin')
      return maintenanceRecord()
    })
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockImplementation(async () => {
      order.push('artifact')
      return maintenanceRecord()
    })
    repository.updateUpgradeProgress.mockResolvedValue(maintenanceRecord())
    repository.completeUpgrade.mockResolvedValue(createInstallationRecord())
    const journal = new InMemoryAcceptanceJournalPort(() => {
      order.push('drain')
    })
    const service = new InstallationService({
      repository,
      lock: new InMemoryLifecycleLock(),
      journal,
      dataDirectoryReady: true,
      ids,
      upgradeExecutor: createFakeUpgradeExecutor(),
    })

    await service.upgrade(input, admin)
    await service.stop()

    expect(order.slice(0, 2)).toEqual(['begin', 'drain'])
  })

  it('rolls back a migration failure and records a terminal internal error', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const executor = createFakeUpgradeExecutor({
      migrate: vi.fn().mockRejectedValue(new Error('migration failed')),
      rollback,
    })
    const { repository, service } = createInstallationFixture({ ids, upgradeExecutor: executor })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue(maintenanceRecord())
    repository.updateUpgradeProgress.mockResolvedValue(maintenanceRecord())
    repository.failUpgrade.mockResolvedValue(
      createInstallationRecord({ status: 'degraded', activeOperation: null }),
    )

    await service.upgrade(input, admin)
    await service.stop()

    expect(rollback).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'bop_1',
        artifact: expect.objectContaining({ sizeBytes: 8 }),
      }),
    )
    expect(repository.failUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'bop_1' }),
    )
  })

  it('rejects a second upgrade while an operation is durable', async () => {
    const { repository, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(maintenanceRecord())

    await expect(service.upgrade(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.beginUpgrade).not.toHaveBeenCalled()
  })
})
