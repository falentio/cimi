import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { OrganizationMembershipReconciler } from '../service.ts'
import {
  createAuthorityMember,
  createAuthorityOrganization,
  createOrganizationFixture,
  createOrganizationRecord,
} from '../fixture.ts'

const authorityOrganization = createAuthorityOrganization({
  name: "Ada's Organization",
  slug: 'personal-user_1',
})
const members = [
  createAuthorityMember({ organizationId: authorityOrganization.id }),
  createAuthorityMember({
    id: 'member_2',
    organizationId: authorityOrganization.id,
    userId: 'user_2',
    createdAt: new Date('2026-08-31T00:00:01.000Z'),
  }),
]
const winner = createOrganizationRecord({
  name: "Ada's Organization",
  authorityOrganizationId: authorityOrganization.id,
  isPersonal: true,
})

describe('OrganizationService.ensurePersonal', () => {
  it('rejects an authority Personal Organization with multiple Owners', async () => {
    const { repository, authority, service } = createOrganizationFixture()

    repository.findPersonalByOwner.mockResolvedValue(undefined)
    authority.getOrganizationBySlug.mockResolvedValue(authorityOrganization)
    authority.listAllMembers.mockResolvedValue(members)

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(repository.insertWithOwner).not.toHaveBeenCalled()
  })

  it('validates the winner after losing the Personal Organization uniqueness race', async () => {
    const membership = mock<OrganizationMembershipReconciler>()
    membership.reconcile.mockResolvedValue()
    const { repository, authority, service } = createOrganizationFixture({ membership })

    repository.findPersonalByOwner.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)
    repository.insertWithOwner.mockRejectedValue(new Error('UNIQUE constraint failed'))
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    authority.getOrganizationBySlug.mockResolvedValue(authorityOrganization)
    authority.listAllMembers.mockResolvedValue([members[0]!])

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).resolves.toMatchObject({ id: winner.id })
    expect(membership.reconcile).toHaveBeenCalledWith(winner.id, expect.any(Headers), 'user_1')
    expect(repository.isOwnerInvariantValid).toHaveBeenCalledWith(winner.id)
  })
})
