import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { TUser } from './auth.ts'

export const TOrganization = sqliteTable(
  'organization',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    authorityOrganizationId: text('authority_organization_id').unique(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => TUser.id, { onDelete: 'restrict' }),
    isPersonal: integer('is_personal', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('organization_owner_idx').on(table.ownerUserId),
    uniqueIndex('organization_personal_owner_unique')
      .on(table.ownerUserId)
      .where(sql`${table.isPersonal} = 1`),
    index('organization_created_idx').on(table.createdAt, table.id),
  ],
)

export const TMembership = sqliteTable(
  'membership',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => TOrganization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => TUser.id, { onDelete: 'restrict' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    uniqueIndex('membership_one_owner_unique')
      .on(table.organizationId)
      .where(sql`${table.role} = 'owner'`),
    index('membership_organization_created_idx').on(
      table.organizationId,
      table.createdAt,
      table.userId,
    ),
    index('membership_user_organization_idx').on(table.userId, table.organizationId),
    check('membership_role_check', sql`${table.role} IN ('owner', 'admin', 'member')`),
  ],
)

export const TOrganizationRepairOperation = sqliteTable(
  'organization_repair_operation',
  {
    id: text('id').primaryKey().notNull(),
    organizationId: text('organization_id').references(() => TOrganization.id, {
      onDelete: 'cascade',
    }),
    localOrganizationId: text('local_organization_id').notNull(),
    operationType: text('operation_type', {
      enum: ['create-organization', 'update-organization'],
    }).notNull(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => TUser.id, { onDelete: 'restrict' }),
    authorityOrganizationId: text('authority_organization_id'),
    authorityCleanupRequired: integer('authority_cleanup_required', { mode: 'boolean' })
      .notNull()
      .default(false),
    authoritySlug: text('authority_slug'),
    previousName: text('previous_name'),
    desiredName: text('desired_name').notNull(),
    status: text('status', { enum: ['pending', 'completed'] }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('organization_repair_operation_organization_status_idx').on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index('organization_repair_operation_local_status_idx').on(
      table.localOrganizationId,
      table.status,
    ),
    uniqueIndex('organization_repair_operation_create_active_unique')
      .on(table.ownerUserId)
      .where(sql`${table.operationType} = 'create-organization' AND ${table.status} = 'pending'`),
    uniqueIndex('organization_repair_operation_update_active_unique')
      .on(table.organizationId)
      .where(sql`${table.operationType} = 'update-organization' AND ${table.status} = 'pending'`),
    check('organization_repair_operation_attempt_count_check', sql`${table.attemptCount} >= 0`),
    check(
      'organization_repair_operation_shape_check',
      sql`(
        (${table.operationType} = 'create-organization' AND ${table.authoritySlug} IS NOT NULL AND ${table.previousName} IS NULL)
        OR
        (${table.operationType} = 'update-organization' AND ${table.organizationId} IS NOT NULL AND ${table.authorityOrganizationId} IS NOT NULL AND ${table.authoritySlug} IS NULL AND ${table.previousName} IS NOT NULL)
      )`,
    ),
  ],
)

export const TOrganizationGovernanceOperation = sqliteTable(
  'organization_governance_operation',
  {
    id: text('id').primaryKey().notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => TOrganization.id, { onDelete: 'cascade' }),
    operationType: text('operation_type', {
      enum: [
        'transfer-ownership',
        'change-member-role',
        'remove-member',
        'leave-organization',
        'delete-organization',
      ],
    }).notNull(),
    previousOwnerUserId: text('previous_owner_user_id')
      .notNull()
      .references(() => TUser.id, { onDelete: 'restrict' }),
    targetUserId: text('target_user_id')
      .notNull()
      .references(() => TUser.id, { onDelete: 'restrict' }),
    targetRole: text('target_role', { enum: ['admin', 'member'] }),
    status: text('status', { enum: ['pending', 'completed', 'failed'] }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('organization_governance_operation_organization_status_idx').on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex('organization_governance_operation_active_unique')
      .on(table.organizationId)
      .where(sql`${table.status} = 'pending'`),
    check('organization_governance_operation_attempt_count_check', sql`${table.attemptCount} >= 0`),
    check(
      'organization_governance_operation_target_role_check',
      sql`(
        (${table.operationType} = 'change-member-role' AND ${table.targetRole} IN ('admin', 'member'))
        OR
        (${table.operationType} IN ('transfer-ownership', 'remove-member', 'leave-organization', 'delete-organization') AND ${table.targetRole} IS NULL)
      )`,
    ),
  ],
)

export const TSite = sqliteTable(
  'site',
  {
    id: text('id').primaryKey().notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => TOrganization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    hostname: text('hostname').notNull(),
    ingestionIdentifier: text('ingestion_identifier').notNull().unique(),
    reportingTimezone: text('reporting_timezone').notNull().default('UTC'),
    weekStartsOn: text('week_starts_on', {
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    })
      .notNull()
      .default('monday'),
    status: text('status', {
      enum: ['active', 'deleting', 'deleted', 'recovering', 'purged'],
    })
      .notNull()
      .default('active'),
    deleteRequestedAt: integer('delete_requested_at', { mode: 'timestamp_ms' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    recoveryDeadline: integer('recovery_deadline', { mode: 'timestamp_ms' }),
    purgeAt: integer('purge_at', { mode: 'timestamp_ms' }),
    purgedAt: integer('purged_at', { mode: 'timestamp_ms' }),
    currentOperationId: text('current_operation_id'),
    cleanupStatus: text('cleanup_status', {
      enum: ['not-required', 'pending', 'complete', 'failed'],
    })
      .notNull()
      .default('not-required'),
    cleanupUpdatedAt: integer('cleanup_updated_at', { mode: 'timestamp_ms' }),
    cleanupError: text('cleanup_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('site_organization_hostname_unique').on(table.organizationId, table.hostname),
    index('site_organization_status_created_idx').on(
      table.organizationId,
      table.status,
      table.createdAt,
      table.id,
    ),
    index('site_status_recovery_idx').on(table.status, table.recoveryDeadline),
  ],
)

export const TSiteLifecycleOperation = sqliteTable(
  'site_lifecycle_operation',
  {
    id: text('id').primaryKey().notNull(),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'cascade' }),
    operationType: text('operation_type', { enum: ['delete', 'recover', 'purge'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    }).notNull(),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    errorSummary: text('error_summary'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('site_lifecycle_operation_site_status_idx').on(table.siteId, table.status),
    uniqueIndex('site_lifecycle_operation_active_unique')
      .on(table.siteId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
)

export const TInvitation = sqliteTable(
  'invitation',
  {
    id: text('id').primaryKey().notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => TOrganization.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'expired', 'revoked'] })
      .notNull()
      .default('pending'),
    acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('invitation_organization_created_idx').on(
      table.organizationId,
      table.createdAt,
      table.id,
    ),
    index('invitation_organization_status_idx').on(table.organizationId, table.status),
    index('invitation_expiry_idx').on(table.status, table.expiresAt),
    check('invitation_role_check', sql`${table.role} IN ('admin', 'member')`),
  ],
)

export const TSiteTombstone = sqliteTable(
  'site_tombstone',
  {
    siteId: text('site_id').primaryKey().notNull(),
    organizationId: text('organization_id').notNull(),
    hostname: text('hostname').notNull(),
    purgeOperationId: text('purge_operation_id').notNull(),
    purgedAt: integer('purged_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('site_tombstone_organization_hostname_unique').on(
      table.organizationId,
      table.hostname,
    ),
    check('site_tombstone_purge_time_check', sql`${table.purgedAt} >= ${table.createdAt}`),
  ],
)
