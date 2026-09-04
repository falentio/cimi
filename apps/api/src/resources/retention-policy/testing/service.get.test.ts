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
