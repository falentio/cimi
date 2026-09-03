import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'

const createdAt = new Date('2026-08-31T00:00:00.000Z')

export type UserRow = typeof schema.TUser.$inferSelect
export type OrganizationRow = Omit<
  typeof schema.TOrganization.$inferInsert,
  'authorityOrganizationId' | 'isPersonal'
> & {
  authorityOrganizationId: string | null
  isPersonal: boolean
}
export type OrganizationRepairOperationRow = typeof schema.TOrganizationRepairOperation.$inferSelect
export type OrganizationGovernanceOperationRow =
  typeof schema.TOrganizationGovernanceOperation.$inferSelect
export function createOrganizationUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
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
    ...overrides,
  }
}

export function createOrganizationRow(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
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

export function createOrganizationRepairOperationRow(
  overrides: Partial<OrganizationRepairOperationRow> = {},
): OrganizationRepairOperationRow {
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
    lastAttemptAt: null,
    completedAt: null,
    failureCode: null,
    failureMessage: null,
    requestedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createOrganizationGovernanceOperationRow(
  overrides: Partial<OrganizationGovernanceOperationRow> = {},
): OrganizationGovernanceOperationRow {
  return {
    id: 'operation_1',
    organizationId: 'organization_1',
    operationType: 'delete-organization',
    previousOwnerUserId: 'user_1',
    targetUserId: 'user_1',
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

export interface OrganizationDrizzleFixture extends Disposable {
  readonly db: Db
}

export type OrganizationMemberSeed = {
  userId: string
  role: 'owner' | 'admin' | 'member'
}

export async function seedOrganizationDrizzle(
  db: Db,
  options: {
    organization?: Partial<OrganizationRow>
    members?: readonly OrganizationMemberSeed[]
  } = {},
): Promise<void> {
  const organization = createOrganizationRow(options.organization)
  const members = options.members ?? [{ userId: organization.ownerUserId, role: 'owner' as const }]
  for (const member of members) {
    if (member.userId === 'user_1') continue
    await db.insert(schema.TUser).values(
      createOrganizationUserRow({
        id: member.userId,
        name: member.userId,
        email: `${member.userId}@example.com`,
      }),
    )
  }
  await db.insert(schema.TOrganization).values(organization)
  await db.insert(schema.TMembership).values(
    members.map((member) => ({
      organizationId: organization.id,
      userId: member.userId,
      role: member.role,
      createdAt,
      updatedAt: createdAt,
    })),
  )
}

export async function createOrganizationDrizzleFixture(): Promise<OrganizationDrizzleFixture> {
  const db = createMigratedTestDb()
  try {
    await db.insert(schema.TUser).values(createOrganizationUserRow())
    return {
      db,
      [Symbol.dispose]() {
        closeDb(db)
      },
    }
  } catch (error) {
    closeDb(db)
    throw error
  }
}
