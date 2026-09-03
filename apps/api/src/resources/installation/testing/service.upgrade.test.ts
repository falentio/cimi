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
    const { repository, journal, service } = createInstallationFixture({
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
