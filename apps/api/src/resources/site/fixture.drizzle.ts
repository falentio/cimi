import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'

const createdAt = new Date('2026-08-31T00:00:00.000Z')

export type UserRow = typeof schema.TUser.$inferSelect
export type OrganizationRow = typeof schema.TOrganization.$inferSelect
export type MembershipRow = typeof schema.TMembership.$inferSelect
export type SiteRow = typeof schema.TSite.$inferSelect
export type OrganizationGovernanceOperationRow =
  typeof schema.TOrganizationGovernanceOperation.$inferSelect
export type OrganizationRepairOperationRow = typeof schema.TOrganizationRepairOperation.$inferSelect
export type SiteTombstoneRow = typeof schema.TSiteTombstone.$inferSelect

export function createSiteUserRow(overrides: Partial<UserRow> = {}): UserRow {
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

export function createSiteOrganizationRow(
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

export function createSiteMembershipRow(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    organizationId: 'organization_1',
    userId: 'user_1',
    role: 'owner',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createSiteRow(overrides: Partial<SiteRow> = {}): SiteRow {
  return {
    id: 'site_1',
    organizationId: 'organization_1',
    name: 'Production',
    hostname: 'example.com',
    ingestionIdentifier: 'ingest_1',
    reportingTimezone: 'UTC',
    weekStartsOn: 'monday',
    status: 'active',
    deleteRequestedAt: null,
    deletedAt: null,
    recoveryDeadline: null,
    purgeAt: null,
    purgedAt: null,
    currentOperationId: null,
    cleanupStatus: 'not-required',
    cleanupUpdatedAt: null,
    cleanupError: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createSiteGovernanceOperationRow(
  overrides: Partial<OrganizationGovernanceOperationRow> = {},
): OrganizationGovernanceOperationRow {
  return {
    id: 'operation_1',
    organizationId: 'organization_1',
    operationType: 'transfer-ownership',
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

export function createSiteRepairOperationRow(
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

export function createSiteTombstoneRow(
  overrides: Partial<SiteTombstoneRow> = {},
): SiteTombstoneRow {
  return {
    siteId: 'site_1',
    organizationId: 'organization_1',
    hostname: 'example.com',
    purgeOperationId: 'operation_purge_1',
    purgedAt: createdAt,
    createdAt,
    ...overrides,
  }
}

export interface SiteDrizzleFixture extends Disposable {
  readonly db: Db
}

export function createSiteDrizzleFixture(): SiteDrizzleFixture {
  const db = createMigratedTestDb()
  try {
    db.insert(schema.TUser).values(createSiteUserRow()).run()
    db.insert(schema.TOrganization).values(createSiteOrganizationRow()).run()
    db.insert(schema.TMembership).values(createSiteMembershipRow()).run()
    db.insert(schema.TSite).values(createSiteRow()).run()
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
