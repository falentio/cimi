import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { OrganizationAuthority } from '@cimi/auth'
import type { OrganizationRepository, OrganizationRecord } from '../repository.ts'
import { OrganizationService, type OrganizationMembershipReconciler } from '../service.ts'

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

const winner: OrganizationRecord = {
  id: 'organization_1',
  name: "Ada's Organization",
  authorityOrganizationId: authorityOrganization.id,
  ownerUserId: 'user_1',
  isPersonal: true,
  createdAt: authorityOrganization.createdAt,
  updatedAt: authorityOrganization.createdAt,
}

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

  it('validates the winner after losing the Personal Organization uniqueness race', async () => {
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const membership = mock<OrganizationMembershipReconciler>()
    const service = new OrganizationService({ repository, authority, membership })

    repository.findPersonalByOwner.mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner)
    repository.insertWithOwner.mockRejectedValue(new Error('UNIQUE constraint failed'))
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    authority.getOrganizationBySlug.mockResolvedValue(authorityOrganization)
    authority.listAllMembers.mockResolvedValue([members[0]!])
    membership.reconcile.mockResolvedValue()

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).resolves.toMatchObject({ id: winner.id })
    // oxlint-disable-next-line typescript/unbound-method
    expect(membership.reconcile).toHaveBeenCalledWith(winner.id, expect.any(Headers), 'user_1')
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.isOwnerInvariantValid).toHaveBeenCalledWith(winner.id)
  })
})
