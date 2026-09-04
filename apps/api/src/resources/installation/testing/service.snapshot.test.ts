import { describe, expect, it } from 'vitest'
import { createInstallationFixture, createInstallationRecord } from '../fixture.ts'

describe('InstallationService.snapshotForHealth', () => {
  it('returns undefined without an installation', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(undefined)

    await expect(service.snapshotForHealth()).resolves.toBeUndefined()
  })

  it('propagates find failures', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockRejectedValue(new Error('boom'))

    await expect(service.snapshotForHealth()).rejects.toThrow('boom')
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
          checkpoint: 'none',
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

  it.each(['recovering', 'degraded', 'uninitialized'] as const)(
    'maps a %s row to a %s snapshot',
    async (status) => {
      const { repository, service } = createInstallationFixture()
      repository.find.mockResolvedValue(createInstallationRecord({ status }))

      await expect(service.snapshotForHealth()).resolves.toEqual({
        installationStatus: status,
        cleanupPending: false,
      })
    },
  )

  it('propagates cleanupPending', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({
        status: 'ready',
        cleanupPending: true,
        derivedCleanup: {
          status: 'pending',
          startedAt: null,
          completedAt: null,
          errorCode: null,
        },
      }),
    )

    await expect(service.snapshotForHealth()).resolves.toEqual({
      installationStatus: 'ready',
      cleanupPending: true,
    })
  })

  it('propagates backup cleanupPending', async () => {
    const { repository, service } = createInstallationFixture()
    const stamp = '2026-09-01T00:00:00.000Z'
    repository.find.mockResolvedValue(
      createInstallationRecord({
        status: 'ready',
        cleanupPending: true,
        derivedCleanup: {
          status: 'completed',
          startedAt: stamp,
          completedAt: stamp,
          errorCode: null,
        },
        backupCleanup: {
          status: 'running',
          startedAt: stamp,
          completedAt: null,
          errorCode: null,
        },
      }),
    )

    await expect(service.snapshotForHealth()).resolves.toEqual({
      installationStatus: 'ready',
      cleanupPending: true,
    })
  })

  it.each([
    { status: 'pending', pending: true },
    { status: 'not_started', pending: true },
    { status: 'running', pending: true },
    { status: 'failed', pending: true },
    { status: 'completed', pending: false },
    { status: 'not_applicable', pending: false },
  ] as const)('cleanup $status implies pending $pending', async ({ status, pending }) => {
    const { repository, service } = createInstallationFixture()
    const stamp = '2026-09-01T00:00:00.000Z'
    const stage =
      status === 'not_applicable' || status === 'not_started' || status === 'pending'
        ? { status, startedAt: null, completedAt: null, errorCode: null }
        : status === 'running'
          ? { status, startedAt: stamp, completedAt: null, errorCode: null }
          : status === 'completed'
            ? { status, startedAt: stamp, completedAt: stamp, errorCode: null }
            : { status, startedAt: stamp, completedAt: stamp, errorCode: 'CLEANUP_FAILED' as const }
    repository.find.mockResolvedValue(
      createInstallationRecord({
        cleanupPending: pending,
        derivedCleanup: stage,
      }),
    )

    const snapshot = await service.snapshotForHealth()
    expect(snapshot).toEqual({ installationStatus: 'ready', cleanupPending: pending })
  })
})
