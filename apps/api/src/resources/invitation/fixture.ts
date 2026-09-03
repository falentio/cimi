import type { AuthorityMember, OrganizationAuthority } from '@cimi/auth'
import { InMemorySiteScopePort } from '@cimi/guard'
import { mock } from 'vitest-mock-extended'
import type { OrganizationMembershipReconciler } from '../organization/service.ts'
import type { InvitationRepository } from './repository.ts'
import { InvitationService } from './service.ts'
import { hashInvitationToken } from './token.ts'

const createdAt = new Date('2026-09-01T00:00:00.000Z')
const expiresAt = new Date('2026-09-08T00:00:00.000Z')

export interface InvitationFixtureOptions {
  readonly membership?: OrganizationMembershipReconciler | undefined
  readonly memberships?: readonly InvitationMembership[]
  readonly authorityMembers?: readonly AuthorityMember[]
}

export interface InvitationMembership {
  readonly organizationId: string
  readonly userId: string
  readonly role: 'owner' | 'admin' | 'member'
}

export function createInvitationFixture({
  membership,
  memberships,
  authorityMembers,
}: InvitationFixtureOptions = {}) {
  const repository = mock<InvitationRepository>()
  const authority = mock<OrganizationAuthority>()
  const scope = new InMemorySiteScopePort(
    [],
    memberships ?? [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
  )
  const reconciler = membership ?? createReconcilerMock()
  repository.findAuthorityOrganizationId.mockResolvedValue('authority_1')
  authority.getMember.mockImplementation(async ({ userId }) =>
    (authorityMembers ?? []).find((member) => member.userId === userId),
  )
  authority.admitMember.mockImplementation(async ({ organizationId, userId, role }) =>
    createAuthorityMember({ organizationId, userId, role }),
  )
  const service = new InvitationService({
    repository,
    scope: { membership: scope },
    authority,
    membership: reconciler,
  })
  return { repository, authority, scope, membership: reconciler, service }
}

function createReconcilerMock(): OrganizationMembershipReconciler {
  const reconciler = mock<OrganizationMembershipReconciler>()
  reconciler.reconcile.mockResolvedValue(undefined)
  return reconciler
}

export function createInvitationRecord(
  overrides: Partial<InvitationRepository.InvitationRecord> = {},
): InvitationRepository.InvitationRecord {
  return {
    id: 'inv_1',
    organizationId: 'org_1',
    role: 'member',
    tokenHash: hashInvitationToken('test-token'),
    expiresAt,
    status: 'pending',
    acceptedAt: null,
    revokedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createInvitationMembership(
  overrides: Partial<InvitationRepository.MembershipRecord> = {},
): InvitationRepository.MembershipRecord {
  return {
    organizationId: 'org_1',
    userId: 'user_1',
    role: 'member',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createAuthorityMember(overrides: Partial<AuthorityMember> = {}): AuthorityMember {
  const userId = overrides.userId ?? 'user_1'
  return {
    id: `authority-member-${userId}`,
    organizationId: 'authority_1',
    userId,
    role: 'member',
    createdAt,
    ...overrides,
  }
}
