import type { AuthorityMember, OrganizationAuthority } from '@cimi/auth'
import { mock } from 'vitest-mock-extended'
import type { OrganizationRole } from '../organization/repository.ts'
import type { MembershipRecord, MembershipRepository } from './repository.ts'
import { MembershipService } from './service.ts'

const organizationId = 'organization_1'
const authorityOrganizationId = 'authority_1'
const createdAt = new Date('2026-09-01T00:00:00.000Z')

type RepositoryMock = ReturnType<typeof mock<MembershipRepository>>
type AuthorityMock = ReturnType<typeof mock<OrganizationAuthority>>

export interface MembershipFixture {
  readonly repository: RepositoryMock
  readonly authority: AuthorityMock
  readonly service: MembershipService
}

export function createMembershipFixture(
  localMembers: readonly MembershipRecord[] = [],
  authorityMembers: readonly AuthorityMember[] = localMembers.map((member) =>
    createAuthorityMember({ userId: member.userId, role: member.role }),
  ),
): MembershipFixture {
  const repository = mock<MembershipRepository>()
  const authority = mock<OrganizationAuthority>()
  let projectedMembers = [...localMembers]

  repository.findPendingMembershipOperation.mockResolvedValue(undefined)
  repository.findAuthorityOrganizationId.mockResolvedValue(authorityOrganizationId)
  repository.findById.mockImplementation(
    async ({ organizationId: requestedOrganizationId, userId }) =>
      projectedMembers.find(
        (member) => member.organizationId === requestedOrganizationId && member.userId === userId,
      ),
  )
  repository.findOwner.mockImplementation(async (requestedOrganizationId) =>
    projectedMembers.find(
      (member) => member.organizationId === requestedOrganizationId && member.role === 'owner',
    ),
  )
  repository.hasPendingGovernanceOperation.mockResolvedValue(false)
  repository.isOwnerInvariantValid.mockImplementation(async (requestedOrganizationId) => {
    const members = projectedMembers.filter(
      (member) => member.organizationId === requestedOrganizationId,
    )
    return members.filter((member) => member.role === 'owner').length === 1
  })
  repository.replaceMembers.mockImplementation(async (_requestedOrganizationId, members) => {
    projectedMembers = members
  })
  repository.findMany.mockImplementation(
    async ({ organizationId: requestedOrganizationId, offset, limit }) => {
      const members = projectedMembers.filter(
        (member) => member.organizationId === requestedOrganizationId,
      )
      const items = members.slice(offset, offset + limit)
      const hasMore = offset + items.length < members.length
      return {
        items,
        nextOffset: hasMore ? offset + items.length : null,
        hasMore,
        totalCount: members.length,
      }
    },
  )
  authority.getMember.mockImplementation(
    async ({ organizationId: requestedOrganizationId, userId }) =>
      authorityMembers.find(
        (member) => member.organizationId === requestedOrganizationId && member.userId === userId,
      ),
  )
  authority.listAllMembers.mockResolvedValue([...authorityMembers])

  return { repository, authority, service: new MembershipService({ repository, authority }) }
}

export function createMembershipRecord(
  overrides: Partial<MembershipRecord> = {},
): MembershipRecord {
  const role: OrganizationRole = overrides.role ?? 'owner'
  return {
    organizationId,
    userId: 'user_1',
    role,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createAuthorityMember(overrides: Partial<AuthorityMember> = {}): AuthorityMember {
  const userId = overrides.userId ?? 'user_1'
  return {
    id: `authority-member-${userId}`,
    organizationId: authorityOrganizationId,
    userId,
    role: 'owner',
    createdAt,
    ...overrides,
  }
}

export function createMembershipOperation(
  overrides: Partial<MembershipRepository.MembershipOperation> = {},
): MembershipRepository.MembershipOperation {
  return {
    id: 'operation_1',
    organizationId,
    operationType: 'change-member-role',
    targetUserId: 'user_2',
    targetRole: 'member',
    attemptCount: 0,
    ...overrides,
  }
}

export function createTransfer(
  overrides: Partial<MembershipRepository.Transfer> = {},
): MembershipRepository.Transfer {
  return {
    id: 'operation_1',
    organizationId,
    previousOwnerUserId: 'user_1',
    targetUserId: 'user_2',
    attemptCount: 0,
    ...overrides,
  }
}
