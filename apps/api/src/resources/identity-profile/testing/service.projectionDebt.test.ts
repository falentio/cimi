import { describe, expect, it, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { InMemorySiteMembership } from '@cimi/guard'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import {
  createCollectionPolicyFixture,
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

describe('IdentityProfileService.projectionDebt', () => {
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
})
