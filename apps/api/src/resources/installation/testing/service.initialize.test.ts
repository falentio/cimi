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
    const stored = createInstallationRecord()
    repository.find.mockResolvedValue(stored)

    const result = await service.initialize(input, admin)

    expect(result.status).toBe(200)
    expect(result).toEqual({
      status: 200,
      body: {
        status: stored.status,
        defaultRetention: stored.defaultRetention,
        dataDirectoryReady: stored.dataDirectoryReady,
        activeOperation: stored.activeOperation,
        cleanupPending: stored.cleanupPending,
        derivedCleanup: stored.derivedCleanup,
        backupCleanup: stored.backupCleanup,
        updatedAt: stored.updatedAt,
      },
    })
    expect(result).not.toHaveProperty('id')
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('reuses a degraded installation with a 200 for convergent input', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(createInstallationRecord({ status: 'degraded' }))

    const result = await service.initialize(input, admin)

    expect(result.status).toBe(200)
    expect(repository.insert).not.toHaveBeenCalled()
    expect(repository.update).not.toHaveBeenCalled()
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
    const lease = lock.acquire('upgrade')
    expect(lease).toBeDefined()
    try {
      await expect(service.initialize(input, admin)).rejects.toMatchObject({
        code: 'CONFLICT',
        status: 409,
      })
      expect(repository.find).not.toHaveBeenCalled()
    } finally {
      if (lease !== undefined) lease.release()
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
    expect(repository.find).toHaveBeenCalledTimes(2)
    expect(repository.insert).toHaveBeenCalledTimes(1)
  })

  it('conflicts on a raced divergent retention', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(undefined).mockResolvedValueOnce(
      createInstallationRecord({
        defaultRetention: { eventMonths: 24, profileMonths: 24, replayMonths: null },
      }),
    )
    repository.insert.mockRejectedValue(
      new Error('UNIQUE constraint failed: installation.singleton_key'),
    )

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.find).toHaveBeenCalledTimes(2)
    expect(repository.insert).toHaveBeenCalledTimes(1)
  })

  it('activates a raced uninitialized row with a 201', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(
        createInstallationRecord({ status: 'uninitialized', dataDirectoryReady: true }),
      )
    repository.insert.mockRejectedValue(
      new Error('UNIQUE constraint failed: installation.singleton_key'),
    )
    repository.activate.mockResolvedValue(createInstallationRecord())

    const result = await service.initialize(input, admin)

    expect(result.status).toBe(201)
    expect(repository.find).toHaveBeenCalledTimes(2)
    expect(repository.insert).toHaveBeenCalledTimes(1)
  })

  it('conflicts on a raced active operation', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(undefined).mockResolvedValueOnce(
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
    repository.insert.mockRejectedValue(
      new Error('UNIQUE constraint failed: installation.singleton_key'),
    )

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.find).toHaveBeenCalledTimes(2)
    expect(repository.insert).toHaveBeenCalledTimes(1)
  })

  it('rethrows a non-constraint insert error', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(undefined)
    repository.insert.mockRejectedValue(new Error('boom'))

    await expect(service.initialize(input, admin)).rejects.toThrow('boom')
  })

  it('rethrows when the raced row disappears', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
    repository.insert.mockRejectedValue(
      new Error('UNIQUE constraint failed: installation.singleton_key'),
    )

    await expect(service.initialize(input, admin)).rejects.toThrow(/constraint|unique/i)
    expect(repository.find).toHaveBeenCalledTimes(2)
  })

  it('rejects an incoherent stored record', async () => {
    const { repository, service } = createInstallationFixture()
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

    await expect(service.initialize(input, admin)).rejects.toThrow(
      'Installation cleanup flags disagree',
    )
  })

  it('conflicts when activating an uninitialized row races away', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'uninitialized', dataDirectoryReady: true }),
    )
    repository.activate.mockResolvedValue(undefined)

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('conflicts on divergent retention for a degraded idle record', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({
        status: 'degraded',
        defaultRetention: { eventMonths: 24, profileMonths: 24, replayMonths: null },
      }),
    )

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('distinguishes null replayMonths from a number', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({
        defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: 6 },
      }),
    )

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it.each(['upgrade', 'restore', 'site_deletion', 'site_recovery', 'site_purge'] as const)(
    'returns conflict when a %s operation is active',
    async (kind) => {
      const { repository, service } = createInstallationFixture()
      repository.find.mockResolvedValue(
        createInstallationRecord({
          status: 'maintenance',
          activeOperation: {
            operationId: 'bop_1',
            kind,
            phase: 'pre_upgrade_safety',
            checkpoint: 'none',
            progress: 0,
            lastSafeSequence: null,
            errorCode: null,
          },
        }),
      )

      await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(repository.insert).not.toHaveBeenCalled()
    },
  )

  it('returns conflict when the data directory is missing', async () => {
    const { repository, service } = createInstallationFixture({ dataDirectoryReady: false })
    repository.find.mockResolvedValue(createInstallationRecord({ dataDirectoryReady: false }))

    await expect(service.initialize(input, admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('activates a seeded uninitialized row with a 201', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'uninitialized', dataDirectoryReady: true }),
    )
    repository.activate.mockResolvedValue(createInstallationRecord())

    const result = await service.initialize(input, admin)

    expect(result.status).toBe(201)
    expect(repository.activate).toHaveBeenCalledWith(
      expect.objectContaining({ dataDirectoryReady: true }),
    )
  })

  it('applies the new retention when activating an uninitialized row', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({
        status: 'uninitialized',
        dataDirectoryReady: true,
        defaultRetention: { eventMonths: 24, profileMonths: 24, replayMonths: null },
      }),
    )
    repository.activate.mockResolvedValue(createInstallationRecord())

    const result = await service.initialize(input, admin)

    expect(result.status).toBe(201)
    expect(repository.activate).toHaveBeenCalledWith(expect.objectContaining({ retention }))
  })

  it('rejects an unauthenticated caller without touching the repository', async () => {
    const { repository, service } = createInstallationFixture()

    await expect(service.initialize(input, undefined as unknown as AuthUser)).rejects.toMatchObject(
      { code: 'UNAUTHORIZED' },
    )
    expect(repository.find).not.toHaveBeenCalled()
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('rejects a non-admin without touching the repository', async () => {
    const { repository, service } = createInstallationFixture()

    await expect(service.initialize(input, member)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.find).not.toHaveBeenCalled()
  })

  it('propagates an activation failure', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'uninitialized', dataDirectoryReady: true }),
    )
    repository.activate.mockRejectedValue(new Error('boom'))

    await expect(service.initialize(input, admin)).rejects.toThrow('boom')
  })

  it('conflicts on a missing data directory for a fresh installation', async () => {
    const { repository, service } = createInstallationFixture({ dataDirectoryReady: false })
    repository.find.mockResolvedValue(undefined)

    await expect(service.initialize(input, admin)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
    expect(repository.insert).not.toHaveBeenCalled()
  })
})
