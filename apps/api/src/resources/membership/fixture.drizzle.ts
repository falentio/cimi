import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'

const createdAt = new Date('2026-08-31T00:00:00.000Z')

export type UserRow = typeof schema.TUser.$inferSelect
export type OrganizationRow = typeof schema.TOrganization.$inferSelect
export type MembershipRow = typeof schema.TMembership.$inferSelect
export type MembershipGovernanceOperationRow =
  typeof schema.TOrganizationGovernanceOperation.$inferSelect
export type MembershipRepairOperationRow = typeof schema.TOrganizationRepairOperation.$inferSelect

export function createMembershipUserRow(
  id: string,
  overrides: Partial<Omit<UserRow, 'id'>> = {},
): UserRow {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    image: null,
    role: null,
    banned: null,
    banReason: null,
    banExpires: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createMembershipOrganizationRow(
  overrides: Partial<OrganizationRow> = {},
): OrganizationRow {
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

export function createMembershipRow(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    organizationId: 'organization_1',
    userId: 'user_1',
    role: 'owner',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createMembershipGovernanceOperationRow(
  overrides: Partial<MembershipGovernanceOperationRow> = {},
): MembershipGovernanceOperationRow {
  return {
    id: 'operation_1',
    organizationId: 'organization_1',
    operationType: 'remove-member',
    previousOwnerUserId: 'user_1',
    targetUserId: 'user_2',
    targetRole: null,
    status: 'pending',
    attemptCount: 0,
    requestedAt: createdAt,
    lastAttemptAt: null,
    completedAt: null,
    failureCode: null,
    failureMessage: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createMembershipRepairOperationRow(
  overrides: Partial<MembershipRepairOperationRow> = {},
): MembershipRepairOperationRow {
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
    status: 'pending',
    attemptCount: 0,
    requestedAt: createdAt,
    lastAttemptAt: null,
    completedAt: null,
    failureCode: null,
    failureMessage: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function seedMembershipOrganization(
  db: Db,
  options: {
    organizationId?: string
    ownerId?: string
    members?: ReadonlyArray<{ userId: string; role: MembershipRow['role'] }>
  } = {},
): void {
  const organizationId = options.organizationId ?? 'organization_1'
  const ownerId = options.ownerId ?? 'user_1'
  const members = options.members ?? [{ userId: 'user_2', role: 'member' as const }]
  const userIds = [...new Set([ownerId, ...members.map((member) => member.userId)])]
  db.insert(schema.TUser)
    .values(userIds.map((id) => createMembershipUserRow(id)))
    .run()
  db.insert(schema.TOrganization)
    .values(createMembershipOrganizationRow({ id: organizationId, ownerUserId: ownerId }))
    .run()
  db.insert(schema.TMembership)
    .values([
      createMembershipRow({ organizationId, userId: ownerId, role: 'owner' }),
      ...members
        .filter((member) => member.userId !== ownerId)
        .map((member) =>
          createMembershipRow({ organizationId, userId: member.userId, role: member.role }),
        ),
    ])
    .run()
}

export interface MembershipDrizzleFixture extends Disposable {
  readonly db: Db
}

export function createMembershipDrizzleFixture(): MembershipDrizzleFixture {
  const db = createMigratedTestDb()
  return {
    db,
    [Symbol.dispose]() {
      closeDb(db)
    },
  }
}
