import { assertAuthenticated } from '@cimi/guard'
import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createInvitationFixture,
  createInvitationMembership,
  createInvitationRecord,
} from '../fixture.ts'
import { hashInvitationToken } from '../token.ts'

const token = 'bearer-token-1'
const tokenHash = hashInvitationToken(token)

function pendingRecord() {
  return createInvitationRecord({ role: 'member', tokenHash })
}

describe('InvitationService.accept', () => {
  it('accepts a pending invitation and returns the non-owner membership', async () => {
    const { repository, authority, service } = createInvitationFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
    })
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    const membership = createInvitationMembership({ userId: 'user_2', role: 'member' })
    repository.consume.mockResolvedValue({
      status: 'consumed',
      invitation: { ...pendingRecord(), status: 'accepted' },
      membership,
    })

    const result = await service.accept({ token }, { id: 'user_2' }, new Headers())

    expect(result).toMatchObject({ organizationId: 'org_1', userId: 'user_2', role: 'member' })
    expect(result).not.toHaveProperty('tokenHash')
    expect(authority.admitMember).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'authority_1', userId: 'user_2', role: 'member' }),
    )
    expect(repository.consume).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash, userId: 'user_2' }),
    )
  })

  it('reuses a same-role membership and still consumes the invitation', async () => {
    const { repository, authority, service } = createInvitationFixture({
      memberships: [
        { organizationId: 'org_1', userId: 'user_1', role: 'owner' },
        { organizationId: 'org_1', userId: 'user_2', role: 'member' },
      ],
      authorityMembers: [createAuthorityMember({ userId: 'user_2', role: 'member' })],
    })
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    const membership = createInvitationMembership({ userId: 'user_2', role: 'member' })
    repository.consume.mockResolvedValue({
      status: 'consumed',
      invitation: { ...pendingRecord(), status: 'accepted' },
      membership,
    })

    await expect(service.accept({ token }, { id: 'user_2' }, new Headers())).resolves.toMatchObject(
      {
        userId: 'user_2',
        role: 'member',
      },
    )
    expect(authority.admitMember).not.toHaveBeenCalled()
    expect(repository.consume).toHaveBeenCalledOnce()
  })

  it('rejects a conflicting local role before touching the authority and leaves the invitation pending', async () => {
    const { repository, authority, service } = createInvitationFixture({
      memberships: [
        { organizationId: 'org_1', userId: 'user_1', role: 'owner' },
        { organizationId: 'org_1', userId: 'user_2', role: 'admin' },
      ],
    })
    repository.findByTokenHash.mockResolvedValue(pendingRecord())

    await expect(service.accept({ token }, { id: 'user_2' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(authority.getMember).not.toHaveBeenCalled()
    expect(authority.admitMember).not.toHaveBeenCalled()
    expect(repository.consume).not.toHaveBeenCalled()
  })

  it.each([['missing'], ['expired'], ['revoked'], ['accepted']])(
    'maps an %s token to indistinguishable not found without consuming',
    async (kind) => {
      const { repository, authority, service } = createInvitationFixture()
      if (kind === 'missing') repository.findByTokenHash.mockResolvedValue(undefined)
      if (kind === 'expired')
        repository.findByTokenHash.mockResolvedValue(
          createInvitationRecord({
            tokenHash,
            status: 'pending',
            expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        )
      if (kind === 'revoked')
        repository.findByTokenHash.mockResolvedValue(
          createInvitationRecord({ tokenHash, status: 'revoked' }),
        )
      if (kind === 'accepted')
        repository.findByTokenHash.mockResolvedValue(
          createInvitationRecord({ tokenHash, status: 'accepted' }),
        )

      await expect(
        service.accept({ token }, { id: 'user_2' }, new Headers()),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      expect(authority.admitMember).not.toHaveBeenCalled()
      expect(repository.consume).not.toHaveBeenCalled()
    },
  )

  it('rejects an authority owner without consuming', async () => {
    const { repository, authority, service } = createInvitationFixture({
      authorityMembers: [createAuthorityMember({ userId: 'user_2', role: 'owner' })],
    })
    repository.findByTokenHash.mockResolvedValue(pendingRecord())

    await expect(service.accept({ token }, { id: 'user_2' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(authority.admitMember).not.toHaveBeenCalled()
    expect(repository.consume).not.toHaveBeenCalled()
  })

  it('compensates an admitted member when local consume loses the race', async () => {
    const { repository, authority, service } = createInvitationFixture()
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    repository.consume.mockResolvedValue({ status: 'not-found' })
    authority.getMember.mockResolvedValue(undefined)

    await expect(service.accept({ token }, { id: 'user_2' }, new Headers())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(authority.admitMember).toHaveBeenCalledOnce()
    expect(authority.removeMember).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'authority_1', userId: 'user_2' }),
    )
  })

  it('restores the previous authority role when local consume reports a conflict', async () => {
    const { repository, authority, service } = createInvitationFixture({
      authorityMembers: [createAuthorityMember({ userId: 'user_2', role: 'admin' })],
    })
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    repository.consume.mockResolvedValue({ status: 'conflict', currentRole: 'admin' })
    let admitted = false
    authority.getMember.mockImplementation(async ({ userId }) => {
      if (userId !== 'user_2') return undefined
      return createAuthorityMember({ userId: 'user_2', role: admitted ? 'member' : 'admin' })
    })
    authority.admitMember.mockImplementation(async ({ organizationId, userId, role }) => {
      admitted = true
      return createAuthorityMember({ organizationId, userId, role })
    })

    await expect(service.accept({ token }, { id: 'user_2' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(authority.admitMember).toHaveBeenCalledOnce()
    expect(authority.changeMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
    )
  })

  it('rejects acceptance while a governance operation is pending', async () => {
    const { repository, authority, scope, service } = createInvitationFixture()
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    scope.setPendingGovernanceOperation('org_1')

    await expect(service.accept({ token }, { id: 'user_2' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(authority.admitMember).not.toHaveBeenCalled()
    expect(repository.consume).not.toHaveBeenCalled()
  })

  it('keeps unauthenticated acceptance out via the authenticated middleware without consuming', async () => {
    const { repository } = createInvitationFixture()

    expect(() => assertAuthenticated(undefined)).toThrowError(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    )
    expect(repository.consume).not.toHaveBeenCalled()
    expect(repository.findByTokenHash).not.toHaveBeenCalled()
  })
})
