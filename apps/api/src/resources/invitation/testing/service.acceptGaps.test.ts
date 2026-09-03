import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { OrganizationAuthority } from '@cimi/auth'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { InMemorySiteScopePort } from '@cimi/guard'
import type { OrganizationMembershipReconciler } from '../../organization/service.ts'
import {
  createAuthorityMember,
  createInvitationFixture,
  createInvitationMembership,
  createInvitationRecord,
} from '../fixture.ts'
import { InvitationRepositoryDrizzle } from '../repository.drizzle.ts'
import { InvitationService } from '../service.ts'
import { hashInvitationToken } from '../token.ts'

const token = 'gap-token-1'
const tokenHash = hashInvitationToken(token)

function pendingRecord() {
  return createInvitationRecord({ role: 'member', tokenHash })
}

describe('InvitationService.accept gaps', () => {
  it('maps a missing authority organization to not found', async () => {
    const { repository, authority, service } = createInvitationFixture()
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    repository.findAuthorityOrganizationId.mockResolvedValue(undefined)

    await expect(service.accept({ token }, { id: 'user_2' }, new Headers())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(authority.admitMember).not.toHaveBeenCalled()
    expect(repository.consume).not.toHaveBeenCalled()
  })

  it('reconciles the organization before accepting', async () => {
    const { repository, membership, service } = createInvitationFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
    })
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    const record = createInvitationMembership({ userId: 'user_2', role: 'member' })
    repository.consume.mockResolvedValue({
      status: 'consumed',
      invitation: { ...pendingRecord(), status: 'accepted' },
      membership: record,
    })

    await service.accept({ token }, { id: 'user_2' }, new Headers())

    expect(membership.reconcile).toHaveBeenCalledWith('org_1', expect.anything(), 'user_2')
  })

  it('preserves the original not found when compensation fails', async () => {
    const { repository, authority, service } = createInvitationFixture()
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    repository.consume.mockResolvedValue({ status: 'not-found' })
    authority.getMember.mockResolvedValue(undefined)
    authority.removeMember.mockRejectedValue(new Error('cleanup failed'))

    await expect(service.accept({ token }, { id: 'user_2' }, new Headers())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(authority.admitMember).toHaveBeenCalledOnce()
    expect(authority.removeMember).toHaveBeenCalledOnce()
  })

  it('admits a bearer with no prior membership without reading email verification', async () => {
    const { repository, authority, service } = createInvitationFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
    })
    repository.findByTokenHash.mockResolvedValue(pendingRecord())
    authority.getMember.mockResolvedValue(undefined)
    const record = createInvitationMembership({ userId: 'user_9', role: 'member' })
    repository.consume.mockResolvedValue({
      status: 'consumed',
      invitation: { ...pendingRecord(), status: 'accepted' },
      membership: record,
    })

    const result = await service.accept({ token }, { id: 'user_9' }, new Headers())

    expect(result).toMatchObject({ organizationId: 'org_1', userId: 'user_9', role: 'member' })
    expect(authority.admitMember).toHaveBeenCalledOnce()
    expect(repository.consume).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash, userId: 'user_9' }),
    )
  })

  it('accepts with a real repository for a user whose email is unverified', async () => {
    const db = createMigratedTestDb()
    try {
      const createdAt = new Date('2026-09-01T00:00:00.000Z')
      db.insert(schema.TUser)
        .values([
          {
            id: 'user_1',
            name: 'Ada',
            email: 'ada@example.com',
            emailVerified: true,
            image: null,
            role: null,
            banned: null,
            banReason: null,
            banExpires: null,
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: 'user_9',
            name: 'Unverified',
            email: 'unverified@example.com',
            emailVerified: false,
            image: null,
            role: null,
            banned: null,
            banReason: null,
            banExpires: null,
            createdAt,
            updatedAt: createdAt,
          },
        ])
        .run()
      db.insert(schema.TOrganization)
        .values({
          id: 'org_1',
          name: 'Analytics',
          authorityOrganizationId: 'authority_1',
          ownerUserId: 'user_1',
          isPersonal: false,
          createdAt,
          updatedAt: createdAt,
        })
        .run()
      db.insert(schema.TMembership)
        .values({
          organizationId: 'org_1',
          userId: 'user_1',
          role: 'owner',
          createdAt,
          updatedAt: createdAt,
        })
        .run()
      const repository = new InvitationRepositoryDrizzle({ db })
      const authority = mock<OrganizationAuthority>()
      authority.getMember.mockResolvedValue(undefined)
      authority.admitMember.mockImplementation(async ({ organizationId, userId, role }) =>
        createAuthorityMember({ organizationId, userId, role }),
      )
      authority.removeMember.mockImplementation(async ({ organizationId, userId }) =>
        createAuthorityMember({ organizationId, userId, role: 'member' }),
      )
      const scope = new InMemorySiteScopePort(
        [],
        [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
      )
      const membership = mock<OrganizationMembershipReconciler>()
      membership.reconcile.mockResolvedValue(undefined)
      const service = new InvitationService({
        repository,
        scope: { membership: scope },
        authority,
        membership,
      })
      const unverifiedToken = 'gap-unverified-token-1'
      const now = new Date()
      await repository.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash: hashInvitationToken(unverifiedToken),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      })

      const result = await service.accept(
        { token: unverifiedToken },
        { id: 'user_9' },
        new Headers(),
      )

      expect(result).toMatchObject({ organizationId: 'org_1', userId: 'user_9', role: 'member' })
      await expect(repository.findById('inv_1')).resolves.toMatchObject({ status: 'accepted' })
    } finally {
      closeDb(db)
    }
  })
})
