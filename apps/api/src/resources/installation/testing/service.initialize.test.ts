import type { AuthUser } from '@cimi/auth'
import { describe, expect, it } from 'vitest'
import { createInstallationFixture, createInstallationRecord } from '../fixture.ts'

const admin = { id: 'user_1', role: 'admin' } as unknown as AuthUser
const member = { id: 'user_2', role: 'member' } as unknown as AuthUser
const retention = { eventMonths: 12, profileMonths: 12, replayMonths: null }
const input = { defaultRetention: retention }

describe('InstallationService.initialize', () => {
  it('creates the installation with a 201 and the default retention policy', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(undefined)
    repository.insert.mockResolvedValue(createInstallationRecord())

    const result = await service.initialize(input, admin)

    expect(result).toEqual({
      status: 201,
      body: expect.objectContaining({ status: 'ready', defaultRetention: retention }),
    })
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventMonths: 12,
        profileMonths: 12,
        replayMonths: null,
        dataDirectoryReady: true,
      }),
    )
  })

  it('reuses the installation with a 200 for convergent input', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(createInstallationRecord())

    const result = await service.initialize(input, admin)

    expect(result.status).toBe(200)
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('rejects incompatible retention with a conflict', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({
        defaultRetention: { eventMonths: 24, profileMonths: 24, replayMonths: null },
      }),
    )

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('returns conflict when the lifecycle lock is held', async () => {
    const { repository, lock, service } = createInstallationFixture()
    expect(lock.acquire('upgrade')).toBe(true)
    try {
      await expect(service.initialize(input, admin)).rejects.toMatchObject({
        code: 'CONFLICT',
        status: 409,
      })
      expect(repository.find).not.toHaveBeenCalled()
    } finally {
      lock.release()
    }
  })

  it('sees the created row on a concurrent second call', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(createInstallationRecord())
    repository.insert.mockRejectedValue(
      new Error('UNIQUE constraint failed: installation.singleton_key'),
    )

    const result = await service.initialize(input, admin)

    expect(result.status).toBe(200)
  })

  it('returns conflict when a lifecycle operation is active', async () => {
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

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('returns conflict when the data directory is missing', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(createInstallationRecord({ dataDirectoryReady: false }))

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('activates a seeded uninitialized row with a 201', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'uninitialized', dataDirectoryReady: true }),
    )
    repository.update.mockResolvedValue(createInstallationRecord())

    const result = await service.initialize(input, admin)

    expect(result.status).toBe(201)
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready', dataDirectoryReady: true }),
    )
  })

  it('rejects a non-admin without touching the repository', async () => {
    const { repository, service } = createInstallationFixture()

    await expect(service.initialize(input, member)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.find).not.toHaveBeenCalled()
  })
})
