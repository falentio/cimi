import { describe, expect, it, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { schema as contractSchema } from '@cimi/contract'
import type { InMemorySiteMembership } from '@cimi/guard'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import {
  createCollectionPolicyFixture,
  createPolicyLayers,
  createTestAuthUser,
} from '../../collection-policy/fixture.ts'
import { createSiteRecord } from '../../site/fixture.ts'
import type { SiteRepository } from '../../site/repository.ts'
import type { IdentityProfileRepository } from '../repository.ts'
import { IdentityProfileService } from '../service.ts'

const now = new Date('2026-09-10T06:00:00.000Z')
const profileActivityCutoff = new Date('2026-09-10T06:01:00.000Z')

function createFixture(
  options: {
    memberships?: readonly InMemorySiteMembership[]
    lifecycleLock?: InMemoryLifecycleLock
  } = {},
) {
  const repository = mock<IdentityProfileRepository>()
  const siteRepository = mock<SiteRepository>()
  siteRepository.findByIngestionIdentifier.mockResolvedValue(createSiteRecord())
  const policyFixture = createCollectionPolicyFixture({ clock: () => now, ...options })
  const projectionDebt = { mark: vi.fn() }
  const service = new IdentityProfileService({
    repository,
    siteRepository,
    collectionPolicy: policyFixture.service,
    scope: { siteScope: policyFixture.scope, membership: policyFixture.scope },
    profileActivityCutoff: async () => profileActivityCutoff,
    projectionDebt,
    ...(options.lifecycleLock === undefined ? {} : { lifecycleLock: options.lifecycleLock }),
    clock: () => now,
  })
  return { repository, siteRepository, policyFixture, projectionDebt, service }
}

describe('IdentityProfileService', () => {
  it('marks identity projection debt after an accepted identification', async () => {
    const { repository, policyFixture, projectionDebt, service } = createFixture()
    repository.identify.mockResolvedValue({
      kind: 'accepted',
      output: {
        identifiedUserId: 'usr_external_1',
        status: 'active',
        updatedAt: now.toISOString(),
      },
    })

    await service.identify({
      ingestionIdentifier: 'ing_1',
      identifiedUserId: 'usr_external_1',
      anonymousIdentityId: 'ano_1',
      collectionContext: { consent: 'granted' },
    })

    expect(projectionDebt.mark).toHaveBeenCalledWith({ siteId: 'ste_1', now })
    expect(policyFixture.repository.loadLayers).toHaveBeenCalledWith('ste_1')
  })

  it('does not mark projection debt when identification is refused', async () => {
    const { repository, projectionDebt, service } = createFixture()
    repository.identify.mockResolvedValue({ kind: 'conflict' })

    await expect(
      service.identify({
        ingestionIdentifier: 'ing_1',
        identifiedUserId: 'usr_external_1',
        collectionContext: { consent: 'granted' },
      }),
    ).rejects.toThrow()
    expect(projectionDebt.mark).not.toHaveBeenCalled()
  })

  it('marks identity projection debt after an accepted deletion request', async () => {
    const { repository, projectionDebt, service } = createFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_2', role: 'admin' }],
    })
    repository.requestDeletion.mockResolvedValue({
      kind: 'accepted',
      output: { accepted: true, status: 'deletion-requested' },
    })

    await service.requestDeletion(
      { siteId: 'ste_1', identifiedUserId: 'usr_external_1' },
      createTestAuthUser({ id: 'user_2' }),
    )

    expect(projectionDebt.mark).toHaveBeenCalledWith({ siteId: 'ste_1', now })
  })

  it('identifies an Identified User after policy admission', async () => {
    const { repository, policyFixture, service } = createFixture()
    repository.identify.mockResolvedValue({
      kind: 'accepted',
      output: {
        identifiedUserId: 'usr_external_1',
        status: 'active',
        updatedAt: now.toISOString(),
      },
    })

    await expect(
      service.identify({
        ingestionIdentifier: 'ing_1',
        identifiedUserId: 'usr_external_1',
        traits: { plan: 'pro' },
        anonymousIdentityId: 'ano_1',
        collectionContext: { consent: 'granted' },
      }),
    ).resolves.toEqual({
      identifiedUserId: 'usr_external_1',
      status: 'active',
      updatedAt: now.toISOString(),
    })
    expect(policyFixture.repository.loadLayers).toHaveBeenCalledWith('ste_1')
    expect(repository.identify).toHaveBeenCalledWith({
      siteId: 'ste_1',
      identifiedUserId: 'usr_external_1',
      traits: { plan: 'pro' },
      anonymousIdentityId: 'ano_1',
      now,
      profileActivityCutoffAt: profileActivityCutoff,
    })
  })

  it('rejects identification before repository access when policy denies it', async () => {
    const { repository, service } = createFixture()

    await expect(
      service.identify({
        ingestionIdentifier: 'ing_1',
        identifiedUserId: 'usr_external_1',
        collectionContext: { consent: 'denied' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.identify).not.toHaveBeenCalled()
  })

  it('rejects identification with granted consent when GPC is enabled', async () => {
    const { repository, service } = createFixture()

    await expect(
      service.identify({
        ingestionIdentifier: 'ing_1',
        identifiedUserId: 'usr_external_1',
        collectionContext: { consent: 'granted', gpc: true },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.identify).not.toHaveBeenCalled()
  })

  it('rejects identification with granted consent when DNT is enabled', async () => {
    const { repository, service } = createFixture()

    await expect(
      service.identify({
        ingestionIdentifier: 'ing_1',
        identifiedUserId: 'usr_external_1',
        collectionContext: { consent: 'granted', dnt: true },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.identify).not.toHaveBeenCalled()
  })

  it('rejects prohibited traits before repository access', async () => {
    const { repository, service } = createFixture()

    await expect(
      service.identify({
        ingestionIdentifier: 'ing_1',
        identifiedUserId: 'usr_external_1',
        traits: { password: 'secret' },
        collectionContext: { consent: 'granted' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(repository.identify).not.toHaveBeenCalled()
  })

  it('applies bot policy to identification before repository access', async () => {
    const { repository, service } = createFixture()
    repository.identify.mockResolvedValue({
      kind: 'accepted',
      output: {
        identifiedUserId: 'usr_external_1',
        status: 'active',
        updatedAt: now.toISOString(),
      },
    })

    await expect(
      service.identify(
        {
          ingestionIdentifier: 'ing_1',
          identifiedUserId: 'usr_external_1',
          collectionContext: { consent: 'granted' },
        },
        { isBot: true },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.identify).not.toHaveBeenCalled()
  })

  it('does not persist identity for recorded-excluded bots', async () => {
    const { repository, policyFixture, service } = createFixture()
    policyFixture.repository.loadLayers.mockResolvedValue(
      createPolicyLayers({
        ...contractSchema.DEFAULT_COLLECTION_POLICY,
        botPolicy: 'record_excluded',
      }),
    )
    repository.identify.mockResolvedValue({
      kind: 'accepted',
      output: {
        identifiedUserId: 'usr_external_1',
        status: 'active',
        updatedAt: now.toISOString(),
      },
    })

    await expect(
      service.identify(
        {
          ingestionIdentifier: 'ing_1',
          identifiedUserId: 'usr_external_1',
          collectionContext: { consent: 'granted' },
        },
        { isBot: true },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.identify).not.toHaveBeenCalled()
  })

  it('fails closed while a lifecycle operation holds the ingestion boundary', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const lease = lifecycleLock.acquire('site_deletion')
    expect(lease).toBeDefined()
    const { repository, service } = createFixture({ lifecycleLock })

    await expect(
      service.identify({
        ingestionIdentifier: 'ing_1',
        identifiedUserId: 'usr_external_1',
        collectionContext: { consent: 'granted' },
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    expect(repository.identify).not.toHaveBeenCalled()
    await lease?.release()
  })

  it('fails closed while cleanup holds the lifecycle boundary for deletion', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const lease = lifecycleLock.acquire('retention')
    expect(lease).toBeDefined()
    const { repository, service } = createFixture({ lifecycleLock })

    await expect(
      service.requestDeletion(
        { siteId: 'ste_1', identifiedUserId: 'usr_external_1' },
        createTestAuthUser(),
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    expect(repository.requestDeletion).not.toHaveBeenCalled()
    await lease?.release()
  })

  it('threads the profile activity cutoff into profile reads', async () => {
    const { repository, service } = createFixture()
    repository.find.mockResolvedValue(undefined)
    repository.list.mockResolvedValue({
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 0,
    })
    const cutoff = new Date('2026-09-10T06:01:00.000Z')

    await expect(
      service.get({ siteId: 'ste_1', identifiedUserId: 'usr_external_1' }, createTestAuthUser()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.find).toHaveBeenCalledWith({
      siteId: 'ste_1',
      identifiedUserId: 'usr_external_1',
      profileActivityCutoffAt: cutoff,
    })
    await service.list({ siteId: 'ste_1' }, createTestAuthUser())
    expect(repository.list).toHaveBeenCalledWith({
      siteId: 'ste_1',
      offset: 0,
      limit: 20,
      profileActivityCutoffAt: cutoff,
    })
  })

  it('enforces Site scope before profile reads', async () => {
    const { repository, service } = createFixture()

    await expect(
      service.get(
        { siteId: 'ste_1', identifiedUserId: 'usr_external_1' },
        createTestAuthUser({ id: 'user_2' }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.find).not.toHaveBeenCalled()
  })

  it('enforces Site scope before profile lists', async () => {
    const { repository, service } = createFixture()

    await expect(
      service.list({ siteId: 'ste_1' }, createTestAuthUser({ id: 'user_2' })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.list).not.toHaveBeenCalled()
  })

  it('requires Site management scope before requesting profile deletion', async () => {
    const { repository, service } = createFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_2', role: 'member' }],
    })

    await expect(
      service.requestDeletion(
        { siteId: 'ste_1', identifiedUserId: 'usr_external_1' },
        createTestAuthUser({ id: 'user_2' }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.requestDeletion).not.toHaveBeenCalled()
  })

  it('allows Site members to read deletion status', async () => {
    const { repository, service } = createFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_2', role: 'member' }],
    })
    repository.getDeletionStatus.mockResolvedValue({
      status: 'deletion-requested',
      updatedAt: now.toISOString(),
      derivedCleanup: { status: 'pending', updatedAt: now.toISOString() },
      backupCleanup: { status: 'pending', updatedAt: now.toISOString() },
    })

    await expect(
      service.getDeletionStatus(
        { siteId: 'ste_1', identifiedUserId: 'usr_external_1' },
        createTestAuthUser({ id: 'user_2' }),
      ),
    ).resolves.toMatchObject({ status: 'deletion-requested' })
  })
})
