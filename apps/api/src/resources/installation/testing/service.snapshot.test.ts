import { describe, expect, it } from 'vitest'
import { createInstallationFixture, createInstallationRecord } from '../fixture.ts'

describe('InstallationService.snapshotForHealth', () => {
  it('returns undefined without an installation', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(undefined)

    await expect(service.snapshotForHealth()).resolves.toBeUndefined()
  })

  it('maps a ready row to a ready snapshot', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(createInstallationRecord())

    await expect(service.snapshotForHealth()).resolves.toEqual({
      installationStatus: 'ready',
      cleanupPending: false,
    })
  })

  it('maps a maintenance row to a maintenance snapshot', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
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
      }),
    )

    await expect(service.snapshotForHealth()).resolves.toEqual({
      installationStatus: 'maintenance',
      cleanupPending: false,
    })
  })
})
