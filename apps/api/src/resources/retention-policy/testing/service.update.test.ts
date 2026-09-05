import { describe, expect, it } from 'vitest'
import {
  createRetentionPolicyFixture,
  createStoredResolution,
  createTestAuthUser,
} from '../fixture.ts'

const admin = createTestAuthUser({
  id: 'user_1',
  email: 'admin@example.com',
  role: 'admin',
  installationGrant: true,
})
const adminWithoutGrant = createTestAuthUser({
  id: 'user_1',
  email: 'admin@example.com',
  role: 'admin',
})
const member = createTestAuthUser({ id: 'user_2', email: 'member@example.com', role: 'member' })
const siteOwner = createTestAuthUser({ id: 'user_1', email: 'owner@example.com', role: 'member' })
const siteMember = createTestAuthUser({ id: 'user_2', email: 'member@example.com', role: 'member' })

const policy = { eventMonths: 12, profileMonths: 12, replayMonths: null }
const override = { eventMonths: 6, profileMonths: 6, replayMonths: null }

describe('RetentionPolicyService.update', () => {
  it('saves the installation default', async () => {
    const { repository, service } = createRetentionPolicyFixture()
    repository.saveInstallationDefault.mockResolvedValue(
      createStoredResolution({ installationDefault: override, effectivePolicy: override }),
    )

    await expect(
      service.update({ scope: 'installation', policy: override }, admin),
    ).resolves.toEqual({
      scope: 'installation',
      installationDefault: override,
      siteOverride: null,
      effectivePolicy: override,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    expect(repository.saveInstallationDefault).toHaveBeenCalledWith(
      expect.objectContaining({ policy: override }),
    )
  })

  it('passes injected clock and ids to the repository', async () => {
    const now = new Date('2026-09-02T00:00:00.000Z')
    const { repository, service } = createRetentionPolicyFixture({
      clock: () => now,
      ids: { retentionPolicyId: () => 'rtn_fixed' },
    })
    repository.saveInstallationDefault.mockResolvedValue(
      createStoredResolution({ installationDefault: override, effectivePolicy: override }),
    )

    await service.update({ scope: 'installation', policy: override }, admin)
    expect(repository.saveInstallationDefault).toHaveBeenCalledWith({
      id: 'rtn_fixed',
      policy: override,
      now,
    })
  })

  it('saves a site override with injected clock and ids', async () => {
    const now = new Date('2026-09-02T00:00:00.000Z')
    const { repository, service } = createRetentionPolicyFixture({
      clock: () => now,
      ids: { retentionPolicyId: () => 'rtn_site_fixed' },
    })
    repository.saveSiteOverride.mockResolvedValue(
      createStoredResolution({ siteOverride: override, effectivePolicy: override }),
    )

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: override }, siteOwner),
    ).resolves.toEqual({
      scope: 'site',
      siteId: 'ste_1',
      installationDefault: policy,
      siteOverride: override,
      effectivePolicy: override,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    expect(repository.saveSiteOverride).toHaveBeenCalledWith({
      id: 'rtn_site_fixed',
      siteId: 'ste_1',
      policy: override,
      now,
    })
  })

  it('clears the site override when the site policy is null', async () => {
    const now = new Date('2026-09-02T00:00:00.000Z')
    const { repository, service } = createRetentionPolicyFixture({ clock: () => now })
    repository.clearSiteOverride.mockResolvedValue(createStoredResolution())

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: null }, siteOwner),
    ).resolves.toMatchObject({ scope: 'site', siteId: 'ste_1', siteOverride: null })
    expect(repository.clearSiteOverride).toHaveBeenCalledWith({ siteId: 'ste_1', now })
    expect(repository.saveSiteOverride).not.toHaveBeenCalled()
  })

  it('returns conflict when the retention lock is held', async () => {
    const { repository, lock, service } = createRetentionPolicyFixture()
    const lease = lock.acquire('retention')
    expect(lease).toBeDefined()
    try {
      await expect(
        service.update({ scope: 'installation', policy: override }, admin),
      ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
      expect(repository.saveInstallationDefault).not.toHaveBeenCalled()
    } finally {
      if (lease !== undefined) await lease.release()
    }
  })

  it('returns conflict for a site update when the retention lock is held', async () => {
    const { repository, lock, service } = createRetentionPolicyFixture()
    const lease = lock.acquire('retention')
    expect(lease).toBeDefined()
    try {
      await expect(
        service.update({ scope: 'site', siteId: 'ste_1', policy: override }, siteOwner),
      ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
      expect(repository.saveSiteOverride).not.toHaveBeenCalled()
      expect(repository.clearSiteOverride).not.toHaveBeenCalled()
    } finally {
      if (lease !== undefined) await lease.release()
    }
  })

  it('rejects an unauthenticated update', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(
      service.update({ scope: 'installation', policy: override }, undefined),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(repository.saveInstallationDefault).not.toHaveBeenCalled()
  })

  it('rejects a site update below the admin role', async () => {
    const { repository, service } = createRetentionPolicyFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_2', role: 'member' }],
    })

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: override }, siteMember),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.saveSiteOverride).not.toHaveBeenCalled()
    expect(repository.clearSiteOverride).not.toHaveBeenCalled()
  })

  it('rejects an installation update for a non-admin member', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(
      service.update({ scope: 'installation', policy: override }, member),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.saveInstallationDefault).not.toHaveBeenCalled()
  })

  it('rejects an installation update without an admin grant', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(
      service.update({ scope: 'installation', policy: override }, adminWithoutGrant),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.saveInstallationDefault).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated site update', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: override }, undefined),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(repository.saveSiteOverride).not.toHaveBeenCalled()
    expect(repository.clearSiteOverride).not.toHaveBeenCalled()
  })

  it('rejects a site update for an unknown site', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(
      service.update({ scope: 'site', siteId: 'ste_missing', policy: override }, siteOwner),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.saveSiteOverride).not.toHaveBeenCalled()
    expect(repository.clearSiteOverride).not.toHaveBeenCalled()
  })

  it('returns conflict for a site update while governance is pending', async () => {
    const { repository, scope, service } = createRetentionPolicyFixture()
    scope.setPendingGovernanceOperation('org_1', true)

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: override }, siteOwner),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.saveSiteOverride).not.toHaveBeenCalled()
    expect(repository.clearSiteOverride).not.toHaveBeenCalled()
  })

  it.each(['deleting', 'deleted', 'recovering', 'purged'] as const)(
    'rejects a %s site update with CONFLICT',
    async (status) => {
      const { repository, service } = createRetentionPolicyFixture({
        sites: [{ siteId: 'ste_1', organizationId: 'org_1', status }],
      })

      await expect(
        service.update({ scope: 'site', siteId: 'ste_1', policy: override }, siteOwner),
      ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
      expect(repository.saveSiteOverride).not.toHaveBeenCalled()
      expect(repository.clearSiteOverride).not.toHaveBeenCalled()
    },
  )

  it('returns conflict for an installation update while a persisted operation is active', async () => {
    const { repository, service } = createRetentionPolicyFixture({
      activeOperation: {
        operationId: 'bop_1',
        kind: 'upgrade',
        phase: 'pre_upgrade_safety',
        checkpoint: 'none',
      },
    })

    await expect(
      service.update({ scope: 'installation', policy: override }, admin),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(repository.saveInstallationDefault).not.toHaveBeenCalled()
  })

  it('returns conflict for a site update while a persisted operation is active', async () => {
    const { repository, service } = createRetentionPolicyFixture({
      activeOperation: {
        operationId: 'sop_1',
        kind: 'site_deletion',
        phase: 'site_transition',
        checkpoint: 'none',
      },
    })

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: override }, siteOwner),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(repository.saveSiteOverride).not.toHaveBeenCalled()
    expect(repository.clearSiteOverride).not.toHaveBeenCalled()
  })

  it('allows an update when the persisted operation is terminal', async () => {
    const { repository, service } = createRetentionPolicyFixture({
      activeOperation: {
        operationId: 'bop_1',
        kind: 'upgrade',
        phase: 'pre_upgrade_safety',
        checkpoint: 'none',
        errorCode: 'INTERNAL_SERVER_ERROR',
      },
    })
    repository.saveInstallationDefault.mockResolvedValue(
      createStoredResolution({ installationDefault: override, effectivePolicy: override }),
    )

    await expect(
      service.update({ scope: 'installation', policy: override }, admin),
    ).resolves.toMatchObject({ scope: 'installation', installationDefault: override })
    expect(repository.saveInstallationDefault).toHaveBeenCalledTimes(1)
  })

  it('returns conflict when another lifecycle kind holds the lock', async () => {
    const { repository, lock, service } = createRetentionPolicyFixture()
    const lease = lock.acquire('upgrade')
    expect(lease).toBeDefined()
    try {
      await expect(
        service.update({ scope: 'installation', policy: override }, admin),
      ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
      expect(repository.saveInstallationDefault).not.toHaveBeenCalled()
    } finally {
      if (lease !== undefined) await lease.release()
    }
  })

  it('serializes overlapping updates so only one proceeds', async () => {
    const { repository, service } = createRetentionPolicyFixture()
    let releaseRepository!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseRepository = resolve
    })
    repository.saveInstallationDefault.mockImplementationOnce(async () => {
      await gate
      return createStoredResolution({ installationDefault: override, effectivePolicy: override })
    })

    const first = service.update({ scope: 'installation', policy: override }, admin)
    await Promise.resolve()
    await expect(
      service.update({ scope: 'installation', policy: override }, admin),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    releaseRepository()
    await expect(first).resolves.toMatchObject({ installationDefault: override })
    expect(repository.saveInstallationDefault).toHaveBeenCalledTimes(1)
  })

  it('releases the lock after a repository failure so a retry succeeds', async () => {
    const { repository, lock, service } = createRetentionPolicyFixture()
    repository.saveInstallationDefault.mockRejectedValueOnce(new Error('boom'))

    await expect(
      service.update({ scope: 'installation', policy: override }, admin),
    ).rejects.toThrow('boom')

    repository.saveInstallationDefault.mockResolvedValue(
      createStoredResolution({ installationDefault: override, effectivePolicy: override }),
    )
    await expect(
      service.update({ scope: 'installation', policy: override }, admin),
    ).resolves.toEqual({
      scope: 'installation',
      installationDefault: override,
      siteOverride: null,
      effectivePolicy: override,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    expect(repository.saveInstallationDefault).toHaveBeenCalledTimes(2)
    const lease = lock.acquire('retention')
    expect(lease).toBeDefined()
    if (lease !== undefined) await lease.release()
  })

  it('releases the lock after a site save failure so a retry succeeds', async () => {
    const { repository, lock, service } = createRetentionPolicyFixture()
    repository.saveSiteOverride.mockRejectedValueOnce(new Error('boom'))

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: override }, siteOwner),
    ).rejects.toThrow('boom')

    repository.saveSiteOverride.mockResolvedValue(
      createStoredResolution({ siteOverride: override, effectivePolicy: override }),
    )
    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: override }, siteOwner),
    ).resolves.toMatchObject({ scope: 'site', siteId: 'ste_1', siteOverride: override })
    expect(repository.saveSiteOverride).toHaveBeenCalledTimes(2)
    const lease = lock.acquire('retention')
    expect(lease).toBeDefined()
    if (lease !== undefined) await lease.release()
  })

  it('releases the lock after a site clear failure so a retry succeeds', async () => {
    const { repository, lock, service } = createRetentionPolicyFixture()
    repository.clearSiteOverride.mockRejectedValueOnce(new Error('boom'))

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: null }, siteOwner),
    ).rejects.toThrow('boom')

    repository.clearSiteOverride.mockResolvedValue(createStoredResolution())
    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: null }, siteOwner),
    ).resolves.toMatchObject({ scope: 'site', siteId: 'ste_1', siteOverride: null })
    expect(repository.clearSiteOverride).toHaveBeenCalledTimes(2)
    const lease = lock.acquire('retention')
    expect(lease).toBeDefined()
    if (lease !== undefined) await lease.release()
  })
})
