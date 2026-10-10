import { createTestUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { describe, expect, it, vi } from 'vitest'
import { createInstallationFixture, createInstallationRecord } from '../fixture.ts'

const admin = createTestUser()

const ungrantedAdmin = createTestUser({ installationGrant: false })

const createdAt = new Date('2026-09-02T03:04:05.000Z')

const ids = {
  installationId: () => 'ins_injected',
  retentionPolicyId: () => 'rtn_injected',
  operationId: () => 'bop_injected',
  artifactId: () => 'bar_injected',
}

describe('InstallationService.ensureInstallation', () => {
  it('creates the singleton row as ready when no installation exists', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(undefined)
    repository.insert.mockResolvedValue(createInstallationRecord())

    const result = await service.ensureInstallation(admin)

    expect(result).toEqual(expect.objectContaining({ status: 'ready' }))
    expect(repository.insert).toHaveBeenCalledTimes(1)
  })

  it('writes the canonical default retention policy on the created row', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(undefined)
    repository.insert.mockResolvedValue(createInstallationRecord())

    await service.ensureInstallation(admin)

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ ...schema.DEFAULT_RETENTION_POLICY }),
    )
  })

  it('uses the injected clock and id sources for the created row', async () => {
    const { repository, service } = createInstallationFixture({ clock: () => createdAt, ids })
    repository.find.mockResolvedValueOnce(undefined)
    repository.insert.mockResolvedValue(createInstallationRecord({ id: 'ins_injected' }))

    await service.ensureInstallation(admin)

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ins_injected',
        retentionPolicyId: 'rtn_injected',
        createdAt,
        updatedAt: createdAt,
      }),
    )
  })

  it('marks the created row data-directory ready', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(undefined)
    repository.insert.mockResolvedValue(createInstallationRecord())

    await service.ensureInstallation(admin)

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ dataDirectoryReady: true }),
    )
  })

  it('returns the existing installation unchanged when a row already exists', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(createInstallationRecord({ status: 'maintenance' }))

    const result = await service.ensureInstallation(admin)

    expect(result).toEqual(expect.objectContaining({ status: 'maintenance' }))
    expect(repository.activate).not.toHaveBeenCalled()
  })

  it('does not write a new row when the existing retention differs from the default', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(
      createInstallationRecord({
        defaultRetention: { eventMonths: 1, profileMonths: 2, replayMonths: 3 },
      }),
    )

    const result = await service.ensureInstallation(admin)

    expect(result).toEqual(
      expect.objectContaining({
        defaultRetention: { eventMonths: 1, profileMonths: 2, replayMonths: 3 },
      }),
    )
    expect(repository.insert).not.toHaveBeenCalled()
    expect(repository.activate).not.toHaveBeenCalled()
  })

  it('does not read the data directory when a row already exists', async () => {
    const dataDirectoryReady = vi.fn(() => true)
    const { repository, service } = createInstallationFixture({ dataDirectoryReady })
    repository.find.mockResolvedValueOnce(createInstallationRecord())

    await service.ensureInstallation(admin)

    expect(dataDirectoryReady).not.toHaveBeenCalled()
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('throws CONFLICT when the data directory is not ready', async () => {
    const { repository, service } = createInstallationFixture({ dataDirectoryReady: false })
    repository.find.mockResolvedValueOnce(undefined)

    await expect(service.ensureInstallation(admin)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
  })

  it('writes no row when the data directory is not ready', async () => {
    const { repository, service } = createInstallationFixture({ dataDirectoryReady: false })
    repository.find.mockResolvedValueOnce(undefined)

    await expect(service.ensureInstallation(admin)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('throws FORBIDDEN when the actor is not an admin', async () => {
    const { repository, service } = createInstallationFixture()

    await expect(
      service.ensureInstallation(createTestUser({ role: 'member', installationGrant: false })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.find).not.toHaveBeenCalled()
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('throws FORBIDDEN when the actor is an admin without an installation grant', async () => {
    const { repository, service } = createInstallationFixture()

    await expect(service.ensureInstallation(ungrantedAdmin)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(repository.find).not.toHaveBeenCalled()
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('never touches the repository when the actor is forbidden', async () => {
    const { repository, service } = createInstallationFixture()

    await expect(service.ensureInstallation(undefined)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(repository.find).not.toHaveBeenCalled()
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('returns the row a racing insert created instead of failing', async () => {
    const { repository, service } = createInstallationFixture()
    const raced = createInstallationRecord({ id: 'ins_raced' })
    repository.find.mockResolvedValueOnce(undefined).mockResolvedValueOnce(raced)
    repository.insert.mockRejectedValue(
      new Error('UNIQUE constraint failed: installation.singleton_key'),
    )

    const result = await service.ensureInstallation(admin)

    expect(result).toEqual(expect.objectContaining({ status: 'ready' }))
    expect(repository.find).toHaveBeenCalledTimes(2)
    expect(repository.insert).toHaveBeenCalledTimes(1)
  })

  it('rethrows an insert failure that is not a constraint error', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(undefined)
    repository.insert.mockRejectedValue(new Error('boom'))

    await expect(service.ensureInstallation(admin)).rejects.toThrow('boom')
    expect(repository.find).toHaveBeenCalledTimes(1)
  })

  it('rethrows when a constraint error leaves no row behind', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
    repository.insert.mockRejectedValue(
      new Error('UNIQUE constraint failed: installation.singleton_key'),
    )

    await expect(service.ensureInstallation(admin)).rejects.toThrow('UNIQUE constraint failed')
  })
})
