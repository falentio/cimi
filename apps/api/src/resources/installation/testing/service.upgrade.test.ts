import type { AuthUser } from '@cimi/auth'
import { describe, expect, it, vi } from 'vitest'
import {
  createInstallationFixture,
  createFakeUpgradeExecutor,
  createInstallationRecord,
} from '../fixture.ts'

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
    const executor = createFakeUpgradeExecutor({
      createSafetyArtifact: async ({ operationId, artifactId }) => {
        order.push('create')
        return {
          id: artifactId,
          generationId: operationId,
          storageKey: `safety/${operationId}.sqlite`,
          schemaVersion: '1',
          sizeBytes: 8,
          checksumAlgorithm: 'sha256' as const,
          checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        }
      },
      migrate: async () => {
        order.push('migrate')
      },
      rebuildAnalytics: async () => {
        order.push('rebuild')
      },
    })
    const { repository, journal, service } = createInstallationFixture({
      ids,
      upgradeExecutor: executor,
    })
    journal.drain = () => {
      order.push('drain')
      return undefined
    }
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockImplementation(async () => {
      order.push('begin')
      return maintenanceRecord()
    })
    repository.findSafetyArtifact.mockImplementation(async () => {
      order.push('findArtifact')
      return undefined
    })
    repository.recordSafetyArtifact.mockImplementation(async () => {
      order.push('record')
      return maintenanceRecord()
    })
    repository.updateUpgradeProgress.mockImplementation(async (update) => {
      order.push(update.progress === 0.5 ? 'progress-0.5' : 'progress-0.9')
      return maintenanceRecord()
    })
    repository.completeUpgrade.mockImplementation(async () => {
      order.push('complete')
      return createInstallationRecord()
    })

    const accepted = await service.upgrade(input, admin)
    await service.stop()

    expect(accepted).toMatchObject({ status: 'maintenance' })
    expect(order).toEqual([
      'begin',
      'drain',
      'findArtifact',
      'create',
      'record',
      'progress-0.5',
      'migrate',
      'rebuild',
      'progress-0.9',
      'complete',
    ])
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

  it('reuses an existing safety artifact without creating or recording', async () => {
    const existing = {
      id: 'bar_1',
      generationId: 'bop_1',
      storageKey: 'safety/bop_1.sqlite',
      schemaVersion: '1',
      sizeBytes: 8,
      checksumAlgorithm: 'sha256' as const,
      checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    }
    const createSafetyArtifact = vi.fn().mockResolvedValue(existing)
    const migrate = vi.fn().mockResolvedValue(undefined)
    const executor = createFakeUpgradeExecutor({ createSafetyArtifact, migrate })
    const { repository, service } = createInstallationFixture({ ids, upgradeExecutor: executor })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())
    repository.findSafetyArtifact.mockResolvedValue(existing)
    repository.recordSafetyArtifact.mockResolvedValue(maintenanceRecord())
    repository.updateUpgradeProgress.mockResolvedValue(maintenanceRecord())
    repository.completeUpgrade.mockResolvedValue(createInstallationRecord())

    await service.upgrade(input, admin)
    await service.stop()

    expect(createSafetyArtifact).not.toHaveBeenCalled()
    expect(repository.recordSafetyArtifact).not.toHaveBeenCalled()
    expect(migrate).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'bop_1' }))
    expect(repository.completeUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'bop_1' }),
    )
  })

  it('skips rollback and failUpgrade when recordSafetyArtifact loses ownership', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const executor = createFakeUpgradeExecutor({ rollback })
    const { repository, service } = createInstallationFixture({ ids, upgradeExecutor: executor })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue(undefined)
    repository.failUpgrade.mockResolvedValue(createInstallationRecord())

    await service.upgrade(input, admin)
    await service.stop()

    expect(repository.failUpgrade).not.toHaveBeenCalled()
    expect(rollback).not.toHaveBeenCalled()
  })

  it('skips rollback and failUpgrade when progress 0.5 loses ownership', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const executor = createFakeUpgradeExecutor({ rollback })
    const { repository, service } = createInstallationFixture({ ids, upgradeExecutor: executor })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue(maintenanceRecord())
    repository.updateUpgradeProgress.mockImplementation(async (update) =>
      update.progress === 0.5 ? undefined : maintenanceRecord(),
    )
    repository.failUpgrade.mockResolvedValue(createInstallationRecord())

    await service.upgrade(input, admin)
    await service.stop()

    expect(repository.failUpgrade).not.toHaveBeenCalled()
    expect(rollback).not.toHaveBeenCalled()
  })

  it('rolls back a rebuild failure without completing', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const executor = createFakeUpgradeExecutor({
      rebuildAnalytics: vi.fn().mockRejectedValue(new Error('rebuild failed')),
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
    expect(repository.completeUpgrade).not.toHaveBeenCalled()
  })

  it('rejects a second upgrade while an operation is durable', async () => {
    const { repository, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(maintenanceRecord())

    await expect(service.upgrade(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.beginUpgrade).not.toHaveBeenCalled()
  })
})
