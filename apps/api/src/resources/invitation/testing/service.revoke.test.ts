import { describe, expect, it } from 'vitest'
import { createInvitationFixture, createInvitationRecord } from '../fixture.ts'

describe('InvitationService.revoke', () => {
  it('revokes a pending invitation', async () => {
    const { repository, service } = createInvitationFixture()
    repository.findById.mockResolvedValue(createInvitationRecord())
    repository.revoke.mockResolvedValue({ status: 'revoked' })

    await expect(
      service.revoke({ invitationId: 'inv_1' }, { id: 'user_1' }, new Headers()),
    ).resolves.toBeUndefined()
    expect(repository.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ invitationId: 'inv_1' }),
    )
  })

  it('treats an already-revoked invitation as idempotent success', async () => {
    const { repository, service } = createInvitationFixture()
    repository.findById.mockResolvedValue(createInvitationRecord({ status: 'revoked' }))
    repository.revoke.mockResolvedValue({ status: 'idempotent' })

    await expect(
      service.revoke({ invitationId: 'inv_1' }, { id: 'user_1' }, new Headers()),
    ).resolves.toBeUndefined()
  })

  it('treats an expired invitation as idempotent success', async () => {
    const { repository, service } = createInvitationFixture()
    repository.findById.mockResolvedValue(createInvitationRecord({ status: 'expired' }))
    repository.revoke.mockResolvedValue({ status: 'idempotent' })

    await expect(
      service.revoke({ invitationId: 'inv_1' }, { id: 'user_1' }, new Headers()),
    ).resolves.toBeUndefined()
  })

  it('rejects revoking an accepted invitation as consumed', async () => {
    const { repository, service } = createInvitationFixture()
    repository.findById.mockResolvedValue(createInvitationRecord({ status: 'accepted' }))
    repository.revoke.mockResolvedValue({ status: 'consumed' })

    await expect(
      service.revoke({ invitationId: 'inv_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'INVITATION_CONSUMED' })
  })

  it('rejects a missing invitation as not found without revoking', async () => {
    const { repository, service } = createInvitationFixture()
    repository.findById.mockResolvedValue(undefined)

    await expect(
      service.revoke({ invitationId: 'inv_missing' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.revoke).not.toHaveBeenCalled()
  })

  it('rejects a member without the admin role', async () => {
    const { repository, service } = createInvitationFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'member' }],
    })
    repository.findById.mockResolvedValue(createInvitationRecord())

    await expect(
      service.revoke({ invitationId: 'inv_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.revoke).not.toHaveBeenCalled()
  })

  it('rejects revoking while a governance operation is pending', async () => {
    const { repository, scope, service } = createInvitationFixture()
    scope.setPendingGovernanceOperation('org_1')
    repository.findById.mockResolvedValue(createInvitationRecord())

    await expect(
      service.revoke({ invitationId: 'inv_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.revoke).not.toHaveBeenCalled()
  })
})
