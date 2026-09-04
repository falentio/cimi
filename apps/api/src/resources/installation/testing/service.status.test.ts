import type { AuthUser } from '@cimi/auth'
import { describe, expect, it } from 'vitest'
import { createInstallationFixture, createInstallationRecord } from '../fixture.ts'

const admin = { id: 'user_1', role: 'admin' } as unknown as AuthUser
const member = { id: 'user_2', role: 'member' } as unknown as AuthUser

describe('InstallationService.getStatus', () => {
  it('returns only safe public fields', async () => {
    const { service, repository } = createInstallationFixture()
    repository.find.mockResolvedValue(createInstallationRecord())

    const result = await service.getStatus(admin)

    expect(Object.keys(result).sort()).toEqual(
      [
        'activeOperation',
        'backupCleanup',
        'cleanupPending',
        'dataDirectoryReady',
        'defaultRetention',
        'derivedCleanup',
        'status',
        'updatedAt',
      ].sort(),
    )
    expect(result).not.toHaveProperty('id')
    expect(JSON.stringify(result)).not.toContain('ins_1')
    expect(JSON.stringify(result)).not.toContain('storageKey')
    expect(JSON.stringify(result)).not.toContain('checksumValue')
    expect(JSON.stringify(result)).not.toContain('safety/')
  })

  it('exposes the active operation kind, phase, progress, and sequence', async () => {
    const { service, repository } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({
        status: 'maintenance',
        activeOperation: {
          operationId: 'bop_1',
          kind: 'upgrade',
          phase: 'pre_upgrade_safety',
          checkpoint: 'none',
          progress: 0,
          lastSafeSequence: 42,
          errorCode: null,
        },
      }),
    )

    const result = await service.getStatus(admin)

    expect(result.activeOperation).toEqual({
      operationId: 'bop_1',
      kind: 'upgrade',
      phase: 'pre_upgrade_safety',
      checkpoint: 'none',
      progress: 0,
      lastSafeSequence: 42,
      errorCode: null,
    })
  })

  it.each([
    { name: 'ready', status: 'ready' },
    { name: 'maintenance', status: 'maintenance' },
    { name: 'recovering', status: 'recovering' },
    { name: 'degraded', status: 'degraded' },
    { name: 'uninitialized', status: 'uninitialized' },
  ] as const)('maps $name state', async ({ status }) => {
    const { service, repository } = createInstallationFixture()
    repository.find.mockResolvedValue(createInstallationRecord({ status }))

    const result = await service.getStatus(admin)

    expect(result.status).toBe(status)
    expect(result.activeOperation).toBeNull()
    expect(result.defaultRetention).toEqual({
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
    })
  })

  it('throws not found when no installation exists', async () => {
    const { service, repository } = createInstallationFixture()
    repository.find.mockResolvedValue(undefined)

    await expect(service.getStatus(admin)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects an incoherent cleanup flag', async () => {
    const { service, repository } = createInstallationFixture()
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

    await expect(service.getStatus(admin)).rejects.toThrow('Installation cleanup flags disagree')
  })

  it.each(['running', 'completed', 'failed'] as const)(
    'rejects backup %s before derived completes',
    async (backupStatus) => {
      const { service, repository } = createInstallationFixture()
      const startedAt = '2026-09-01T00:00:00.000Z'
      repository.find.mockResolvedValue(
        createInstallationRecord({
          cleanupPending: true,
          derivedCleanup: {
            status: 'pending',
            startedAt: null,
            completedAt: null,
            errorCode: null,
          },
          backupCleanup: {
            status: backupStatus,
            startedAt,
            completedAt: startedAt,
            errorCode: backupStatus === 'failed' ? 'BACKUP_FAILED' : null,
          },
        }),
      )

      await expect(service.getStatus(admin)).rejects.toThrow(
        'Installation backup cleanup started before derived cleanup completed',
      )
    },
  )

  it('allows backup pending when derived already completed', async () => {
    const { service, repository } = createInstallationFixture()
    const stamp = '2026-09-01T00:00:00.000Z'
    repository.find.mockResolvedValue(
      createInstallationRecord({
        cleanupPending: true,
        derivedCleanup: {
          status: 'completed',
          startedAt: stamp,
          completedAt: stamp,
          errorCode: null,
        },
        backupCleanup: { status: 'pending', startedAt: null, completedAt: null, errorCode: null },
      }),
    )

    await expect(service.getStatus(admin)).resolves.toMatchObject({ status: 'ready' })
  })

  it('rejects a non-admin', async () => {
    const { service, repository } = createInstallationFixture()

    await expect(service.getStatus(member)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.find).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller', async () => {
    const { service, repository } = createInstallationFixture()

    await expect(service.getStatus(undefined as unknown as AuthUser)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(repository.find).not.toHaveBeenCalled()
  })
})
