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

  it('maps repository resolution to installation output', async () => {
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

  it('rejects an installation read without an admin grant', async () => {
    const { repository, service } = createRetentionPolicyFixture()

    await expect(service.get({ scope: 'installation' }, adminWithoutGrant)).rejects.toMatchObject({
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

  it('returns conflict for a site read while governance is pending', async () => {
    const { repository, scope, service } = createRetentionPolicyFixture()
    scope.setPendingGovernanceOperation('org_1', true)

    await expect(service.get({ scope: 'site', siteId: 'ste_1' }, siteOwner)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.findResolved).not.toHaveBeenCalled()
  })

  it.each(['deleting', 'deleted', 'recovering', 'purged'] as const)(
    'hides a %s site read with NOT_FOUND',
    async (status) => {
      const { repository, service } = createRetentionPolicyFixture({
        sites: [{ siteId: 'ste_1', organizationId: 'org_1', status }],
      })
      repository.findResolved.mockResolvedValue(createStoredResolution())

      await expect(
        service.get({ scope: 'site', siteId: 'ste_1' }, siteOwner),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(repository.findResolved).not.toHaveBeenCalled()
    },
  )
})
