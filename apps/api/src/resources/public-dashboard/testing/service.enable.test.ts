import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { InMemorySiteScopePort } from '@cimi/guard'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import type { AuthUser } from '@cimi/auth'
import { PublicDashboardService } from '../service.ts'
import type { PublicDashboardRepository } from '../repository.ts'

const user: AuthUser = {
  id: 'user_1',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  email: 'owner@example.com',
  emailVerified: true,
  name: 'Owner',
  banned: false,
  role: 'member',
}

const config: PublicDashboardRepository.Config = {
  siteId: 'ste_1',
  enabled: true,
  publicDashboardIdentifier: 'public-new',
  updatedAt: '2026-09-02T00:00:00.000Z',
}

describe('PublicDashboardService.enable', () => {
  it('rotates the identifier when enabling an already enabled dashboard', async () => {
    const repository = mock<PublicDashboardRepository>()
    repository.enable.mockResolvedValue({ status: 'updated', config })
    const scope = new InMemorySiteScopePort(
      [{ siteId: 'ste_1', organizationId: 'org_1' }],
      [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
    )
    const now = new Date('2026-09-02T00:00:00.000Z')
    const service = new PublicDashboardService({
      repository,
      lock: new InMemoryLifecycleLock(),
      scope: { siteScope: scope, membership: scope },
      clock: () => now,
      identifiers: { mint: () => ({ identifier: 'public-new', hash: 'hash-new' }) },
    })

    await expect(service.enable({ siteId: 'ste_1' }, user)).resolves.toEqual(config)
    expect(repository.enable).toHaveBeenCalledWith({
      siteId: 'ste_1',
      identifier: 'public-new',
      identifierHash: 'hash-new',
      now,
    })
  })
})
