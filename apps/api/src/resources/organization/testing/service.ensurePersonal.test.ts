import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { OrganizationMembershipReconciler, PersonalOrganizationSeeder } from '../service.ts'
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

function createDemoSeed() {
  const demoSeed = mock<PersonalOrganizationSeeder>()
  demoSeed.seed.mockResolvedValue(undefined)

  return demoSeed
}

function flushDeferredWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

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

  it('reuses an existing personal organization', async () => {
    const membership = mock<OrganizationMembershipReconciler>()
    membership.reconcile.mockResolvedValue()
    const { repository, authority, service } = createOrganizationFixture({ membership })

    repository.findPersonalByOwner.mockResolvedValue(winner)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).resolves.toMatchObject({ id: winner.id })
    expect(authority.createOrganization).not.toHaveBeenCalled()
    expect(repository.insertWithOwner).not.toHaveBeenCalled()
    expect(membership.reconcile).toHaveBeenCalledWith(winner.id, expect.any(Headers), 'user_1')
  })

  it('creates a personal organization with a new authority organization', async () => {
    const { repository, authority, service } = createOrganizationFixture()

    const personal = createOrganizationRecord({
      name: "Ada's Organization",
      authorityOrganizationId: authorityOrganization.id,
      isPersonal: true,
    })

    repository.findPersonalByOwner.mockResolvedValue(undefined)
    repository.insertWithOwner.mockResolvedValue(personal)
    authority.getOrganizationBySlug.mockResolvedValue(undefined)
    authority.createOrganization.mockResolvedValue({
      organization: authorityOrganization,
      member: members[0]!,
    })
    authority.listAllMembers.mockResolvedValue([members[0]!])

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).resolves.toMatchObject({ name: "Ada's Organization", isPersonal: true })
    expect(repository.insertWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: 'user_1', isPersonal: true }),
      expect.objectContaining({ userId: 'user_1' }),
    )
  })
})

describe('OrganizationService.ensurePersonal demo seeding', () => {
  const createdPersonal = () =>
    createOrganizationRecord({
      name: "Ada's Organization",
      authorityOrganizationId: 'authority_1',
      isPersonal: true,
    })

  function arrange() {
    const demoSeed = createDemoSeed()
    const fixture = createOrganizationFixture({ demoSeed })
    const personal = createdPersonal()

    fixture.repository.findPersonalByOwner.mockResolvedValue(undefined)
    fixture.repository.insertWithOwner.mockResolvedValue(personal)
    fixture.authority.getOrganizationBySlug.mockResolvedValue(undefined)
    fixture.authority.createOrganization.mockResolvedValue({
      organization: authorityOrganization,
      member: members[0]!,
    })
    fixture.authority.listAllMembers.mockResolvedValue([members[0]!])

    return { demoSeed, fixture, personal }
  }

  it('schedules the demo seed after the insert succeeds, off the request path', async () => {
    const { demoSeed, fixture, personal } = arrange()
    const service = fixture.service

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).resolves.toMatchObject({ id: personal.id })
    expect(demoSeed.seed).not.toHaveBeenCalled()

    await flushDeferredWork()

    expect(demoSeed.seed).toHaveBeenCalledWith({
      organizationId: personal.id,
      ownerUserId: 'user_1',
    })
  })

  it('does not schedule the demo seed when the personal organization is reused', async () => {
    const demoSeed = createDemoSeed()
    const { repository, service } = createOrganizationFixture({ demoSeed })
    repository.findPersonalByOwner.mockResolvedValue(winner)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).resolves.toMatchObject({ id: winner.id })
    await flushDeferredWork()

    expect(demoSeed.seed).not.toHaveBeenCalled()
  })

  it('swallows a demo seed failure out of the ensure response', async () => {
    const { demoSeed, fixture, personal } = arrange()
    const service = fixture.service
    demoSeed.seed.mockRejectedValue(new Error('seeding failed'))

    await expect(
      service.ensurePersonal({}, { id: 'user_1', name: 'Ada' }, new Headers()),
    ).resolves.toMatchObject({ id: personal.id })
    await flushDeferredWork()

    expect(demoSeed.seed).toHaveBeenCalledWith({
      organizationId: personal.id,
      ownerUserId: 'user_1',
    })
  })
})
