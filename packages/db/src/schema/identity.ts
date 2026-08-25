import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { TSite } from './governance.ts'
import type { JsonObject } from './types.ts'

export const TIdentityProfile = sqliteTable(
  'identity_profile',
  {
    profileId: text('profile_id').primaryKey().notNull(),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    identifiedUserId: text('identified_user_id').notNull(),
    status: text('status', {
      enum: ['active', 'deletion-requested', 'deleting', 'deleted'],
    }).notNull(),
    profileEpoch: integer('profile_epoch'),
    traits: text('traits', { mode: 'json' }).$type<JsonObject | null>(),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('identity_profile_active_unique')
      .on(table.siteId, table.identifiedUserId)
      .where(sql`${table.status} = 'active'`),
    index('identity_profile_site_status_created_idx').on(
      table.siteId,
      table.status,
      table.createdAt,
      table.identifiedUserId,
    ),
  ],
)

export const TIdentityProfileEpoch = sqliteTable(
  'identity_profile_epoch',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => TIdentityProfile.profileId, { onDelete: 'cascade' }),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    identifiedUserId: text('identified_user_id').notNull(),
    epoch: integer('epoch').notNull(),
    status: text('status', { enum: ['active', 'redacted'] }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    redactedAt: integer('redacted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.epoch] }),
    uniqueIndex('identity_profile_epoch_scope_unique').on(
      table.siteId,
      table.identifiedUserId,
      table.epoch,
    ),
  ],
)

export const TIdentityLink = sqliteTable(
  'identity_link',
  {
    id: text('id').primaryKey().notNull(),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    profileId: text('profile_id')
      .notNull()
      .references(() => TIdentityProfile.profileId, { onDelete: 'cascade' }),
    profileEpoch: integer('profile_epoch').notNull(),
    anonymousIdentityId: text('anonymous_identity_id').notNull(),
    analyticsSessionId: text('analytics_session_id'),
    effectiveFrom: integer('effective_from', { mode: 'timestamp_ms' }).notNull(),
    linkedAt: integer('linked_at', { mode: 'timestamp_ms' }).notNull(),
    unlinkedAt: integer('unlinked_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('identity_link_current_alias_unique')
      .on(table.siteId, table.anonymousIdentityId)
      .where(sql`${table.unlinkedAt} IS NULL`),
    index('identity_link_profile_epoch_idx').on(table.siteId, table.profileId, table.profileEpoch),
    index('identity_link_session_idx').on(
      table.siteId,
      table.analyticsSessionId,
      table.effectiveFrom,
    ),
  ],
)

export const TIdentityRedaction = sqliteTable(
  'identity_redaction',
  {
    id: text('id').primaryKey().notNull(),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    identifiedUserId: text('identified_user_id').notNull(),
    profileEpoch: integer('profile_epoch').notNull(),
    reason: text('reason', { enum: ['explicit', 'retention'] }).notNull(),
    status: text('status', { enum: ['requested', 'applying', 'applied'] }).notNull(),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull(),
    appliedAt: integer('applied_at', { mode: 'timestamp_ms' }),
    derivedCleanupStatus: text('derived_cleanup_status', {
      enum: ['not-required', 'pending', 'complete'],
    }).notNull(),
    backupCleanupStatus: text('backup_cleanup_status', {
      enum: ['not-required', 'pending', 'complete'],
    }).notNull(),
    derivedCleanupUpdatedAt: integer('derived_cleanup_updated_at', { mode: 'timestamp_ms' }),
    backupCleanupUpdatedAt: integer('backup_cleanup_updated_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('identity_redaction_profile_unique').on(
      table.siteId,
      table.identifiedUserId,
      table.profileEpoch,
    ),
    index('identity_redaction_status_idx').on(table.siteId, table.status),
  ],
)
