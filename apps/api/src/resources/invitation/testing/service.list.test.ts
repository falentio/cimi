import { describe, expect, it } from 'vitest'
import { createInvitationFixture, createInvitationRecord } from '../fixture.ts'

describe('InvitationService.list', () => {
  it('lists token-free invitations for an admin', async () => {
    const { repository, service } = createInvitationFixture()
    const record = createInvitationRecord()
    repository.findMany.mockResolvedValue({
      items: [
        {
          id: record.id,
          organizationId: record.organizationId,
          role: record.role,
          expiresAt: record.expiresAt.toISOString(),
          status: record.status,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        },
      ],
      nextOffset: null,
      hasMore: false,
      totalCount: 1,
    })

    const page = await service.list({ organizationId: 'org_1' }, { id: 'user_1' }, new Headers())

    expect(page.totalCount).toBe(1)
    expect(JSON.stringify(page)).not.toContain('tokenHash')
    expect(repository.findMany).toHaveBeenCalledWith('org_1', { offset: 0, limit: 20 })
  })

  it('passes explicit pagination to the repository', async () => {
    const { repository, service } = createInvitationFixture()
    repository.findMany.mockResolvedValue({
      items: [],
      nextOffset: 7,
      hasMore: true,
      totalCount: 10,
    })

    await expect(
      service.list(
        { organizationId: 'org_1', offset: 5, limit: 2 },
        { id: 'user_1' },
        new Headers(),
      ),
    ).resolves.toEqual({ items: [], nextOffset: 7, hasMore: true, totalCount: 10 })
    expect(repository.findMany).toHaveBeenCalledWith('org_1', { offset: 5, limit: 2 })
  })

  it('rejects a member without the admin role', async () => {
    const { repository, service } = createInvitationFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'member' }],
    })

    await expect(
      service.list({ organizationId: 'org_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.findMany).not.toHaveBeenCalled()
  })

  it('rejects an outsider as not found', async () => {
    const { repository, service } = createInvitationFixture()

    await expect(
      service.list({ organizationId: 'org_1' }, { id: 'user_missing' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.findMany).not.toHaveBeenCalled()
  })

  it('rejects listing while a governance operation is pending', async () => {
    const { repository, scope, service } = createInvitationFixture()
    scope.setPendingGovernanceOperation('org_1')

    await expect(
      service.list({ organizationId: 'org_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.findMany).not.toHaveBeenCalled()
  })
})
