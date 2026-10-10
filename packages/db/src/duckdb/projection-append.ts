import type { DuckDBValue } from '@duckdb/node-api'
import type { Db } from '../client.ts'
import { ANALYTICS_PROJECTION_VERSION } from './schema.ts'
import {
  appendEventRows,
  appendFactRows,
  appendPropertyRows,
  appendSessionRows,
  appendVisitorRows,
  type FactAppender,
  type FactPropertyValue,
} from './fact-writer.ts'
import {
  createFactFoldState,
  foldProjectedEvent,
  foldSessionRows,
  foldVisitorRows,
  seedFactFoldState,
  type SessionRow,
  type VisitorRow,
} from './projection-fold.ts'
import {
  propertyValue,
  projectEventIdentity,
  type EventRow,
  type Identities,
  type ProjectedEventRow,
  type PropertyRow,
  timestamp,
} from './projection-source.ts'

export const DEFAULT_APPEND_CHUNK_ROWS = 2_500

const MIN_APPEND_CHUNK_ROWS = 2_000

const MAX_APPEND_CHUNK_ROWS = 5_000

const DERIVED_TABLE_KEYS = {
  visitors: 'visitor_id',
  analytics_sessions: 'session_id',
} as const

type DerivedTable = keyof typeof DERIVED_TABLE_KEYS

export interface ProjectionAppendTransaction {
  read(
    sql: string,
    args?: readonly (string | number)[],
  ): Promise<readonly Record<string, DuckDBValue>[]>
  run(sql: string, args?: readonly (string | number | null)[]): Promise<void>
  createAppender(table: string): Promise<FactAppender>
  nextProjectionGeneration(siteId: string): Promise<number>
  writeProjectionGeneration(siteId: string, generation: number): Promise<void>
}

export interface ProjectionAppendConnection {
  transaction<T>(work: (transaction: ProjectionAppendTransaction) => Promise<T>): Promise<T>
}

export interface ProjectionAppendSource {
  readEvents(db: Db, scope: ProjectionEventScope): readonly EventRow[]
  readProperties(db: Db, eventPks: readonly number[]): readonly PropertyRow[]
  readIdentities(db: Db): Identities
}

export interface ProjectionEventScope {
  readonly siteId?: string
  readonly afterReplaySequence?: number
  readonly limit?: number
}

export interface AnalyticsProjectionAppendResult {
  readonly appendedEventCount: number
  readonly appendedPropertyCount: number
  readonly appendedVisitorCount: number
  readonly appendedSessionCount: number
  readonly chunkCount: number
  readonly projectedReplaySequence: number
  readonly projectedFactCardinality: number
  readonly projectionGeneration: number
}

export interface AnalyticsProjectionAppendInput {
  readonly controlDb: Db
  readonly siteId: string
}

export interface AnalyticsProjectionAppenderDependencies {
  readonly connection: ProjectionAppendConnection
  readonly source: ProjectionAppendSource
  readonly chunkRows?: number
}

interface PublishedCheckpoint {
  readonly cursor: number
  readonly occurrenceCoveredFrom: number | null
  readonly occurrenceCoveredThrough: number | null
  readonly effectiveRetentionFrom: number | null
}

interface ChunkOutcome {
  readonly appendedEventCount: number
  readonly appendedPropertyCount: number
  readonly appendedVisitorCount: number
  readonly appendedSessionCount: number
  readonly projectedReplaySequence: number
  readonly projectedFactCardinality: number
  readonly projectionGeneration: number
  readonly complete: boolean
}

const EMPTY_CHECKPOINT: PublishedCheckpoint = {
  cursor: 0,
  occurrenceCoveredFrom: null,
  occurrenceCoveredThrough: null,
  effectiveRetentionFrom: null,
}

export class AnalyticsProjectionAppender {
  readonly #connection: ProjectionAppendConnection
  readonly #source: ProjectionAppendSource
  readonly #chunkRows: number

  constructor(dependencies: AnalyticsProjectionAppenderDependencies) {
    this.#connection = dependencies.connection
    this.#source = dependencies.source
    this.#chunkRows = assertChunkRows(dependencies.chunkRows ?? DEFAULT_APPEND_CHUNK_ROWS)
  }

  async append(input: AnalyticsProjectionAppendInput): Promise<AnalyticsProjectionAppendResult> {
    const totals = {
      appendedEventCount: 0,
      appendedPropertyCount: 0,
      appendedVisitorCount: 0,
      appendedSessionCount: 0,
      chunkCount: 0,
      projectedReplaySequence: 0,
      projectedFactCardinality: 0,
      projectionGeneration: 0,
    }

    let publishedCursor: number | undefined

    for (;;) {
      const chunk = await this.#connection.transaction((transaction) =>
        this.#appendChunk(input, transaction, publishedCursor),
      )

      totals.appendedEventCount += chunk.appendedEventCount
      totals.appendedPropertyCount += chunk.appendedPropertyCount
      totals.appendedVisitorCount += chunk.appendedVisitorCount
      totals.appendedSessionCount += chunk.appendedSessionCount
      totals.chunkCount += 1
      totals.projectedReplaySequence = chunk.projectedReplaySequence
      totals.projectedFactCardinality = chunk.projectedFactCardinality
      totals.projectionGeneration = chunk.projectionGeneration
      publishedCursor = chunk.projectedReplaySequence

      if (chunk.complete) return totals
    }
  }

  async #appendChunk(
    input: AnalyticsProjectionAppendInput,
    transaction: ProjectionAppendTransaction,
    expectedCursor: number | undefined,
  ): Promise<ChunkOutcome> {
    const published = await readPublishedCheckpoint(transaction, input.siteId)

    if (expectedCursor !== undefined && published.cursor < expectedCursor) {
      throw new Error(
        'Analytics projection cursor for Site ' +
          input.siteId +
          ' rewound from ' +
          expectedCursor +
          ' to ' +
          published.cursor +
          ' under the append; refusing to continue',
      )
    }

    const events = this.#source.readEvents(input.controlDb, {
      siteId: input.siteId,
      afterReplaySequence: published.cursor,
      limit: this.#chunkRows,
    })

    const identities = this.#source.readIdentities(input.controlDb)

    const properties = this.#source.readProperties(
      input.controlDb,
      events.map((event) => event.eventPk),
    )

    const projectedEvents = events
      .filter((event) => event.projectionState !== 'failed')
      .map((event) => projectEventIdentity(event, identities))

    const factState = createFactFoldState()

    await seedFactFoldState(factState, {
      siteId: input.siteId,
      visitorIds: distinctIds(projectedEvents, (event) => event.visitorId),
      sessionIds: distinctIds(projectedEvents, (event) => event.analyticsSessionId),
      read: (sql, args) => transaction.read(sql, args),
    })

    for (const event of projectedEvents) foldProjectedEvent(factState, event)

    const visitors = foldVisitorRows(factState)
    const sessions = foldSessionRows(factState)

    await appendFactRows(transaction, 'events', projectedEvents, (appender, rows) =>
      appendEventRows(appender, rows, groupProperties(properties)),
    )
    await appendFactRows(transaction, 'event_properties', properties, (appender, rows) =>
      appendPropertyRows(appender, rows, projectedEvents),
    )
    await this.#replaceDerivedFacts(transaction, input.siteId, visitors, sessions)

    const projectedReplaySequence = events.reduce(
      (highest, event) => Math.max(highest, event.replaySequence),
      published.cursor,
    )

    const factCardinality = await readFactCardinality(transaction, input.siteId)
    const projectionGeneration = await transaction.nextProjectionGeneration(input.siteId)

    await transaction.writeProjectionGeneration(input.siteId, projectionGeneration)
    await writeCheckpoint(transaction, {
      siteId: input.siteId,
      projectedReplaySequence,
      factCardinality,
      projectionGeneration,
      ...mergeOccurrenceCoverage(published, projectedEvents),
      effectiveRetentionFrom: published.effectiveRetentionFrom,
    })

    const writtenEventPks = new Set(projectedEvents.map((event) => event.eventPk))

    return {
      complete: events.length < this.#chunkRows,
      appendedEventCount: projectedEvents.length,
      appendedPropertyCount: properties.filter((property) => writtenEventPks.has(property.eventPk))
        .length,
      appendedVisitorCount: visitors.length,
      appendedSessionCount: sessions.length,
      projectedReplaySequence,
      projectedFactCardinality: factCardinality,
      projectionGeneration,
    }
  }

  async #replaceDerivedFacts(
    transaction: ProjectionAppendTransaction,
    siteId: string,
    visitors: readonly VisitorRow[],
    sessions: readonly SessionRow[],
  ): Promise<void> {
    await deleteDerivedFacts(
      transaction,
      'visitors',
      siteId,
      visitors.map((visitor) => visitor.visitorId),
    )
    await appendFactRows(transaction, 'visitors', visitors, appendVisitorRows)

    await deleteDerivedFacts(
      transaction,
      'analytics_sessions',
      siteId,
      sessions.map((session) => session.sessionId),
    )
    await appendFactRows(transaction, 'analytics_sessions', sessions, appendSessionRows)
  }
}

async function readPublishedCheckpoint(
  transaction: ProjectionAppendTransaction,
  siteId: string,
): Promise<PublishedCheckpoint> {
  const rows = await transaction.read(
    `SELECT projected_replay_sequence,
            epoch_ms(occurrence_covered_from) AS occurrence_covered_from,
            epoch_ms(occurrence_covered_through) AS occurrence_covered_through,
            epoch_ms(effective_retention_from) AS effective_retention_from
     FROM projection_checkpoints WHERE site_id = ?`,
    [siteId],
  )

  const row = rows[0]

  if (row === undefined) return EMPTY_CHECKPOINT

  return {
    cursor: Number(row['projected_replay_sequence'] ?? 0),
    occurrenceCoveredFrom: readMs(row['occurrence_covered_from']),
    occurrenceCoveredThrough: readMs(row['occurrence_covered_through']),
    effectiveRetentionFrom: readMs(row['effective_retention_from']),
  }
}

async function readFactCardinality(
  transaction: ProjectionAppendTransaction,
  siteId: string,
): Promise<number> {
  const rows = await transaction.read(
    'SELECT count(*) AS fact_cardinality FROM events WHERE site_id = ?',
    [siteId],
  )

  return Number(rows[0]?.['fact_cardinality'] ?? 0)
}

async function writeCheckpoint(
  transaction: ProjectionAppendTransaction,
  input: {
    readonly siteId: string
    readonly projectedReplaySequence: number
    readonly factCardinality: number
    readonly projectionGeneration: number
    readonly occurrenceCoveredFrom: number | null
    readonly occurrenceCoveredThrough: number | null
    readonly effectiveRetentionFrom: number | null
  },
): Promise<void> {
  await transaction.run('DELETE FROM projection_checkpoints WHERE site_id = ?', [input.siteId])
  await transaction.run(
    `INSERT INTO projection_checkpoints (
       site_id, projected_replay_sequence, projected_fact_cardinality, projection_generation,
       occurrence_covered_from, occurrence_covered_through, effective_retention_from,
       statistics_refreshed_at, readiness, projection_version, updated_at
     ) VALUES (?, ?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP),
               current_timestamp, ?, ?, current_timestamp)`,
    [
      input.siteId,
      input.projectedReplaySequence,
      input.factCardinality,
      input.projectionGeneration,
      timestamp(input.occurrenceCoveredFrom),
      timestamp(input.occurrenceCoveredThrough),
      timestamp(input.effectiveRetentionFrom),
      'ready',
      ANALYTICS_PROJECTION_VERSION,
    ],
  )
}

async function deleteDerivedFacts(
  transaction: ProjectionAppendTransaction,
  table: DerivedTable,
  siteId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return

  await transaction.run(
    'DELETE FROM ' +
      table +
      ' WHERE site_id = ? AND ' +
      DERIVED_TABLE_KEYS[table] +
      ' IN (' +
      placeholders(ids.length) +
      ')',
    [siteId, ...ids],
  )
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

function groupProperties(
  properties: readonly PropertyRow[],
): Map<number, Record<string, FactPropertyValue>> {
  const byEvent = new Map<number, Record<string, FactPropertyValue>>()

  for (const property of properties) {
    const eventProperties = byEvent.get(property.eventPk) ?? {}
    eventProperties[property.propertyKey] = propertyValue(property)
    byEvent.set(property.eventPk, eventProperties)
  }

  return byEvent
}

function distinctIds(
  events: readonly ProjectedEventRow[],
  select: (event: ProjectedEventRow) => string | null,
): string[] {
  const ids = new Set<string>()

  for (const event of events) {
    const id = select(event)

    if (id !== null) ids.add(id)
  }

  return [...ids]
}

interface OccurrenceCoverage {
  readonly occurrenceCoveredFrom: number | null
  readonly occurrenceCoveredThrough: number | null
}

function mergeOccurrenceCoverage(
  published: PublishedCheckpoint,
  events: readonly ProjectedEventRow[],
): OccurrenceCoverage {
  let from = published.occurrenceCoveredFrom
  let through = published.occurrenceCoveredThrough

  for (const event of events) {
    from = from === null ? event.occurrenceTime : Math.min(from, event.occurrenceTime)
    through = through === null ? event.occurrenceTime : Math.max(through, event.occurrenceTime)
  }

  return { occurrenceCoveredFrom: from, occurrenceCoveredThrough: through }
}

function readMs(value: DuckDBValue | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function assertChunkRows(chunkRows: number): number {
  if (
    !Number.isInteger(chunkRows) ||
    chunkRows < MIN_APPEND_CHUNK_ROWS ||
    chunkRows > MAX_APPEND_CHUNK_ROWS
  ) {
    throw new Error(
      'Analytics append chunkRows must be between ' +
        MIN_APPEND_CHUNK_ROWS +
        ' and ' +
        MAX_APPEND_CHUNK_ROWS +
        ', received ' +
        chunkRows,
    )
  }

  return chunkRows
}
