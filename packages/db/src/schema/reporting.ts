import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { TSite } from './governance.ts'
import type { JsonObject, JsonValue } from './types.ts'

export const TGoal = sqliteTable(
  'goal',
  {
    id: text('id').primaryKey().notNull(),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    actionJson: text('action_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    propertyFiltersJson: text('property_filters_json', { mode: 'json' }).$type<JsonValue | null>(),
    identityKind: text('identity_kind', { enum: ['visitor', 'identified_user'] }).notNull(),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('goal_site_status_created_idx').on(table.siteId, table.status, table.createdAt, table.id),
    check('goal_current_version_check', sql`${table.currentVersion} > 0`),
  ],
)

export const TGoalVersion = sqliteTable(
  'goal_version',
  {
    id: text('id').primaryKey().notNull(),
    goalId: text('goal_id')
      .notNull()
      .references(() => TGoal.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    actionJson: text('action_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    propertyFiltersJson: text('property_filters_json', { mode: 'json' }).$type<JsonValue | null>(),
    identityKind: text('identity_kind', { enum: ['visitor', 'identified_user'] }).notNull(),
    effectiveAt: integer('effective_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('goal_version_unique').on(table.goalId, table.version),
    index('goal_version_effective_idx').on(table.goalId, table.effectiveAt),
    check('goal_version_number_check', sql`${table.version} > 0`),
  ],
)

export const TFunnel = sqliteTable(
  'funnel',
  {
    id: text('id').primaryKey().notNull(),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    identityKind: text('identity_kind', { enum: ['visitor', 'identified_user'] }).notNull(),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('funnel_site_status_created_idx').on(
      table.siteId,
      table.status,
      table.createdAt,
      table.id,
    ),
    check('funnel_current_version_check', sql`${table.currentVersion} > 0`),
  ],
)

export const TFunnelVersion = sqliteTable(
  'funnel_version',
  {
    id: text('id').primaryKey().notNull(),
    funnelId: text('funnel_id')
      .notNull()
      .references(() => TFunnel.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    stepsJson: text('steps_json', { mode: 'json' }).$type<JsonValue>().notNull(),
    identityKind: text('identity_kind', { enum: ['visitor', 'identified_user'] }).notNull(),
    effectiveAt: integer('effective_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('funnel_version_unique').on(table.funnelId, table.version),
    index('funnel_version_effective_idx').on(table.funnelId, table.effectiveAt),
    check('funnel_version_number_check', sql`${table.version} > 0`),
  ],
)

export const TCohort = sqliteTable(
  'cohort',
  {
    id: text('id').primaryKey().notNull(),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    identityKind: text('identity_kind', { enum: ['visitor', 'identified_user'] }).notNull(),
    period: text('period', { enum: ['day', 'week', 'month'] }).notNull(),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('cohort_site_status_created_idx').on(
      table.siteId,
      table.status,
      table.createdAt,
      table.id,
    ),
    check('cohort_current_version_check', sql`${table.currentVersion} > 0`),
  ],
)

export const TCohortVersion = sqliteTable(
  'cohort_version',
  {
    id: text('id').primaryKey().notNull(),
    cohortId: text('cohort_id')
      .notNull()
      .references(() => TCohort.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    entryActionJson: text('entry_action_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    retentionActionJson: text('retention_action_json', { mode: 'json' })
      .$type<JsonObject>()
      .notNull(),
    identityKind: text('identity_kind', { enum: ['visitor', 'identified_user'] }).notNull(),
    period: text('period', { enum: ['day', 'week', 'month'] }).notNull(),
    effectiveAt: integer('effective_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('cohort_version_unique').on(table.cohortId, table.version),
    index('cohort_version_effective_idx').on(table.cohortId, table.effectiveAt),
    check('cohort_version_number_check', sql`${table.version} > 0`),
  ],
)

export const TPublicDashboard = sqliteTable(
  'public_dashboard',
  {
    siteId: text('site_id')
      .primaryKey()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    publicIdentifier: text('public_identifier').notNull().unique(),
    publicIdentifierHash: text('public_identifier_hash').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    rotatedAt: integer('rotated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('public_dashboard_identifier_enabled_idx').on(table.publicIdentifierHash, table.enabled),
    check(
      'public_dashboard_identifier_length_check',
      sql`length(${table.publicIdentifier}) BETWEEN 1 AND 128`,
    ),
  ],
)
