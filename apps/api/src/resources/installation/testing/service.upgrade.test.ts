import type { AuthUser } from '@cimi/auth'
import { InMemoryAcceptanceJournalPort, InMemoryLifecycleLock } from '@cimi/kernel'
import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { createInstallationFixture, createInstallationRecord } from '../fixture.ts'
import type { InstallationRepository } from '../repository.ts'
import { InstallationService } from '../service.ts'

const admin = { id: 'user_1', role: 'admin' } as unknown as AuthUser
const member = { id: 'user_2', role: 'member' } as unknown as AuthUser
const input = { confirmation: 'UPGRADE' } as const
const ids = {
  installationId: () => 'ins_1',
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
      progress: 0,
      lastSafeSequence: null,
      errorCode: null,
    },
  })

describe('InstallationService.upgrade', () => {
  it('starts an upgrade with a 202 and polls it via getStatus', async () => {
    const { repository, journal, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())

    const result = await service.upgrade(input, admin)

    expect(result.status).toBe('maintenance')
    expect(result.activeOperation).toMatchObject({ operationId: 'bop_1', kind: 'upgrade' })
    expect(journal.drainCalls).toBe(1)
    expect(repository.beginUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'bop_1' }),
    )

    repository.find.mockResolvedValue(maintenanceRecord())
    await expect(service.getStatus(admin)).resolves.toMatchObject({
      status: 'maintenance',
      activeOperation: expect.objectContaining({ operationId: 'bop_1', kind: 'upgrade' }),
    })
  })

  it('drains the acceptance journal before persisting the safety record', async () => {
    const order: string[] = []
    const repository = mock<InstallationRepository>()
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockImplementation(async () => {
      order.push('persist')
      return maintenanceRecord()
    })
    const service = new InstallationService({
      repository,
      lock: new InMemoryLifecycleLock(),
      journal: new InMemoryAcceptanceJournalPort(() => {
        order.push('drain')
      }),
      ids,
    })

    await service.upgrade(input, admin)

    expect(order).toEqual(['drain', 'persist'])
  })

  it('rejects an incompatible manifest without persisting', async () => {
    const { repository, journal, lock, service } = createInstallationFixture({
      ids,
      upgradeArtifact: { isCompatible: () => false },
    })
    repository.find.mockResolvedValue(createInstallationRecord())

    await expect(service.upgrade(input, admin)).rejects.toMatchObject({
      code: 'INCOMPATIBLE_BACKUP',
      status: 422,
    })
    expect(repository.beginUpgrade).not.toHaveBeenCalled()
    expect(journal.drainCalls).toBe(1)
    expect(lock.acquire('upgrade')).toBe(true)
    lock.release()
  })

  it('rejects an async incompatible manifest', async () => {
    const { repository, service } = createInstallationFixture({
      ids,
      upgradeArtifact: { isCompatible: async () => false },
    })
    repository.find.mockResolvedValue(createInstallationRecord())

    await expect(service.upgrade(input, admin)).rejects.toMatchObject({
      code: 'INCOMPATIBLE_BACKUP',
    })
    expect(repository.beginUpgrade).not.toHaveBeenCalled()
  })

  it('accepts an async compatible manifest and asserts artifact wiring', async () => {
    const { repository, service } = createInstallationFixture({
      ids,
      upgradeArtifact: { isCompatible: async () => true },
    })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())

    const result = await service.upgrade(input, admin)

    expect(result.activeOperation).toMatchObject({ operationId: 'bop_1', kind: 'upgrade' })
    expect(repository.beginUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'bop_1',
        activeOperation: expect.objectContaining({
          phase: 'pre_upgrade_safety',
          progress: 0,
        }),
        artifact: expect.objectContaining({
          id: 'bar_1',
          generationId: 'bop_1',
          storageKey: 'safety/bop_1',
          schemaVersion: '1',
          sizeBytes: 0,
          checksumAlgorithm: 'sha256',
          checksumValue: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        }),
      }),
    )
  })

  it('rejects an incoherent record', async () => {
    const { repository, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(
      createInstallationRecord({
        cleanupPending: false,
        derivedCleanup: {
          status: 'pending',
          startedAt: null,
          completedAt: null,
          errorCode: null,
        },
      }),
    )

    await expect(service.upgrade(input, admin)).rejects.toThrow(
      'Installation cleanup flags disagree',
    )
  })

  it('conflicts when an operation is already active', async () => {
    const { repository, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(
      createInstallationRecord({
        status: 'ready',
        activeOperation: {
          operationId: 'bop_0',
          kind: 'upgrade',
          phase: 'pre_upgrade_safety',
          progress: 0,
          lastSafeSequence: null,
          errorCode: null,
        },
      }),
    )

    await expect(service.upgrade(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.beginUpgrade).not.toHaveBeenCalled()
  })

  it('propagates a journal drain failure and releases the lock', async () => {
    const repository = mock<InstallationRepository>()
    const lock = new InMemoryLifecycleLock()
    repository.find.mockResolvedValue(createInstallationRecord())
    const service = new InstallationService({
      repository,
      lock,
      journal: new InMemoryAcceptanceJournalPort(() => {
        throw new Error('drain boom')
      }),
      ids,
    })

    await expect(service.upgrade(input, admin)).rejects.toThrow('drain boom')
    expect(repository.beginUpgrade).not.toHaveBeenCalled()
    expect(lock.acquire('upgrade')).toBe(true)
    lock.release()
  })

  it('maps a raced beginUpgrade constraint to conflict', async () => {
    const { repository, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockRejectedValue(
      new Error('UNIQUE constraint failed: backup_operation.id'),
    )

    await expect(service.upgrade(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('rethrows a non-constraint beginUpgrade error', async () => {
    const { repository, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockRejectedValue(new Error('boom'))

    await expect(service.upgrade(input, admin)).rejects.toThrow('boom')
  })

  it.each([
    { status: 'ready', ok: true },
    { status: 'degraded', ok: true },
    { status: 'uninitialized', ok: false },
    { status: 'maintenance', ok: false },
    { status: 'recovering', ok: true },
  ] as const)('allows upgrade from $status: $ok', async ({ status, ok }) => {
    const { repository, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(createInstallationRecord({ status }))
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())

    if (ok) {
      await expect(service.upgrade(input, admin)).resolves.toMatchObject({
        status: 'maintenance',
      })
    } else {
      await expect(service.upgrade(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(repository.beginUpgrade).not.toHaveBeenCalled()
    }
  })

  it('returns conflict when the lifecycle lock is held', async () => {
    const { repository, lock, service } = createInstallationFixture()
    expect(lock.acquire('backup')).toBe(true)
    try {
      await expect(service.upgrade(input, admin)).rejects.toMatchObject({
        code: 'CONFLICT',
        status: 409,
      })
      expect(repository.find).not.toHaveBeenCalled()
    } finally {
      lock.release()
    }
  })

  it('returns conflict for an incompatible state', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(maintenanceRecord())

    await expect(service.upgrade(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.beginUpgrade).not.toHaveBeenCalled()
  })

  it('returns conflict when no installation exists', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(undefined)

    await expect(service.upgrade(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.beginUpgrade).not.toHaveBeenCalled()
  })

  it('rejects a non-admin without touching the repository', async () => {
    const { repository, service } = createInstallationFixture()

    await expect(service.upgrade(input, member)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.find).not.toHaveBeenCalled()
  })
})
