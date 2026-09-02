import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { OrganizationAuthority } from '@cimi/auth'
import type { OrganizationRepository } from '../repository.ts'
import { OrganizationService } from '../service.ts'

const authorityOrganization = {
  id: 'authority_1',
  name: "Ada's Organization",
  slug: 'personal-user_1',
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
}

const members = [
  {
    id: 'member_1',
    organizationId: authorityOrganization.id,
    userId: 'user_1',
    role: 'owner' as const,
    createdAt: new Date('2026-08-31T00:00:00.000Z'),
  },
  {
    id: 'member_2',
    organizationId: authorityOrganization.id,
    userId: 'user_2',
    role: 'owner' as const,
    createdAt: new Date('2026-08-31T00:00:01.000Z'),
  },
]

describe('OrganizationService.ensurePersonal', () => {
  it('rejects an authority Personal Organization with multiple Owners', async () => {
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })

    repository.findPersonalByOwner.mockResolvedValue(undefined)
    authority.getOrganizationBySlug.mockResolvedValue(authorityOrganization)
    authority.listAllMembers.mockResolvedValue(members)

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.insertWithOwner).not.toHaveBeenCalled()
  })
})
