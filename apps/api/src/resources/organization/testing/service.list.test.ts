import { describe, expect, it } from 'vitest'
import { createOrganizationFixture, createOrganizationRecord } from '../fixture.ts'

const organization = createOrganizationRecord()
const refreshedOrganization = createOrganizationRecord({ name: 'Refreshed Analytics' })

describe('OrganizationService.list', () => {
  it('reconciles listed organizations and returns refreshed records', async () => {
    const { repository, service } = createOrganizationFixture()
    repository.findManyForUser
      .mockResolvedValueOnce({
        items: [organization],
        nextOffset: 20,
        hasMore: true,
        totalCount: 21,
      })
      .mockResolvedValueOnce({
        items: [refreshedOrganization],
        nextOffset: 20,
        hasMore: true,
        totalCount: 21,
      })
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)

    await expect(
      service.list({}, { id: organization.ownerUserId }, new Headers()),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: refreshedOrganization.id,
          name: refreshedOrganization.name,
          ownerUserId: refreshedOrganization.ownerUserId,
          isPersonal: refreshedOrganization.isPersonal,
          createdAt: refreshedOrganization.createdAt.toISOString(),
          updatedAt: refreshedOrganization.updatedAt.toISOString(),
        }),
      ],
      nextOffset: 20,
      hasMore: true,
      totalCount: 21,
    })
    expect(repository.findManyForUser).toHaveBeenNthCalledWith(1, {
      userId: organization.ownerUserId,
      offset: 0,
      limit: 20,
    })
    expect(repository.findManyForUser).toHaveBeenNthCalledWith(2, {
      userId: organization.ownerUserId,
      offset: 0,
      limit: 20,
    })
  })

  it('returns an empty page without refreshing when no organizations are listed', async () => {
    const { repository, service } = createOrganizationFixture()
    repository.findManyForUser.mockResolvedValue({
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 0,
    })

    await expect(
      service.list({ offset: 10, limit: 5 }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual({
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 0,
    })
    expect(repository.findManyForUser).toHaveBeenCalledTimes(1)
    expect(repository.hasPendingGovernanceOperation).not.toHaveBeenCalled()
  })
})
