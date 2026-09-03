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
      progress: 0,
      lastSafeSequence: 42,
      errorCode: null,
    })
  })

  it('reports maintenance state instead of conflicting', async () => {
    const { service, repository } = createInstallationFixture()
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

    await expect(service.getStatus(admin)).resolves.toMatchObject({ status: 'maintenance' })
  })

  it('throws not found when no installation exists', async () => {
    const { service, repository } = createInstallationFixture()
    repository.find.mockResolvedValue(undefined)

    await expect(service.getStatus(admin)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a non-admin', async () => {
    const { service, repository } = createInstallationFixture()

    await expect(service.getStatus(member)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.find).not.toHaveBeenCalled()
  })
})
