import type { AuthUser } from '@cimi/auth'
import { describe, expect, it } from 'vitest'
import { createRetentionPolicyFixture, createStoredResolution } from '../fixture.ts'

const admin = { id: 'user_1', role: 'admin', installationGrant: true } as unknown as AuthUser
const member = { id: 'user_2', role: 'member' } as unknown as AuthUser
const siteOwner = { id: 'user_1', role: 'member' } as unknown as AuthUser
const siteMember = { id: 'user_2', role: 'member' } as unknown as AuthUser

const policy = { eventMonths: 12, profileMonths: 12, replayMonths: null }
const override = { eventMonths: 6, profileMonths: 6, replayMonths: null }

describe('RetentionPolicyService.get', () => {
  it('returns the installation default with a null site override', async () => {
    const { repository, service } = createRetentionPolicyFixture()
    repository.findResolved.mockResolvedValue(createStoredResolution())

    await expect(service.get({ scope: 'installation' }, admin)).resolves.toEqual({
      scope: 'installation',
      installationDefault: policy,
      siteOverride: null,
      effectivePolicy: policy,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    expect(repository.findResolved).toHaveBeenCalledWith({ siteId: null })
  })

  it('inherits the installation default for a site without an override', async () => {
    const { repository, service } = createRetentionPolicyFixture()
    repository.findResolved.mockResolvedValue(createStoredResolution())

    await expect(service.get({ scope: 'site', siteId: 'ste_1' }, siteOwner)).resolves.toEqual({
      scope: 'site',
      siteId: 'ste_1',
      installationDefault: policy,
      siteOverride: null,
      effectivePolicy: policy,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    expect(repository.findResolved).toHaveBeenCalledWith({ siteId: 'ste_1' })
  })

  it('prefers the site override for the effective policy', async () => {
    const { repository, service } = createRetentionPolicyFixture()
    repository.findResolved.mockResolvedValue(
      createStoredResolution({ siteOverride: override, effectivePolicy: override }),
    )

    await expect(service.get({ scope: 'site', siteId: 'ste_1' }, siteOwner)).resolves.toEqual({
      scope: 'site',
      siteId: 'ste_1',
      installationDefault: policy,
      siteOverride: override,
      effectivePolicy: override,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
  })

  it('passes through the built-in 12/12/null fallback', async () => {
    const { repository, service } = createRetentionPolicyFixture()
    repository.findResolved.mockResolvedValue(
      createStoredResolution({
        installationDefault: policy,
        siteOverride: null,
        effectivePolicy: policy,
      }),
    )

    await expect(service.get({ scope: 'installation' }, admin)).resolves.toMatchObject({
      installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    })
  })

  it('rejects an unauthenticated installation read', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(service.get({ scope: 'installation' }, undefined)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(repository.findResolved).not.toHaveBeenCalled()
  })

  it('rejects a non-admin installation read', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(service.get({ scope: 'installation' }, member)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(repository.findResolved).not.toHaveBeenCalled()
  })

  it('rejects a site read the user cannot access', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(service.get({ scope: 'site', siteId: 'ste_1' }, siteMember)).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    )
    expect(repository.findResolved).not.toHaveBeenCalled()
  })

  it('rejects a read for an unknown site', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(
      service.get({ scope: 'site', siteId: 'ste_missing' }, siteOwner),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.findResolved).not.toHaveBeenCalled()
  })
})

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

  it('saves a site override', async () => {
    const { repository, service } = createRetentionPolicyFixture()
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
    expect(repository.saveSiteOverride).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'ste_1', policy: override }),
    )
  })

  it('clears the site override when the site policy is null', async () => {
    const { repository, service } = createRetentionPolicyFixture()
    repository.clearSiteOverride.mockResolvedValue(createStoredResolution())

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: null }, siteOwner),
    ).resolves.toMatchObject({ scope: 'site', siteId: 'ste_1', siteOverride: null })
    expect(repository.clearSiteOverride).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'ste_1' }),
    )
    expect(repository.saveSiteOverride).not.toHaveBeenCalled()
  })

  it('rejects a null installation policy', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(
      service.update({ scope: 'installation', policy: null } as never, admin),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(repository.saveInstallationDefault).not.toHaveBeenCalled()
  })

  it('rejects an undefined site policy without touching the repository', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(
      service.update({ scope: 'site', siteId: 'ste_1', policy: undefined } as never, siteOwner),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(repository.saveSiteOverride).not.toHaveBeenCalled()
    expect(repository.clearSiteOverride).not.toHaveBeenCalled()
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
})
