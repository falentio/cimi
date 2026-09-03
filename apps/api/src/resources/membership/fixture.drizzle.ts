import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'

const createdAt = new Date('2026-08-31T00:00:00.000Z')

export type UserRow = typeof schema.TUser.$inferSelect
export type OrganizationRow = typeof schema.TOrganization.$inferSelect
export type MembershipRow = typeof schema.TMembership.$inferSelect

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

export interface MembershipDrizzleFixture {
  readonly db: Db
}

export function createMembershipDrizzleFixture(): MembershipDrizzleFixture {
  return { db: createMigratedTestDb() }
}

export function destroyMembershipDrizzleFixture({ db }: MembershipDrizzleFixture): void {
  closeDb(db)
}
