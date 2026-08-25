import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { TSite } from './governance.ts'

export const TProjectionCheckpoint = sqliteTable('projection_checkpoint', {
  siteId: text('site_id')
    .primaryKey()
    .references(() => TSite.id, { onDelete: 'restrict' }),
  projectedReplaySequence: integer('projected_replay_sequence').notNull().default(0),
  occurrenceCoveredFrom: integer('occurrence_covered_from', { mode: 'timestamp_ms' }),
  occurrenceCoveredThrough: integer('occurrence_covered_through', { mode: 'timestamp_ms' }),
  effectiveRetentionFrom: integer('effective_retention_from', { mode: 'timestamp_ms' }),
  statisticsRefreshedAt: integer('statistics_refreshed_at', { mode: 'timestamp_ms' }),
  readiness: text('readiness', {
    enum: ['ready', 'rebuilding', 'unavailable'],
  })
    .notNull()
    .default('ready'),
  projectionVersion: text('projection_version').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const TProjectionGap = sqliteTable(
  'projection_gap',
  {
    id: text('id').primaryKey().notNull(),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    occurrenceFrom: integer('occurrence_from', { mode: 'timestamp_ms' }),
    occurrenceTo: integer('occurrence_to', { mode: 'timestamp_ms' }),
    unbounded: integer('unbounded', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['open', 'resolved'] })
      .notNull()
      .default('open'),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('projection_gap_site_status_occurrence_idx').on(
      table.siteId,
      table.status,
      table.occurrenceFrom,
    ),
    check(
      'projection_gap_interval_check',
      sql`(${table.unbounded} = 1 AND ${table.occurrenceFrom} IS NULL AND ${table.occurrenceTo} IS NULL) OR (${table.unbounded} = 0 AND ${table.occurrenceFrom} IS NOT NULL AND ${table.occurrenceTo} IS NOT NULL AND ${table.occurrenceTo} > ${table.occurrenceFrom})`,
    ),
    check(
      'projection_gap_status_check',
      sql`(${table.status} = 'open' AND ${table.resolvedAt} IS NULL) OR (${table.status} = 'resolved' AND ${table.resolvedAt} IS NOT NULL)`,
    ),
  ],
)
