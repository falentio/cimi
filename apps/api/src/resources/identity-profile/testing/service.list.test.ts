import { describe, expect, it, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { InMemorySiteMembership, SiteIngestionPort } from '@cimi/guard'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import {
  createCollectionPolicyFixture,
  createTestAuthUser,
} from '../../collection-policy/fixture.ts'
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
  const sites = mock<SiteIngestionPort>()
  sites.findActiveByIngestionIdentifier.mockResolvedValue({
    id: 'ste_1',
    hostname: 'example.com',
    reportingTimezone: 'UTC',
  })
  const policyFixture = createCollectionPolicyFixture({ clock: () => now, ...options })
  const projectionDebt = { mark: vi.fn() }
  const service = new IdentityProfileService({
    repository,
    sites,
    collectionPolicy: policyFixture.service,
    scope: { siteScope: policyFixture.scope, membership: policyFixture.scope },
    profileActivityCutoff: async () => profileActivityCutoff,
    projectionDebt,
    ...(options.lifecycleLock === undefined ? {} : { lifecycleLock: options.lifecycleLock }),
    clock: () => now,
  })
  return { repository, sites, policyFixture, projectionDebt, service }
}

describe('IdentityProfileService.list', () => {
  it('enforces Site scope before profile lists', async () => {
    const { repository, service } = createFixture()

    await expect(
      service.list({ siteId: 'ste_1' }, createTestAuthUser({ id: 'user_2' })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.list).not.toHaveBeenCalled()
  })
})
