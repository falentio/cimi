import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { TUser } from './auth.ts'
import { TInstallation } from './lifecycle.ts'
import { TSite } from './governance.ts'
import type { JsonObject } from './types.ts'

export const TCollectionPolicyRevision = sqliteTable(
  'collection_policy_revision',
  {
    id: text('id').primaryKey().notNull(),
    installationId: text('installation_id')
      .notNull()
      .references(() => TInstallation.id, { onDelete: 'restrict' }),
    scope: text('scope', { enum: ['installation', 'site'] }).notNull(),
    siteId: text('site_id').references(() => TSite.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    policyJson: text('policy_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    effectiveFrom: integer('effective_from', { mode: 'timestamp_ms' }).notNull(),
    effectiveTo: integer('effective_to', { mode: 'timestamp_ms' }),
    committedAt: integer('committed_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by').references(() => TUser.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('collection_policy_installation_version_unique')
      .on(table.installationId, table.version)
      .where(sql`${table.scope} = 'installation'`),
    uniqueIndex('collection_policy_site_version_unique')
      .on(table.installationId, table.siteId, table.version)
      .where(sql`${table.scope} = 'site'`),
    uniqueIndex('collection_policy_current_installation_unique')
      .on(table.installationId)
      .where(sql`${table.scope} = 'installation' AND ${table.effectiveTo} IS NULL`),
    uniqueIndex('collection_policy_current_site_unique')
      .on(table.installationId, table.siteId)
      .where(sql`${table.scope} = 'site' AND ${table.effectiveTo} IS NULL`),
    check(
      'collection_policy_scope_site_check',
      sql`(${table.scope} = 'installation' AND ${table.siteId} IS NULL) OR (${table.scope} = 'site' AND ${table.siteId} IS NOT NULL)`,
    ),
    check(
      'collection_policy_effective_interval_check',
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    index('collection_policy_target_effective_idx').on(
      table.installationId,
      table.siteId,
      table.effectiveTo,
    ),
  ],
)

export const TAcceptedEvent = sqliteTable(
  'accepted_event',
  {
    eventPk: integer('event_pk').primaryKey({ autoIncrement: true }),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    eventId: text('event_id').notNull(),
    eventKind: text('event_kind', {
      enum: ['page_view', 'custom_event', 'outbound', 'performance', 'error'],
    }).notNull(),
    occurrenceTime: integer('occurrence_time', { mode: 'timestamp_ms' }).notNull(),
    receiptTime: integer('receipt_time', { mode: 'timestamp_ms' }).notNull(),
    late: integer('late', { mode: 'boolean' }).notNull().default(false),
    visitorId: text('visitor_id'),
    identifiedUserId: text('identified_user_id'),
    analyticsSessionId: text('analytics_session_id'),
    policyRevisionId: text('policy_revision_id')
      .notNull()
      .references(() => TCollectionPolicyRevision.id, { onDelete: 'restrict' }),
    replaySequence: integer('replay_sequence').notNull().unique(),
    payloadFingerprint: text('payload_fingerprint').notNull(),
    projectionState: text('projection_state', { enum: ['pending', 'projected', 'failed'] })
      .notNull()
      .default('pending'),
    projectedAt: integer('projected_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('accepted_event_site_event_unique').on(table.siteId, table.eventId),
    index('accepted_event_site_occurrence_idx').on(table.siteId, table.occurrenceTime),
    index('accepted_event_site_receipt_idx').on(table.siteId, table.receiptTime),
    index('accepted_event_identity_idx').on(table.siteId, table.visitorId, table.identifiedUserId),
    index('accepted_event_session_idx').on(table.siteId, table.analyticsSessionId),
    uniqueIndex('accepted_event_acceptance_metadata_unique').on(
      table.eventPk,
      table.replaySequence,
      table.payloadFingerprint,
      table.receiptTime,
      table.policyRevisionId,
    ),
  ],
)

export const TEventPayload = sqliteTable('event_payload', {
  eventPk: integer('event_pk')
    .primaryKey()
    .references(() => TAcceptedEvent.eventPk, { onDelete: 'cascade' }),
  canonicalPayloadJson: text('canonical_payload_json').notNull(),
})

export const TEventPageView = sqliteTable('event_page_view', {
  eventPk: integer('event_pk')
    .primaryKey()
    .references(() => TAcceptedEvent.eventPk, { onDelete: 'cascade' }),
  pagePath: text('page_path').notNull(),
  referrer: text('referrer'),
})

export const TEventCustom = sqliteTable('event_custom', {
  eventPk: integer('event_pk')
    .primaryKey()
    .references(() => TAcceptedEvent.eventPk, { onDelete: 'cascade' }),
  name: text('name').notNull(),
})

export const TEventOutbound = sqliteTable('event_outbound', {
  eventPk: integer('event_pk')
    .primaryKey()
    .references(() => TAcceptedEvent.eventPk, { onDelete: 'cascade' }),
  destination: text('destination').notNull(),
  name: text('name'),
})

export const TEventPerformance = sqliteTable('event_performance', {
  eventPk: integer('event_pk')
    .primaryKey()
    .references(() => TAcceptedEvent.eventPk, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  value: real('value').notNull(),
  unit: text('unit'),
})

export const TEventError = sqliteTable('event_error', {
  eventPk: integer('event_pk')
    .primaryKey()
    .references(() => TAcceptedEvent.eventPk, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code'),
  message: text('message'),
})

export const TEventProperty = sqliteTable(
  'event_property',
  {
    eventPk: integer('event_pk')
      .notNull()
      .references(() => TAcceptedEvent.eventPk, { onDelete: 'cascade' }),
    propertyKey: text('property_key').notNull(),
    valueType: text('value_type', { enum: ['string', 'number', 'boolean', 'null'] }).notNull(),
    stringValue: text('string_value'),
    numberValue: real('number_value'),
    booleanValue: integer('boolean_value', { mode: 'boolean' }),
  },
  (table) => [
    primaryKey({ columns: [table.eventPk, table.propertyKey] }),
    index('event_property_key_idx').on(table.propertyKey),
    check(
      'event_property_typed_value_check',
      sql`(${table.valueType} = 'string' AND ${table.stringValue} IS NOT NULL AND ${table.numberValue} IS NULL AND ${table.booleanValue} IS NULL) OR (${table.valueType} = 'number' AND ${table.stringValue} IS NULL AND ${table.numberValue} IS NOT NULL AND ${table.booleanValue} IS NULL) OR (${table.valueType} = 'boolean' AND ${table.stringValue} IS NULL AND ${table.numberValue} IS NULL AND ${table.booleanValue} IS NOT NULL) OR (${table.valueType} = 'null' AND ${table.stringValue} IS NULL AND ${table.numberValue} IS NULL AND ${table.booleanValue} IS NULL)`,
    ),
  ],
)

export const TEventAcceptanceJournal = sqliteTable(
  'event_acceptance_journal',
  {
    eventPk: integer('event_pk')
      .primaryKey()
      .references(() => TAcceptedEvent.eventPk, { onDelete: 'cascade' }),
    replaySequence: integer('replay_sequence').notNull().unique(),
    payloadFingerprint: text('payload_fingerprint').notNull(),
    receiptTime: integer('receipt_time', { mode: 'timestamp_ms' }).notNull(),
    policyRevisionId: text('policy_revision_id')
      .notNull()
      .references(() => TCollectionPolicyRevision.id, { onDelete: 'restrict' }),
    acceptanceState: text('acceptance_state', { enum: ['accepted'] })
      .notNull()
      .default('accepted'),
    projectionState: text('projection_state', { enum: ['pending', 'projected', 'failed'] })
      .notNull()
      .default('pending'),
    committedAt: integer('committed_at', { mode: 'timestamp_ms' }).notNull(),
    flushId: text('flush_id'),
  },
  (table) => [
    index('event_acceptance_projection_sequence_idx').on(
      table.projectionState,
      table.replaySequence,
    ),
    foreignKey({
      columns: [
        table.eventPk,
        table.replaySequence,
        table.payloadFingerprint,
        table.receiptTime,
        table.policyRevisionId,
      ],
      foreignColumns: [
        TAcceptedEvent.eventPk,
        TAcceptedEvent.replaySequence,
        TAcceptedEvent.payloadFingerprint,
        TAcceptedEvent.receiptTime,
        TAcceptedEvent.policyRevisionId,
      ],
      name: 'event_acceptance_journal_metadata_fk',
    }),
  ],
)
