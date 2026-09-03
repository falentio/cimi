import type { AuthorityMember, AuthorityOrganization, OrganizationAuthority } from '@cimi/auth'
import { mock } from 'vitest-mock-extended'
import type { OrganizationRecord, OrganizationRepository } from './repository.ts'
import { OrganizationService, type OrganizationMembershipReconciler } from './service.ts'

const createdAt = new Date('2026-08-31T00:00:00.000Z')

export interface OrganizationFixtureOptions {
  readonly membership?: OrganizationMembershipReconciler | undefined
}

export function createOrganizationFixture({ membership }: OrganizationFixtureOptions = {}) {
  const repository = mock<OrganizationRepository>()
  const authority = mock<OrganizationAuthority>()
  const service = new OrganizationService({ repository, authority, membership })
  return { repository, authority, service }
}

export function createOrganizationRecord(
  overrides: Partial<OrganizationRecord> = {},
): OrganizationRecord {
  return {
    id: 'organization_1',
    name: 'Analytics',
    authorityOrganizationId: 'authority_1',
    ownerUserId: 'user_1',
    isPersonal: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createAuthorityOrganization(
  overrides: Partial<AuthorityOrganization> = {},
): AuthorityOrganization {
  return {
    id: 'authority_1',
    name: 'Analytics',
    slug: 'analytics',
    createdAt,
    ...overrides,
  }
}

export function createAuthorityMember(overrides: Partial<AuthorityMember> = {}): AuthorityMember {
  return {
    id: 'member_1',
    organizationId: 'authority_1',
    userId: 'user_1',
    role: 'owner',
    createdAt,
    ...overrides,
  }
}

export function createRepairOperation(
  overrides: Partial<OrganizationRepository.RepairOperation> = {},
): OrganizationRepository.RepairOperation {
  return {
    id: 'repair_1',
    organizationId: 'organization_1',
    localOrganizationId: 'organization_1',
    operationType: 'update-organization',
    ownerUserId: 'user_1',
    authorityOrganizationId: 'authority_1',
    authorityCleanupRequired: false,
    authoritySlug: null,
    previousName: 'Analytics',
    desiredName: 'Renamed Analytics',
    attemptCount: 0,
    ...overrides,
  }
}

export function createDeleteOperation(
  overrides: Partial<OrganizationRepository.DeleteOperation> = {},
): OrganizationRepository.DeleteOperation {
  return {
    id: 'operation_1',
    organizationId: 'organization_1',
    previousOwnerUserId: 'user_1',
    targetUserId: 'user_1',
    attemptCount: 0,
    ...overrides,
  }
}
