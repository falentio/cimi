import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import {
  getNestedMapValue,
  mergeEventAttribution,
  nestedMapValues,
  parseEventAttribution,
  setNestedMapValue,
} from '@cimi/utils'
import type { Db } from '../client.ts'
import { linkCoversEvent } from '../identity/coverage.ts'
import {
  ANALYTICS_PROJECTION_VERSION,
  ANALYTICS_REQUIRED_TABLES,
  ANALYTICS_MIGRATIONS,
} from './schema.ts'

export {
  ANALYTICS_PROJECTION_VERSION,
  ANALYTICS_MIGRATIONS,
  ANALYTICS_REQUIRED_TABLES,
  type AnalyticsMigration,
} from './schema.ts'

export const ANALYTICS_DB_FILENAME = 'analytics.duckdb'

export interface AnalyticsProjectionCheckpoint {
  readonly projectedAcceptanceSequence: number
  readonly occurrenceCoveredFrom: Date | null
  readonly occurrenceCoveredThrough: Date | null
  readonly statisticsRefreshedAt: Date | null
  readonly readiness: string
}

export interface AnalyticsProjectionGap {
  readonly id: string
  readonly occurrenceFrom: Date | null
  readonly occurrenceTo: Date | null
  readonly unbounded: boolean
}

/**
 * One reader-consistent view of a Site's projection state. `factCardinality` is counted in the
 * same read as the checkpoint, so it always describes exactly the projected set the checkpoint
 * reports; callers may compare the two without a torn read.
 */
export interface AnalyticsProjectionSnapshot {
  readonly checkpoint: AnalyticsProjectionCheckpoint | null
  readonly openGaps: readonly AnalyticsProjectionGap[]
  readonly factCardinality: number
}

export interface AnalyticsDb {
  ready(): Promise<boolean>
  rebuild(input: { controlDb: Db }): Promise<void>
  deleteExpired(input: { siteId: string; occurrenceCutoff: Date }): Promise<number>
  purgeSite(input: { siteId: string }): Promise<void>
  readProjectionSnapshot(input: { siteId: string }): Promise<AnalyticsProjectionSnapshot>
  close(): Promise<void>
}

export interface CreateAnalyticsDbOptions {
  path: string
  threads?: number
  memoryLimit?: string
  tempDirectory?: string
  maxTempDirectorySize?: string
}

export async function createAnalyticsDb(options: CreateAnalyticsDbOptions): Promise<AnalyticsDb> {
  const tempDirectory = options.tempDirectory ?? join(dirname(options.path), 'analytics.duckdb.tmp')
  mkdirSync(tempDirectory, { recursive: true })

  const instance = await DuckDBInstance.create(options.path, {
    threads: String(options.threads ?? 1),
    memory_limit: options.memoryLimit ?? '512MB',
    temp_directory: tempDirectory,
    max_temp_directory_size: options.maxTempDirectorySize ?? '1GB',
  })
  let connection: DuckDBConnection | undefined
  try {
    connection = await instance.connect()
    await applyMigrations(connection)
  } catch (error) {
    closeResources(connection, instance)
    throw error
  }

  if (!connection) {
    closeResources(undefined, instance)
    throw new Error('DuckDB connection was not created.')
  }

  let closed = false
  let unavailable = false
  let rebuilding = false
  let closing = false
  let serial: Promise<void> = Promise.resolve()

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const queued = serial.then(work, work)
    serial = queued.then(
      () => undefined,
      () => undefined,
    )
    return queued
  }

  return {
    async ready(): Promise<boolean> {
      if (closed || unavailable || rebuilding || closing) return false

      try {
        const reader = await connection.runAndReadAll(
          `SELECT count(*) AS table_count
           FROM information_schema.tables
           WHERE table_schema = 'main'
             AND table_name IN (${ANALYTICS_REQUIRED_TABLES.map((table) => `'${table}'`).join(', ')})`,
        )
        const row = reader.getRowObjects()[0]
        if (Number(row?.['table_count']) !== ANALYTICS_REQUIRED_TABLES.length) return false
        const versionReader = await connection.runAndReadAll(
          `SELECT count(*) AS stale_count
           FROM projection_checkpoints
           WHERE projection_version <> '${ANALYTICS_PROJECTION_VERSION}'`,
        )
        const versionRow = versionReader.getRowObjects()[0]
        return Number(versionRow?.['stale_count']) === 0
      } catch {
        return false
      }
    },
    async readProjectionSnapshot(input: { siteId: string }): Promise<AnalyticsProjectionSnapshot> {
      if (closed || closing) throw new Error('Analytics database is closed')
      if (unavailable) throw new Error('Analytics database is unavailable')
      return enqueue(async () => {
        const checkpointReader = await connection.runAndReadAll(
          `SELECT projected_replay_sequence,
                  epoch_ms(occurrence_covered_from) AS occurrence_covered_from,
                  epoch_ms(occurrence_covered_through) AS occurrence_covered_through,
                  epoch_ms(statistics_refreshed_at) AS statistics_refreshed_at,
                  readiness
           FROM projection_checkpoints WHERE site_id = ?`,
          [input.siteId],
        )
        const checkpointRow = checkpointReader.getRowObjects()[0]
        const gapReader = await connection.runAndReadAll(
          `SELECT id, epoch_ms(occurrence_from) AS occurrence_from,
                  epoch_ms(occurrence_to) AS occurrence_to, unbounded
           FROM projection_gaps WHERE site_id = ? AND status = 'open' ORDER BY id`,
          [input.siteId],
        )
        const cardinalityReader = await connection.runAndReadAll(
          'SELECT count(*) AS fact_cardinality FROM events WHERE site_id = ?',
          [input.siteId],
        )
        const factCardinality = Number(
          cardinalityReader.getRowObjects()[0]?.['fact_cardinality'] ?? 0,
        )
        if (checkpointRow === undefined) {
          return {
            checkpoint: null,
            openGaps: readGapRows(gapReader.getRowObjects()),
            factCardinality,
          }
        }
        return {
          checkpoint: {
            projectedAcceptanceSequence: Number(checkpointRow['projected_replay_sequence'] ?? 0),
            occurrenceCoveredFrom: readInstant(checkpointRow['occurrence_covered_from']),
            occurrenceCoveredThrough: readInstant(checkpointRow['occurrence_covered_through']),
            statisticsRefreshedAt: readInstant(checkpointRow['statistics_refreshed_at']),
            readiness: String(checkpointRow['readiness'] ?? 'unavailable'),
          },
          openGaps: readGapRows(gapReader.getRowObjects()),
          factCardinality,
        }
      })
    },
    async rebuild(input: { controlDb: Db }): Promise<void> {
      if (closed || closing) throw new Error('Analytics database is closed')
      if (unavailable) throw new Error('Analytics database is unavailable')
      if (rebuilding) throw new Error('Analytics database rebuild is already running')
      rebuilding = true

      return enqueue(async () => {
        try {
          const events = readEvents(input.controlDb)
          const properties = readProperties(input.controlDb)
          const identities = readIdentities(input.controlDb)
          const checkpoints = readProjectionCheckpoints(input.controlDb)
          const gaps = readProjectionGaps(input.controlDb)
          const propertiesByEvent = new Map<
            number,
            Record<string, string | number | boolean | null>
          >()
          for (const property of properties) {
            const eventProperties = propertiesByEvent.get(property.eventPk) ?? {}
            eventProperties[property.propertyKey] = propertyValue(property)
            propertiesByEvent.set(property.eventPk, eventProperties)
          }

          const projectedEvents = events
            .filter((event) => event.projectionState !== 'failed')
            .map((event) => projectEventIdentity(event, identities))
          const sessions = new Map<string, Map<string, SessionRow>>()
          const visitors = new Map<string, Map<string, VisitorRow>>()
          for (const event of projectedEvents) {
            if (event.visitorId !== null) {
              const visitor = getNestedMapValue(visitors, event.siteId, event.visitorId)
              if (visitor === undefined) {
                setNestedMapValue(visitors, event.siteId, event.visitorId, {
                  siteId: event.siteId,
                  visitorId: event.visitorId,
                  identityKind: event.identifiedUserId === null ? 'anonymous' : 'identified',
                  profileId: event.profileId,
                  firstSeenAt: event.occurrenceTime,
                  lastSeenAt: event.occurrenceTime,
                })
              } else {
                visitor.firstSeenAt = Math.min(visitor.firstSeenAt, event.occurrenceTime)
                visitor.lastSeenAt = Math.max(visitor.lastSeenAt, event.occurrenceTime)
                if (event.identifiedUserId !== null) visitor.identityKind = 'identified'
                if (event.profileId !== null) {
                  if (visitor.profileId === null) visitor.profileId = event.profileId
                  else if (visitor.profileId !== event.profileId) visitor.profileId = null
                }
              }
            }

            if (event.analyticsSessionId !== null) {
              const session = getNestedMapValue(sessions, event.siteId, event.analyticsSessionId)
              if (session === undefined) {
                setNestedMapValue(sessions, event.siteId, event.analyticsSessionId, {
                  siteId: event.siteId,
                  sessionId: event.analyticsSessionId,
                  visitorId: event.visitorId,
                  identifiedUserId: event.identifiedUserId,
                  startedAt: event.occurrenceTime,
                  endedAt: event.occurrenceTime,
                  entryPage: event.pagePath,
                  referrer: event.referrer,
                  utmSource: event.utmSource,
                  utmMedium: event.utmMedium,
                  utmCampaign: event.utmCampaign,
                  device: event.deviceType,
                  browser: event.browserType,
                  operatingSystem: event.operatingSystem,
                  country: event.country,
                })
              } else {
                const earlier = event.occurrenceTime < session.startedAt
                session.startedAt = Math.min(session.startedAt, event.occurrenceTime)
                session.endedAt = Math.max(session.endedAt, event.occurrenceTime)
                if (session.visitorId === null) session.visitorId = event.visitorId
                if (session.identifiedUserId === null)
                  session.identifiedUserId = event.identifiedUserId
                if (earlier || session.entryPage === null) session.entryPage = event.pagePath
                if (earlier || session.referrer === null) session.referrer = event.referrer
                if (earlier || session.utmSource === null) session.utmSource = event.utmSource
                if (earlier || session.utmMedium === null) session.utmMedium = event.utmMedium
                if (earlier || session.utmCampaign === null) session.utmCampaign = event.utmCampaign
                if (earlier || session.device === null) session.device = event.deviceType
                if (earlier || session.browser === null) session.browser = event.browserType
                if (earlier || session.operatingSystem === null)
                  session.operatingSystem = event.operatingSystem
                if (earlier || session.country === null) session.country = event.country
              }
            }
          }

          await connection.run('BEGIN TRANSACTION')
          try {
            await connection.run('DELETE FROM event_properties')
            await connection.run('DELETE FROM events')
            await connection.run('DELETE FROM analytics_sessions')
            await connection.run('DELETE FROM visitors')
            await connection.run('DELETE FROM projection_checkpoints')
            await connection.run('DELETE FROM projection_gaps')

            for (const event of projectedEvents) {
              const eventProperties = propertiesByEvent.get(event.eventPk)
              await connection.run(
                `INSERT INTO events (
               event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, late,
                 visitor_id, anonymous_identity_id, identified_user_id, analytics_session_id,
                 bot_policy_outcome, utm_source, utm_medium, utm_campaign, device, browser,
                 operating_system, country, page_path, referrer, name, destination, value, unit,
                 code, message, properties_json, policy_revision_id,
                 replay_sequence, payload_fingerprint, projected_at
              ) VALUES (?, ?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, CAST(? AS TIMESTAMP))`,
                [
                  event.eventPk,
                  event.siteId,
                  event.eventId,
                  event.eventKind,
                  timestamp(event.occurrenceTime),
                  timestamp(event.receiptTime),
                  Boolean(event.late),
                  event.visitorId,
                  event.anonymousIdentityId,
                  event.identifiedUserId,
                  event.analyticsSessionId,
                  event.botPolicyOutcome,
                  event.utmSource,
                  event.utmMedium,
                  event.utmCampaign,
                  event.deviceType,
                  event.browserType,
                  event.operatingSystem,
                  event.country,
                  event.pagePath,
                  event.referrer,
                  event.name,
                  event.destination,
                  event.value,
                  event.unit,
                  event.code,
                  event.message,
                  eventProperties === undefined ? null : JSON.stringify(eventProperties),
                  event.policyRevisionId,
                  event.replaySequence,
                  event.payloadFingerprint,
                  timestamp(event.projectedAt),
                ],
              )
            }

            for (const visitor of nestedMapValues(visitors)) {
              await connection.run(
                `INSERT INTO visitors (site_id, visitor_id, identity_kind, first_seen_at, last_seen_at, profile_id)
             VALUES (?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), ?)`,
                [
                  visitor.siteId,
                  visitor.visitorId,
                  visitor.identityKind,
                  timestamp(visitor.firstSeenAt),
                  timestamp(visitor.lastSeenAt),
                  visitor.profileId,
                ],
              )
            }

            for (const session of nestedMapValues(sessions)) {
              await connection.run(
                `INSERT INTO analytics_sessions (
               site_id, session_id, visitor_id, identified_user_id, started_at, ended_at,
               entry_page, referrer, utm_source, utm_medium, utm_campaign, device, browser,
               operating_system, country, region, city
             ) VALUES (?, ?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  session.siteId,
                  session.sessionId,
                  session.visitorId,
                  session.identifiedUserId,
                  timestamp(session.startedAt),
                  timestamp(session.endedAt),
                  session.entryPage,
                  session.referrer,
                  session.utmSource,
                  session.utmMedium,
                  session.utmCampaign,
                  session.device,
                  session.browser,
                  session.operatingSystem,
                  session.country,
                  null,
                  null,
                ],
              )
            }

            for (const checkpoint of checkpoints) {
              await connection.run(
                `INSERT INTO projection_checkpoints (
               site_id, projected_replay_sequence, occurrence_covered_from,
               occurrence_covered_through, effective_retention_from, statistics_refreshed_at,
               readiness, projection_version, updated_at
             ) VALUES (?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), ?, ?, CAST(? AS TIMESTAMP))`,
                [
                  checkpoint.siteId,
                  checkpoint.projectedReplaySequence,
                  timestamp(checkpoint.occurrenceCoveredFrom),
                  timestamp(checkpoint.occurrenceCoveredThrough),
                  timestamp(checkpoint.effectiveRetentionFrom),
                  timestamp(checkpoint.statisticsRefreshedAt),
                  checkpoint.readiness,
                  checkpoint.projectionVersion,
                  timestamp(checkpoint.updatedAt),
                ],
              )
            }

            for (const gap of gaps) {
              await connection.run(
                `INSERT INTO projection_gaps (
               id, site_id, occurrence_from, occurrence_to, unbounded, status, observed_at, resolved_at
             ) VALUES (?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP))`,
                [
                  gap.id,
                  gap.siteId,
                  timestamp(gap.occurrenceFrom),
                  timestamp(gap.occurrenceTo),
                  Boolean(gap.unbounded),
                  gap.status,
                  timestamp(gap.observedAt),
                  timestamp(gap.resolvedAt),
                ],
              )
            }

            for (const property of properties) {
              await connection.run(
                `INSERT INTO event_properties (
               site_id, event_id, property_key, value_type, string_value, number_value, boolean_value
             ) SELECT site_id, event_id, ?, ?, ?, ?, ? FROM events WHERE event_pk = ?`,
                [
                  property.propertyKey,
                  property.valueType,
                  property.stringValue,
                  property.numberValue,
                  property.booleanValue === null ? null : Boolean(property.booleanValue),
                  property.eventPk,
                ],
              )
            }

            await connection.run('COMMIT')
          } catch (error) {
            try {
              await connection.run('ROLLBACK')
            } catch {
              unavailable = true
              closeResources(connection, instance)
            }
            throw error
          }
        } finally {
          rebuilding = false
        }
      })
    },
    async deleteExpired(input: { siteId: string; occurrenceCutoff: Date }): Promise<number> {
      if (closed || closing) throw new Error('Analytics database is closed')
      if (unavailable) throw new Error('Analytics database is unavailable')
      if (rebuilding) throw new Error('Analytics database rebuild is already running')
      return enqueue(async () => {
        const cutoff = timestamp(input.occurrenceCutoff.getTime())
        const countReader = await connection.runAndReadAll(
          `SELECT count(*) AS count FROM events
           WHERE site_id = ? AND occurrence_time < CAST(? AS TIMESTAMP)`,
          [input.siteId, cutoff],
        )
        const count = Number(countReader.getRowObjects()[0]?.['count'] ?? 0)
        await connection.run('BEGIN TRANSACTION')
        try {
          await connection.run(
            `DELETE FROM event_properties
             WHERE site_id = ? AND event_id IN (
               SELECT event_id FROM events
               WHERE site_id = ? AND occurrence_time < CAST(? AS TIMESTAMP)
             )`,
            [input.siteId, input.siteId, cutoff],
          )
          await connection.run(
            `DELETE FROM events
             WHERE site_id = ? AND occurrence_time < CAST(? AS TIMESTAMP)`,
            [input.siteId, cutoff],
          )
          await connection.run(
            `UPDATE analytics_sessions AS session
             SET visitor_id = (
                   SELECT event.visitor_id FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 identified_user_id = (
                   SELECT event.identified_user_id FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 started_at = (
                   SELECT min(event.occurrence_time) FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                 ),
                 ended_at = (
                   SELECT max(event.occurrence_time) FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                 ),
                 entry_page = (
                   SELECT event.page_path FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 referrer = (
                   SELECT event.referrer FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 utm_source = (
                   SELECT event.utm_source FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 utm_medium = (
                   SELECT event.utm_medium FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 utm_campaign = (
                   SELECT event.utm_campaign FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 device = (
                   SELECT event.device FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 browser = (
                   SELECT event.browser FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 operating_system = (
                   SELECT event.operating_system FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 ),
                 country = (
                   SELECT event.country FROM events event
                   WHERE event.site_id = session.site_id
                     AND event.analytics_session_id = session.session_id
                   ORDER BY event.occurrence_time, event.event_id LIMIT 1
                 )
             WHERE session.site_id = ?
               AND EXISTS (
                 SELECT 1 FROM events event
                 WHERE event.site_id = session.site_id
                   AND event.analytics_session_id = session.session_id
               )`,
            [input.siteId],
          )
          await connection.run(
            `UPDATE visitors AS visitor
             SET first_seen_at = (
                   SELECT min(event.occurrence_time) FROM events event
                   WHERE event.site_id = visitor.site_id AND event.visitor_id = visitor.visitor_id
                 ),
                 last_seen_at = (
                   SELECT max(event.occurrence_time) FROM events event
                   WHERE event.site_id = visitor.site_id AND event.visitor_id = visitor.visitor_id
                 ),
                 identity_kind = CASE WHEN EXISTS (
                   SELECT 1 FROM events event
                   WHERE event.site_id = visitor.site_id
                     AND event.visitor_id = visitor.visitor_id
                     AND event.identified_user_id IS NOT NULL
                 ) THEN 'identified' ELSE 'anonymous' END
             WHERE visitor.site_id = ?
               AND EXISTS (
                 SELECT 1 FROM events event
                 WHERE event.site_id = visitor.site_id AND event.visitor_id = visitor.visitor_id
               )`,
            [input.siteId],
          )
          await connection.run(
            `DELETE FROM analytics_sessions
             WHERE site_id = ? AND NOT EXISTS (
               SELECT 1 FROM events
               WHERE events.site_id = analytics_sessions.site_id
                 AND events.analytics_session_id = analytics_sessions.session_id
             )`,
            [input.siteId],
          )
          await connection.run(
            `DELETE FROM visitors
             WHERE site_id = ? AND NOT EXISTS (
               SELECT 1 FROM events
               WHERE events.site_id = visitors.site_id
                 AND events.visitor_id = visitors.visitor_id
             )`,
            [input.siteId],
          )
          await connection.run(
            `UPDATE projection_checkpoints AS checkpoint
             SET occurrence_covered_from = (
                   SELECT min(event.occurrence_time) FROM events event
                   WHERE event.site_id = checkpoint.site_id
                 ),
                 occurrence_covered_through = (
                   SELECT max(event.occurrence_time) FROM events event
                   WHERE event.site_id = checkpoint.site_id
                 ),
                 effective_retention_from = CAST(? AS TIMESTAMP),
                 statistics_refreshed_at = current_timestamp,
                 updated_at = current_timestamp
             WHERE checkpoint.site_id = ?`,
            [cutoff, input.siteId],
          )
          await connection.run(
            `DELETE FROM projection_gaps
             WHERE site_id = ? AND occurrence_to IS NOT NULL AND occurrence_to < CAST(? AS TIMESTAMP)`,
            [input.siteId, cutoff],
          )
          await connection.run('COMMIT')
        } catch (error) {
          await connection.run('ROLLBACK')
          throw error
        }
        return count
      })
    },
    async purgeSite(input: { siteId: string }): Promise<void> {
      if (closed || closing) throw new Error('Analytics database is closed')
      if (unavailable) throw new Error('Analytics database is unavailable')
      if (rebuilding) throw new Error('Analytics database rebuild is already running')
      return enqueue(async () => {
        await connection.run('BEGIN TRANSACTION')
        try {
          await connection.run('DELETE FROM event_properties WHERE site_id = ?', [input.siteId])
          await connection.run('DELETE FROM events WHERE site_id = ?', [input.siteId])
          await connection.run('DELETE FROM analytics_sessions WHERE site_id = ?', [input.siteId])
          await connection.run('DELETE FROM visitors WHERE site_id = ?', [input.siteId])
          await connection.run('DELETE FROM projection_checkpoints WHERE site_id = ?', [
            input.siteId,
          ])
          await connection.run('DELETE FROM projection_gaps WHERE site_id = ?', [input.siteId])
          await connection.run('COMMIT')
        } catch (error) {
          await connection.run('ROLLBACK')
          throw error
        }
      })
    },
    async close(): Promise<void> {
      if (closed || closing) return
      closing = true

      return enqueue(async () => {
        if (closed) return
        closed = true
        try {
          await connection.run('CHECKPOINT')
        } finally {
          closeResources(connection, instance)
        }
      })
    },
  }
}

interface EventRow {
  eventPk: number
  siteId: string
  eventId: string
  eventKind: string
  occurrenceTime: number
  receiptTime: number
  late: number
  visitorId: string | null
  anonymousIdentityId: string | null
  identifiedUserId: string | null
  analyticsSessionId: string | null
  botPolicyOutcome: string
  policyRevisionId: string
  replaySequence: number
  payloadFingerprint: string
  projectionState: 'pending' | 'projected' | 'failed'
  projectedAt: number | null
  pagePath: string | null
  referrer: string | null
  name: string | null
  destination: string | null
  value: number | null
  unit: string | null
  code: string | null
  message: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  deviceType: string | null
  browserType: string | null
  operatingSystem: string | null
  country: string | null
  canonicalPayloadJson: string | null
}

interface PropertyRow {
  eventPk: number
  propertyKey: string
  valueType: 'string' | 'number' | 'boolean' | 'null'
  stringValue: string | null
  numberValue: number | null
  booleanValue: number | null
}

interface IdentityEpochRow {
  profileId: string
  siteId: string
  identifiedUserId: string
  profileEpoch: number
  profileStatus: string
  epochStatus: 'active' | 'redacted'
  startedAt: number
  endedAt: number | null
}

interface IdentityLinkRow {
  siteId: string
  profileId: string
  profileEpoch: number
  anonymousIdentityId: string
  analyticsSessionId: string | null
  effectiveFrom: number
  unlinkedAt: number | null
}

interface IdentityRedactionRow {
  siteId: string
  profileId: string
  identifiedUserId: string
  profileEpoch: number
  status: 'requested' | 'applying' | 'applied'
}

interface Identities {
  epochs: IdentityEpochRow[]
  links: IdentityLinkRow[]
  redactions: IdentityRedactionRow[]
}

interface ProjectionCheckpointRow {
  siteId: string
  projectedReplaySequence: number
  occurrenceCoveredFrom: number | null
  occurrenceCoveredThrough: number | null
  effectiveRetentionFrom: number | null
  statisticsRefreshedAt: number | null
  readiness: string
  projectionVersion: string
  updatedAt: number
}

interface GapRow {
  id: string
  siteId: string
  occurrenceFrom: number | null
  occurrenceTo: number | null
  unbounded: number
  status: string
  observedAt: number
  resolvedAt: number | null
}

interface VisitorRow {
  siteId: string
  visitorId: string
  identityKind: 'anonymous' | 'identified'
  profileId: string | null
  firstSeenAt: number
  lastSeenAt: number
}

interface SessionRow {
  siteId: string
  sessionId: string
  visitorId: string | null
  identifiedUserId: string | null
  startedAt: number
  endedAt: number
  entryPage: string | null
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  device: string | null
  browser: string | null
  operatingSystem: string | null
  country: string | null
}

function readEvents(db: Db): EventRow[] {
  const rows = db.$client
    .prepare(
      `SELECT
         ae.event_pk AS eventPk, ae.site_id AS siteId, ae.event_id AS eventId,
          ae.event_kind AS eventKind, ae.occurrence_time AS occurrenceTime,
          ae.receipt_time AS receiptTime, ae.late AS late, ae.visitor_id AS visitorId,
          ae.anonymous_identity_id AS anonymousIdentityId,
           ae.identified_user_id AS identifiedUserId, ae.analytics_session_id AS analyticsSessionId,
           ae.bot_policy_outcome AS botPolicyOutcome,
           ae.utm_source AS utmSource, ae.utm_medium AS utmMedium,
           ae.utm_campaign AS utmCampaign, ae.device_type AS deviceType,
           ae.browser AS browserType, ae.operating_system AS operatingSystem,
           ae.country AS country,
          ae.policy_revision_id AS policyRevisionId, ae.replay_sequence AS replaySequence,
         ae.payload_fingerprint AS payloadFingerprint, ae.projection_state AS projectionState,
         ae.projected_at AS projectedAt,
         epv.page_path AS pagePath, epv.referrer AS referrer,
         COALESCE(ec.name, eo.name, ep.name, ee.name) AS name,
         eo.destination AS destination, ep.value AS value, ep.unit AS unit,
          ee.code AS code, ee.message AS message,
          payload.canonical_payload_json AS canonicalPayloadJson
        FROM accepted_event ae
        JOIN site s ON s.id = ae.site_id AND s.status = 'active'
         LEFT JOIN event_page_view epv ON epv.event_pk = ae.event_pk
         LEFT JOIN event_payload payload ON payload.event_pk = ae.event_pk
       LEFT JOIN event_custom ec ON ec.event_pk = ae.event_pk
       LEFT JOIN event_outbound eo ON eo.event_pk = ae.event_pk
         LEFT JOIN event_performance ep ON ep.event_pk = ae.event_pk
         LEFT JOIN event_error ee ON ee.event_pk = ae.event_pk
         LEFT JOIN retention_effective_cutoff rc ON rc.site_id = ae.site_id
         WHERE (rc.site_id IS NULL OR ae.occurrence_time >= rc.event_occurrence_cutoff_at)
           AND NOT EXISTS (SELECT 1 FROM site_tombstone st WHERE st.site_id = ae.site_id)
        ORDER BY ae.replay_sequence`,
    )
    .all() as EventRow[]
  return rows.map((row) => {
    const attribution = mergeEventAttribution(
      {
        utmSource: row.utmSource,
        utmMedium: row.utmMedium,
        utmCampaign: row.utmCampaign,
        deviceType: row.deviceType,
        browser: row.browserType,
        os: row.operatingSystem,
        country: row.country,
      },
      parseEventAttribution(row.canonicalPayloadJson),
    )
    return {
      ...row,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      deviceType: attribution.deviceType,
      browserType: attribution.browser,
      operatingSystem: attribution.os,
      country: attribution.country,
    }
  })
}

function readProperties(db: Db): PropertyRow[] {
  return db.$client
    .prepare(
      `SELECT
         event_pk AS eventPk, property_key AS propertyKey, value_type AS valueType,
         string_value AS stringValue, number_value AS numberValue, boolean_value AS booleanValue
       FROM event_property
       ORDER BY event_pk, property_key`,
    )
    .all() as PropertyRow[]
}

function readIdentities(db: Db): Identities {
  const epochs = db.$client
    .prepare(
      `SELECT
         e.profile_id AS profileId, e.site_id AS siteId, e.identified_user_id AS identifiedUserId,
         e.epoch AS profileEpoch, p.status AS profileStatus, e.status AS epochStatus,
         e.started_at AS startedAt, e.ended_at AS endedAt
        FROM identity_profile_epoch e
        JOIN identity_profile p ON p.profile_id = e.profile_id
        JOIN site s ON s.id = e.site_id AND s.status = 'active'
        WHERE NOT EXISTS (SELECT 1 FROM site_tombstone st WHERE st.site_id = e.site_id)
        ORDER BY e.site_id, e.identified_user_id, e.epoch`,
    )
    .all() as IdentityEpochRow[]
  const links = db.$client
    .prepare(
      `SELECT
         site_id AS siteId, profile_id AS profileId, profile_epoch AS profileEpoch,
         anonymous_identity_id AS anonymousIdentityId, analytics_session_id AS analyticsSessionId,
         effective_from AS effectiveFrom, unlinked_at AS unlinkedAt
       FROM identity_link
       ORDER BY site_id, anonymous_identity_id, effective_from, id`,
    )
    .all() as IdentityLinkRow[]
  const redactions = db.$client
    .prepare(
      `SELECT
         site_id AS siteId, profile_id AS profileId, identified_user_id AS identifiedUserId,
         profile_epoch AS profileEpoch, status
       FROM identity_redaction
       ORDER BY site_id, identified_user_id, profile_epoch, id`,
    )
    .all() as IdentityRedactionRow[]
  return { epochs, links, redactions }
}

function readProjectionCheckpoints(db: Db): ProjectionCheckpointRow[] {
  return db.$client
    .prepare(
      `SELECT
         s.id AS siteId, COALESCE(pc.projected_replay_sequence, 0) AS projectedReplaySequence,
         occurrence_covered_from AS occurrenceCoveredFrom,
          occurrence_covered_through AS occurrenceCoveredThrough,
          COALESCE(rc.event_occurrence_cutoff_at, pc.effective_retention_from) AS effectiveRetentionFrom,
         statistics_refreshed_at AS statisticsRefreshedAt,
         COALESCE(pc.readiness, 'ready') AS readiness,
          '${ANALYTICS_PROJECTION_VERSION}' AS projectionVersion,
         COALESCE(pc.updated_at, s.updated_at) AS updatedAt
         FROM site s
         LEFT JOIN projection_checkpoint pc ON pc.site_id = s.id
         LEFT JOIN retention_effective_cutoff rc ON rc.site_id = s.id
         WHERE s.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM site_tombstone st WHERE st.site_id = s.id)
         ORDER BY s.id`,
    )
    .all() as ProjectionCheckpointRow[]
}

function readProjectionGaps(db: Db): GapRow[] {
  return db.$client
    .prepare(
      `SELECT
         id, site_id AS siteId, occurrence_from AS occurrenceFrom,
         occurrence_to AS occurrenceTo, unbounded, status, observed_at AS observedAt,
         resolved_at AS resolvedAt
       FROM projection_gap
       ORDER BY id`,
    )
    .all() as GapRow[]
}

function projectEventIdentity(
  event: EventRow,
  identities: Identities,
): EventRow & {
  profileId: string | null
} {
  const links = identities.links.filter((link) =>
    linkCoversEvent(
      {
        siteId: link.siteId,
        profileId: link.profileId,
        profileEpoch: link.profileEpoch,
        anonymousIdentityId: link.anonymousIdentityId,
        analyticsSessionId: link.analyticsSessionId,
        effectiveFromMs: link.effectiveFrom,
        unlinkedAtMs: link.unlinkedAt,
      },
      {
        siteId: event.siteId,
        anonymousIdentityId: event.anonymousIdentityId,
        analyticsSessionId: event.analyticsSessionId,
        receiptTimeMs: event.receiptTime,
      },
    ),
  )
  const linkedEpochs = identities.epochs.filter(
    (epoch) =>
      links.some(
        (link) => link.profileId === epoch.profileId && link.profileEpoch === epoch.profileEpoch,
      ) &&
      (event.identifiedUserId === null || epoch.identifiedUserId === event.identifiedUserId),
  )
  if (links.length > 0 && linkedEpochs.length === 0) {
    throw new Error('Identity link references a missing or mismatched Profile Epoch')
  }
  const temporalEpochs = identities.epochs.filter(
    (epoch) =>
      epoch.siteId === event.siteId &&
      event.identifiedUserId !== null &&
      epoch.identifiedUserId === event.identifiedUserId &&
      epoch.startedAt <= event.occurrenceTime &&
      (epoch.endedAt === null || event.occurrenceTime < epoch.endedAt),
  )
  const candidates = linkedEpochs.length > 0 ? linkedEpochs : temporalEpochs
  if (candidates.length > 1) throw new Error('Ambiguous identity Profile Epoch')
  const epoch = candidates[0]
  const redacted = identities.redactions.some(
    (redaction) =>
      redaction.siteId === event.siteId &&
      (epoch !== undefined
        ? redaction.profileId === epoch.profileId && redaction.profileEpoch === epoch.profileEpoch
        : event.identifiedUserId !== null && redaction.identifiedUserId === event.identifiedUserId),
  )
  if (
    redacted ||
    epoch?.epochStatus === 'redacted' ||
    (epoch !== undefined && epoch.profileStatus !== 'active')
  ) {
    return { ...event, identifiedUserId: null, profileId: null }
  }
  if (epoch === undefined) return { ...event, profileId: null }
  return { ...event, identifiedUserId: epoch.identifiedUserId, profileId: epoch.profileId }
}

function propertyValue(property: PropertyRow): string | number | boolean | null {
  if (property.valueType === 'string') return property.stringValue
  if (property.valueType === 'number') return property.numberValue
  if (property.valueType === 'boolean') return property.booleanValue !== 0
  return null
}

function timestamp(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

/**
 * Reads a DuckDB instant selected as `epoch_ms(...)`. A naive DuckDB `TIMESTAMP` converts to a JS
 * `Date` through the host timezone, so the projection reads select epoch milliseconds and rebuild
 * the instant here instead.
 */
function readInstant(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'bigint' || typeof value === 'number') {
    const parsed = new Date(Number(value))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function readGapRows(rows: readonly Record<string, unknown>[]): AnalyticsProjectionGap[] {
  return rows.map((row) => ({
    id: String(row['id']),
    occurrenceFrom: readInstant(row['occurrence_from']),
    occurrenceTo: readInstant(row['occurrence_to']),
    unbounded: Boolean(row['unbounded']),
  }))
}

function closeResources(
  connection: DuckDBConnection | undefined,
  instance: Awaited<ReturnType<typeof DuckDBInstance.create>>,
): void {
  try {
    connection?.closeSync()
  } catch {}
  try {
    instance.closeSync()
  } catch {}
}

async function applyMigrations(connection: DuckDBConnection): Promise<void> {
  await connection.run(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT current_timestamp)',
  )

  const reader = await connection.runAndReadAll('SELECT version FROM schema_migrations')
  await reader.readAll()

  const appliedVersions = new Set<number>()
  for (const row of reader.getRowObjects()) {
    appliedVersions.add(Number(row['version']))
  }

  const pending = ANALYTICS_MIGRATIONS.filter(
    (migration) => !appliedVersions.has(migration.version),
  )
  if (pending.length === 0) {
    return
  }

  await connection.run('BEGIN TRANSACTION')
  try {
    for (const migration of pending) {
      await connection.run(migration.sql)
      await connection.run(
        'INSERT INTO schema_migrations (version, name) VALUES ($version, $name)',
        {
          version: migration.version,
          name: migration.name,
        },
      )
    }
    await connection.run('COMMIT')
  } catch (error) {
    await connection.run('ROLLBACK')
    throw error
  }
}
