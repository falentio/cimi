import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DuckDBInstance, type DuckDBConnection, type DuckDBValue } from '@duckdb/node-api'
import { isBigintValue, isBooleanValue, isNumberValue, isStringValue, isRecord } from '@cimi/utils'
import type { Db } from '../client.ts'
import {
  ANALYTICS_PROJECTION_VERSION,
  ANALYTICS_REQUIRED_TABLES,
  ANALYTICS_MIGRATIONS,
} from './schema.ts'
import { createDuckDbCloseController } from './close-progress.ts'
import {
  propertyValue,
  projectEventIdentity,
  readActiveSiteIds,
  readEvents,
  readIdentities,
  readProjectionGaps,
  readProperties,
  timestamp,
  type ProjectedEventRow,
} from './projection-source.ts'
import {
  createFactFoldState,
  foldProjectedEvent,
  foldSessionRows,
  foldVisitorRows,
} from './projection-fold.ts'
import {
  AnalyticsProjectionAppender,
  DEFAULT_APPEND_CHUNK_ROWS,
  type AnalyticsProjectionAppendResult,
  type ProjectionAppendConnection,
  type ProjectionAppendTransaction,
} from './projection-append.ts'
import {
  appendEventRows,
  appendFactRows,
  appendPropertyRows,
  appendSessionRows,
  appendVisitorRows,
} from './fact-writer.ts'

export {
  ANALYTICS_PROJECTION_VERSION,
  ANALYTICS_MIGRATIONS,
  ANALYTICS_REQUIRED_TABLES,
  type AnalyticsMigration,
} from './schema.ts'

export {
  AnalyticsProjectionAppender,
  DEFAULT_APPEND_CHUNK_ROWS,
  type AnalyticsProjectionAppendResult,
  type ProjectionAppendConnection,
  type ProjectionAppendSource,
  type ProjectionAppendTransaction,
} from './projection-append.ts'

export const ANALYTICS_DB_FILENAME = 'analytics.duckdb'

export interface AnalyticsProjectionCheckpoint {
  readonly projectedAcceptanceSequence: number
  readonly projectedFactCardinality: number | null
  readonly projectionGeneration: number
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
 * One reader-consistent view of a Site's projection state. `factCardinality` is counted live in
 * the same read as the checkpoint. The checkpoint's `projectedFactCardinality` is what the last
 * rebuild published, so comparing the two tells a caller whether the counted facts are the ones
 * the checkpoint describes.
 */
export interface AnalyticsProjectionSnapshot {
  readonly checkpoint: AnalyticsProjectionCheckpoint | null
  readonly openGaps: readonly AnalyticsProjectionGap[]
  readonly factCardinality: number
}

export type AnalyticsReportScalar = string | number | boolean | null

export interface AnalyticsReportEvent {
  readonly eventId: string
  readonly eventKind: string
  readonly occurrenceTime: Date
  readonly visitorId: string | null
  readonly identifiedUserId: string | null
  readonly sessionId: string | null
  readonly pagePath: string | null
  readonly referrer: string | null
  readonly name: string | null
  readonly destination: string | null
  readonly unit: string | null
  readonly code: string | null
  readonly properties: Readonly<Record<string, AnalyticsReportScalar>>
}

export interface AnalyticsReportSession {
  readonly sessionId: string
  readonly visitorId: string | null
  readonly identifiedUserId: string | null
  readonly startedAt: Date
  readonly endedAt: Date | null
  readonly entryPage: string | null
  readonly exitPage: string | null
  readonly referrer: string | null
  readonly utmSource: string | null
  readonly utmMedium: string | null
  readonly utmCampaign: string | null
  readonly device: string | null
  readonly browser: string | null
  readonly operatingSystem: string | null
  readonly country: string | null
  readonly region: string | null
  readonly city: string | null
}

export interface AnalyticsReportData {
  readonly events: readonly AnalyticsReportEvent[]
  readonly sessions: readonly AnalyticsReportSession[]
}

export interface AnalyticsWindowReader {
  read(
    sql: string,
    args: readonly (string | number | boolean | null)[],
  ): Promise<readonly Record<string, DuckDBValue>[]>
}

export interface AnalyticsDb {
  ready(): Promise<boolean>
  rebuild(input: { controlDb: Db }): Promise<void>
  appendProjectedEvents(input: {
    controlDb: Db
    siteId: string
    chunkRows?: number
  }): Promise<AnalyticsProjectionAppendResult>
  deleteExpired(input: { siteId: string; occurrenceCutoff: Date }): Promise<number>
  purgeSite(input: { siteId: string }): Promise<void>
  readProjectionSnapshot(input: { siteId: string }): Promise<AnalyticsProjectionSnapshot>
  readReportData(input: {
    siteId: string
    from: Date
    toExclusive: Date
  }): Promise<AnalyticsReportData>
  readWindowed<T>(work: (reader: AnalyticsWindowReader) => Promise<T>): Promise<T>
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

  let unavailable = false
  let rebuilding = false
  let serial: Promise<void> = Promise.resolve()

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const queued = serial.then(work, work)
    serial = queued.then(
      () => undefined,
      () => undefined,
    )

    return queued
  }

  const closeController = createDuckDbCloseController({
    operations: {
      checkpoint: async () => {
        await connection.run('CHECKPOINT')
      },
      closeConnection: () => connection.closeSync(),
      closeInstance: () => instance.closeSync(),
    },
    schedule: enqueue,
  })

  const createAppendConnection = (): ProjectionAppendConnection => {
    return {
      async transaction<T>(work: (transaction: ProjectionAppendTransaction) => Promise<T>) {
        await connection.run('BEGIN TRANSACTION')

        try {
          const result = await work({
            async read(sql, args) {
              const reader = await connection.runAndReadAll(
                sql,
                args === undefined ? [] : [...args],
              )

              return reader.getRowObjects()
            },
            async run(sql, args) {
              await connection.run(sql, args === undefined ? [] : [...args])
            },
            createAppender: (table) => connection.createAppender(table),
            nextProjectionGeneration: (siteId) => nextProjectionGeneration(connection, siteId),
            writeProjectionGeneration: (siteId, generation) =>
              writeProjectionGeneration(connection, siteId, generation),
          })

          await connection.run('COMMIT')

          return result
        } catch (error) {
          await connection.run('ROLLBACK')
          throw error
        }
      },
    }
  }

  return {
    async ready(): Promise<boolean> {
      if (!closeController.isOpen() || unavailable || rebuilding) return false

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
      if (!closeController.isOpen()) throw new Error('Analytics database is closed')

      if (unavailable) throw new Error('Analytics database is unavailable')

      return enqueue(async () => {
        const checkpointReader = await connection.runAndReadAll(
          `SELECT projected_replay_sequence,
                  projected_fact_cardinality,
                  projection_generation,
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
            projectedFactCardinality:
              checkpointRow['projected_fact_cardinality'] === null ||
              checkpointRow['projected_fact_cardinality'] === undefined
                ? null
                : Number(checkpointRow['projected_fact_cardinality']),
            projectionGeneration: Number(checkpointRow['projection_generation'] ?? 0),
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
    async readReportData(input: {
      siteId: string
      from: Date
      toExclusive: Date
    }): Promise<AnalyticsReportData> {
      if (!closeController.isOpen()) throw new Error('Analytics database is closed')

      if (unavailable) throw new Error('Analytics database is unavailable')

      return enqueue(async () => {
        const sessionsReader = await connection.runAndReadAll(
          `SELECT session_id, visitor_id, identified_user_id,
                  epoch_ms(started_at) AS started_at, epoch_ms(ended_at) AS ended_at,
                  (SELECT page_path FROM events event
                   WHERE event.site_id = analytics_sessions.site_id
                     AND event.analytics_session_id = analytics_sessions.session_id
                   ORDER BY event.occurrence_time DESC, event.event_id DESC LIMIT 1) AS exit_page,
                  entry_page, referrer, utm_source, utm_medium, utm_campaign,
                  device, browser, operating_system, country, region, city
           FROM analytics_sessions
           WHERE site_id = ?
             AND (ended_at IS NULL OR ended_at >= CAST(? AS TIMESTAMP))
             AND started_at < CAST(? AS TIMESTAMP)
           ORDER BY started_at, session_id`,
          [input.siteId, timestamp(input.from.getTime()), timestamp(input.toExclusive.getTime())],
        )

        const eventsReader = await connection.runAndReadAll(
          `SELECT event_id, event_kind, epoch_ms(occurrence_time) AS occurrence_time,
                  visitor_id, identified_user_id, analytics_session_id,
                  page_path, referrer, name, destination, unit, code, properties_json
           FROM events
           WHERE site_id = ?
             AND occurrence_time >= CAST(? AS TIMESTAMP)
             AND occurrence_time < CAST(? AS TIMESTAMP)
           ORDER BY occurrence_time, event_id`,
          [input.siteId, timestamp(input.from.getTime()), timestamp(input.toExclusive.getTime())],
        )

        return {
          sessions: sessionsReader.getRowObjects().map(readReportSession),
          events: eventsReader.getRowObjects().map(readReportEvent),
        }
      })
    },
    async readWindowed<T>(work: (reader: AnalyticsWindowReader) => Promise<T>): Promise<T> {
      if (!closeController.isOpen()) throw new Error('Analytics database is closed')

      if (unavailable) throw new Error('Analytics database is unavailable')

      return enqueue(async () => {
        const reader: AnalyticsWindowReader = {
          async read(sql, args) {
            const result = await connection.runAndReadAll(sql, [...args])

            return result.getRowObjects()
          },
        }

        return work(reader)
      })
    },
    async rebuild(input: { controlDb: Db }): Promise<void> {
      if (!closeController.isOpen()) throw new Error('Analytics database is closed')

      if (unavailable) throw new Error('Analytics database is unavailable')

      if (rebuilding) throw new Error('Analytics database rebuild is already running')
      rebuilding = true

      return enqueue(async () => {
        try {
          const events = readEvents(input.controlDb)

          const properties = readProperties(
            input.controlDb,
            events.map((event) => event.eventPk),
          )

          const identities = readIdentities(input.controlDb)
          const activeSiteIds = readActiveSiteIds(input.controlDb)
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

          const previousGenerations = await readProjectionGenerations(connection)

          const projected = foldProjectedCheckpoints(
            activeSiteIds,
            projectedEvents,
            Date.now(),
            previousGenerations,
          )

          const factState = createFactFoldState()

          for (const event of projectedEvents) foldProjectedEvent(factState, event)

          await connection.run('BEGIN TRANSACTION')

          try {
            await connection.run('DELETE FROM event_properties')
            await connection.run('DELETE FROM events')
            await connection.run('DELETE FROM analytics_sessions')
            await connection.run('DELETE FROM visitors')
            await connection.run('DELETE FROM projection_checkpoints')
            await connection.run('DELETE FROM projection_gaps')

            await appendFactRows(connection, 'events', projectedEvents, (appender, events) =>
              appendEventRows(appender, events, propertiesByEvent),
            )

            await appendFactRows(
              connection,
              'visitors',
              foldVisitorRows(factState),
              appendVisitorRows,
            )

            await appendFactRows(
              connection,
              'analytics_sessions',
              foldSessionRows(factState),
              appendSessionRows,
            )

            for (const checkpoint of projected) {
              await connection.run(
                `INSERT INTO projection_checkpoints (
               site_id, projected_replay_sequence, projected_fact_cardinality, projection_generation,
               occurrence_covered_from, occurrence_covered_through, effective_retention_from,
               statistics_refreshed_at, readiness, projection_version, updated_at
             ) VALUES (?, ?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), ?, ?, CAST(? AS TIMESTAMP))`,
                [
                  checkpoint.siteId,
                  checkpoint.projectedReplaySequence,
                  checkpoint.projectedFactCardinality,
                  checkpoint.projectionGeneration,
                  timestamp(checkpoint.occurrenceCoveredFrom),
                  timestamp(checkpoint.occurrenceCoveredThrough),
                  timestamp(checkpoint.effectiveRetentionFrom),
                  timestamp(checkpoint.statisticsRefreshedAt),
                  checkpoint.readiness,
                  checkpoint.projectionVersion,
                  timestamp(checkpoint.updatedAt),
                ],
              )
              await writeProjectionGeneration(
                connection,
                checkpoint.siteId,
                checkpoint.projectionGeneration,
                checkpoint.updatedAt,
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

            await appendFactRows(connection, 'event_properties', properties, (appender, rows) =>
              appendPropertyRows(appender, rows, projectedEvents),
            )

            await connection.run('COMMIT')
          } catch (error) {
            try {
              await connection.run('ROLLBACK')
            } catch {
              unavailable = true
            }

            throw error
          }
        } finally {
          rebuilding = false
        }
      })
    },
    async appendProjectedEvents(input: {
      controlDb: Db
      siteId: string
      chunkRows?: number
    }): Promise<AnalyticsProjectionAppendResult> {
      if (!closeController.isOpen()) throw new Error('Analytics database is closed')

      if (unavailable) throw new Error('Analytics database is unavailable')

      if (rebuilding) throw new Error('Analytics database rebuild is already running')

      const appender = new AnalyticsProjectionAppender({
        connection: createAppendConnection(),
        source: {
          readEvents,
          readProperties,
          readIdentities,
        },
        chunkRows: input.chunkRows ?? DEFAULT_APPEND_CHUNK_ROWS,
      })

      return appender.append(input)
    },
    async deleteExpired(input: { siteId: string; occurrenceCutoff: Date }): Promise<number> {
      if (!closeController.isOpen()) throw new Error('Analytics database is closed')

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
          const projectionGeneration = await nextProjectionGeneration(connection, input.siteId)
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
             SET projection_generation = ?,
                 occurrence_covered_from = (
                   SELECT min(event.occurrence_time) FROM events event
                   WHERE event.site_id = checkpoint.site_id
                 ),
                 occurrence_covered_through = (
                   SELECT max(event.occurrence_time) FROM events event
                   WHERE event.site_id = checkpoint.site_id
                 ),
                 projected_fact_cardinality = (
                   SELECT count(*) FROM events event
                   WHERE event.site_id = checkpoint.site_id
                 ),
                 effective_retention_from = CAST(? AS TIMESTAMP),
                 statistics_refreshed_at = current_timestamp,
                 updated_at = current_timestamp
             WHERE checkpoint.site_id = ?`,
            [projectionGeneration, cutoff, input.siteId],
          )
          await writeProjectionGeneration(connection, input.siteId, projectionGeneration)
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
      if (!closeController.isOpen()) throw new Error('Analytics database is closed')

      if (unavailable) throw new Error('Analytics database is unavailable')

      if (rebuilding) throw new Error('Analytics database rebuild is already running')

      return enqueue(async () => {
        await connection.run('BEGIN TRANSACTION')

        try {
          const projectionGeneration = await nextProjectionGeneration(connection, input.siteId)
          await writeProjectionGeneration(connection, input.siteId, projectionGeneration)
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
      return closeController.close()
    },
  }
}

interface ProjectedCheckpointRow {
  siteId: string
  projectedReplaySequence: number
  projectedFactCardinality: number
  projectionGeneration: number
  occurrenceCoveredFrom: number | null
  occurrenceCoveredThrough: number | null
  effectiveRetentionFrom: null
  statisticsRefreshedAt: number
  readiness: string
  projectionVersion: string
  updatedAt: number
}

function foldProjectedCheckpoints(
  siteIds: readonly string[],
  events: readonly ProjectedEventRow[],
  builtAt: number,
  previousGenerations: ReadonlyMap<string, number>,
): ProjectedCheckpointRow[] {
  const bySite = new Map<
    string,
    { sequence: number; from: number | null; through: number | null }
  >()

  for (const siteId of siteIds) {
    bySite.set(siteId, { sequence: 0, from: null, through: null })
  }

  const counts = new Map<string, number>()

  for (const event of events) {
    const site = bySite.get(event.siteId)

    if (site === undefined) continue
    site.sequence = Math.max(site.sequence, event.replaySequence)
    counts.set(event.siteId, (counts.get(event.siteId) ?? 0) + 1)
    site.from =
      site.from === null ? event.occurrenceTime : Math.min(site.from, event.occurrenceTime)
    site.through =
      site.through === null ? event.occurrenceTime : Math.max(site.through, event.occurrenceTime)
  }

  return siteIds.map((siteId) => {
    const site = bySite.get(siteId)!

    return {
      siteId,
      projectedReplaySequence: site.sequence,
      projectedFactCardinality: counts.get(siteId) ?? 0,
      projectionGeneration: (previousGenerations.get(siteId) ?? 0) + 1,
      occurrenceCoveredFrom: site.from,
      occurrenceCoveredThrough: site.through,
      effectiveRetentionFrom: null,
      statisticsRefreshedAt: builtAt,
      readiness: 'ready',
      projectionVersion: ANALYTICS_PROJECTION_VERSION,
      updatedAt: builtAt,
    }
  })
}

async function readProjectionGenerations(
  connection: DuckDBConnection,
): Promise<ReadonlyMap<string, number>> {
  const reader = await connection.runAndReadAll(
    `SELECT site_id, projection_generation FROM projection_generations
     UNION ALL
     SELECT site_id, projection_generation FROM projection_checkpoints`,
  )

  const generations = new Map<string, number>()

  for (const row of reader.getRowObjects()) {
    const siteId = String(row['site_id'])
    const generation = Number(row['projection_generation'] ?? 0)
    generations.set(siteId, Math.max(generations.get(siteId) ?? 0, generation))
  }

  return generations
}

async function nextProjectionGeneration(
  connection: DuckDBConnection,
  siteId: string,
): Promise<number> {
  const reader = await connection.runAndReadAll(
    `SELECT greatest(
       coalesce((SELECT max(projection_generation) FROM projection_generations WHERE site_id = ?), 0),
       coalesce((SELECT max(projection_generation) FROM projection_checkpoints WHERE site_id = ?), 0)
     ) + 1 AS next_generation`,
    [siteId, siteId],
  )

  return Number(reader.getRowObjects()[0]?.['next_generation'] ?? 1)
}

async function writeProjectionGeneration(
  connection: DuckDBConnection,
  siteId: string,
  generation: number,
  updatedAt = Date.now(),
): Promise<void> {
  await connection.run('DELETE FROM projection_generations WHERE site_id = ?', [siteId])
  await connection.run(
    `INSERT INTO projection_generations (site_id, projection_generation, updated_at)
     VALUES (?, ?, CAST(? AS TIMESTAMP))`,
    [siteId, generation, timestamp(updatedAt)],
  )
}

/**
 * Reads a DuckDB instant selected as `epoch_ms(...)`. A naive DuckDB `TIMESTAMP` converts to a JS
 * `Date` through the host timezone, so the projection reads select epoch milliseconds and rebuild
 * the instant here instead.
 */
function readInstant(value: DuckDBValue | undefined): Date | null {
  if (value === null || value === undefined) return null

  if (value instanceof Date) return value

  if (isBigintValue(value) || isNumberValue(value)) {
    const parsed = new Date(Number(value))

    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (!isStringValue(value)) return null
  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function readRequiredInstant(value: DuckDBValue | undefined, field: string): Date {
  const instant = readInstant(value)

  if (instant === null) throw new Error(`Analytics report row has no ${field}`)

  return instant
}

function readReportSession(row: Record<string, DuckDBValue>): AnalyticsReportSession {
  return {
    sessionId: String(row['session_id']),
    visitorId: nullableString(row['visitor_id']),
    identifiedUserId: nullableString(row['identified_user_id']),
    startedAt: readRequiredInstant(row['started_at'], 'session start'),
    endedAt: readInstant(row['ended_at']),
    exitPage: nullableString(row['exit_page']),
    entryPage: nullableString(row['entry_page']),
    referrer: nullableString(row['referrer']),
    utmSource: nullableString(row['utm_source']),
    utmMedium: nullableString(row['utm_medium']),
    utmCampaign: nullableString(row['utm_campaign']),
    device: nullableString(row['device']),
    browser: nullableString(row['browser']),
    operatingSystem: nullableString(row['operating_system']),
    country: nullableString(row['country']),
    region: nullableString(row['region']),
    city: nullableString(row['city']),
  }
}

function readReportEvent(row: Record<string, DuckDBValue>): AnalyticsReportEvent {
  return {
    eventId: String(row['event_id']),
    eventKind: String(row['event_kind']),
    occurrenceTime: readRequiredInstant(row['occurrence_time'], 'event occurrence time'),
    visitorId: nullableString(row['visitor_id']),
    identifiedUserId: nullableString(row['identified_user_id']),
    sessionId: nullableString(row['analytics_session_id']),
    pagePath: nullableString(row['page_path']),
    referrer: nullableString(row['referrer']),
    name: nullableString(row['name']),
    destination: nullableString(row['destination']),
    unit: nullableString(row['unit']),
    code: nullableString(row['code']),
    properties: readReportProperties(row['properties_json']),
  }
}

function nullableString(value: DuckDBValue | undefined): string | null {
  if (value === null || value === undefined) return null

  if (isStringValue(value)) return value

  if (isNumberValue(value) || isBigintValue(value) || isBooleanValue(value)) {
    return String(value)
  }

  return null
}

function readReportProperties(value: DuckDBValue | undefined) {
  if (value === null || value === undefined) return {}
  const parsed = isStringValue(value) ? JSON.parse(value) : value

  if (!isRecord(parsed)) throw new Error('Analytics report properties are not an object')
  const properties: Record<string, AnalyticsReportScalar> = {}

  for (const [key, property] of Object.entries(parsed)) {
    if (
      property === null ||
      isStringValue(property) ||
      isBooleanValue(property) ||
      (isNumberValue(property) && Number.isFinite(property))
    ) {
      properties[key] = property
    } else {
      throw new Error('Analytics report properties contain an unsupported value')
    }
  }

  return properties
}

function readGapRows(rows: readonly Record<string, DuckDBValue>[]): AnalyticsProjectionGap[] {
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
