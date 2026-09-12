import {
  createInstantMs,
  type BreakdownSort,
  type EventBreakdownField,
  type EventBreakdownQuery,
  type EventBreakdownResult,
  type EventBreakdownRowFacts,
  type EventBucketFacts,
  type EventBucketsQuery,
  type EventKind,
  type EventOverviewFacts,
  type EventOverviewQuery,
  type EventRowFacts,
  type EventRowsQuery,
  type EventRowsResult,
  type Predicate,
  type PredicateOperator,
  type PredicateValue,
  type PresencePredicate,
  type ReportFilterPlan,
  type ReportingQueryPort,
  type TrafficAggregateQuery,
  type TrafficAggregateResult,
  type TrafficBreakdownDimension,
  type TrafficBreakdownQuery,
  type TrafficBreakdownResult,
  type TrafficBreakdownRowFacts,
  type TrafficMetricsFacts,
  type TrafficTrendBucket,
} from '@cimi/kernel'
import type { AnalyticsDb, AnalyticsWindowReader } from './index.ts'

export interface DuckDbReportingQueryDependencies {
  readonly analytics: AnalyticsDb
}

type BoundValue = string | number | boolean | null

interface RenderedFragment {
  readonly sql: string
  readonly args: readonly BoundValue[]
}

const EVENT_COLUMNS: Readonly<Record<string, string>> = {
  'event.kind': 'e.event_kind',
  'event.name': 'e.name',
  'event.pagePath': 'e.page_path',
  'event.referrer': 'e.referrer',
  'event.destination': 'e.destination',
  'event.unit': 'e.unit',
  'event.code': 'e.code',
}

const SESSION_COLUMNS: Readonly<Record<string, string>> = {
  'session.device': 'device',
  'session.browser': 'browser',
  'session.os': 'operating_system',
  'session.country': 'country',
  'session.region': 'region',
  'session.city': 'city',
  'session.entryPage': 'entry_page',
  'session.utmSource': 'utm_source',
  'session.utmMedium': 'utm_medium',
  'session.utmCampaign': 'utm_campaign',
}

const IDENTITY_KIND_TO_STORE: Readonly<Record<string, string>> = {
  visitor: 'anonymous',
  identified_user: 'identified',
}

const BREAKDOWN_VALUE_MAX_LENGTH = 2048

const EVENT_BREAKDOWN_COLUMNS: Readonly<Record<EventBreakdownField, string>> = {
  kind: 'e.event_kind',
  name: 'e.name',
  pagePath: 'e.page_path',
  referrer: 'e.referrer',
  destination: 'e.destination',
  unit: 'e.unit',
  code: 'e.code',
}

const EVENT_FIELD_MAX_LENGTHS = {
  pagePath: 2048,
  referrer: 2048,
  destination: 2048,
  message: 512,
  code: 128,
  unit: 64,
} as const

const EVENT_PROPERTIES_MAX_KEYS = 64

const BREAKDOWN_SESSION_COLUMNS: Partial<Record<TrafficBreakdownDimension, string>> = {
  entry_page: 'entry_page',
  referrer: 'referrer',
  device: 'device',
  browser: 'browser',
  os: 'operating_system',
  country: 'country',
  region: 'region',
  city: 'city',
}

export class DuckDbReportingQuery implements ReportingQueryPort {
  constructor(private readonly deps: DuckDbReportingQueryDependencies) {}

  async trafficAggregate(query: TrafficAggregateQuery): Promise<TrafficAggregateResult> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const predicate = renderFilterPlan(query.filterPlan)
      const args: BoundValue[] = [
        query.siteId,
        timestamp(query.period.interval.start),
        timestamp(query.period.interval.endExclusive),
        ...predicate.args,
      ]
      const metrics = await this.readMetrics(reader, predicate.sql, args)
      const trend = query.includeTrend
        ? await this.readTrend(reader, query, predicate.sql, predicate.args)
        : []
      return { metrics, trend }
    })
  }

  async trafficBreakdown(query: TrafficBreakdownQuery): Promise<TrafficBreakdownResult> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const predicate = renderFilterPlan(query.filterPlan)
      const denominator = await this.readFilteredSessionCount(reader, query, predicate)
      if (query.dimension === 'exit_page') {
        return { rows: [], totalCount: 0, denominator, hasMore: false, nextOffset: null }
      }

      const totalCount = await this.readBreakdownGroupCount(reader, query, predicate)
      const rows = await this.readBreakdownRows(reader, query, predicate)
      const hasMore = query.offset + query.limit < totalCount
      return {
        rows,
        totalCount,
        denominator,
        hasMore,
        nextOffset: hasMore ? query.offset + query.limit : null,
      }
    })
  }

  async eventOverview(query: EventOverviewQuery): Promise<EventOverviewFacts> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const predicate = renderFilterPlan(query.filterPlan)
      const sql = `WITH windowed AS (
  SELECT e.visitor_id AS visitor_id,
         e.analytics_session_id AS session_id
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)
    AND e.event_kind = ?${predicate.sql}
)
SELECT count(*) AS total,
       count(DISTINCT visitor_id) AS unique_visitors,
       count(DISTINCT session_id) AS unique_sessions
FROM windowed`
      const rows = await reader.read(sql, [
        query.siteId,
        timestamp(query.period.interval.start),
        timestamp(query.period.interval.endExclusive),
        query.eventKind,
        ...predicate.args,
      ])
      const row = rows[0] ?? {}
      return {
        total: readCount(row['total']),
        uniqueVisitors: readCount(row['unique_visitors']),
        uniqueSessions: readCount(row['unique_sessions']),
      }
    })
  }

  async eventBuckets(query: EventBucketsQuery): Promise<readonly EventBucketFacts[]> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const starts = query.period.bucketStarts
      if (starts === null || starts.length === 0) return []

      const predicate = renderFilterPlan(query.filterPlan)
      const bucketArgs: BoundValue[] = []
      const rows: string[] = []
      for (let index = 0; index < starts.length; index += 1) {
        const bucket = starts[index]!
        const end = starts[index + 1]?.at ?? query.period.interval.endExclusive
        rows.push('(CAST(? AS BIGINT), CAST(? AS BIGINT), CAST(? AS BIGINT))')
        bucketArgs.push(index, bucket.at, end)
      }

      const sql = `WITH windowed AS (
  SELECT epoch_ms(e.occurrence_time) AS occurrence_ms
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)
    AND e.event_kind = ?${predicate.sql}
),
buckets(bucket_index, start_ms, end_ms) AS (
  VALUES ${rows.join(', ')}
)
SELECT buckets.bucket_index AS bucket_index,
       count(*) AS event_count
FROM buckets
JOIN windowed
  ON windowed.occurrence_ms >= buckets.start_ms
 AND windowed.occurrence_ms < buckets.end_ms
GROUP BY buckets.bucket_index
ORDER BY buckets.bucket_index`
      const result = await reader.read(sql, [
        query.siteId,
        timestamp(query.period.interval.start),
        timestamp(query.period.interval.endExclusive),
        query.eventKind,
        ...predicate.args,
        ...bucketArgs,
      ])
      const facts: EventBucketFacts[] = []
      for (const row of result) {
        const index = Number(row['bucket_index'] ?? -1)
        const bucket = starts[index]
        if (bucket === undefined) continue
        facts.push({ at: createInstantMs(bucket.at), count: readCount(row['event_count']) })
      }
      return facts
    })
  }

  async eventRows(query: EventRowsQuery): Promise<EventRowsResult> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const predicate = renderFilterPlan(query.filterPlan)
      const totalCount = await this.readEventRowCount(reader, query, predicate)
      const rows = await this.readEventRowPage(reader, query, predicate)
      const hasMore = query.offset + query.limit < totalCount
      return {
        rows,
        totalCount,
        hasMore,
        nextOffset: hasMore ? query.offset + query.limit : null,
      }
    })
  }

  async eventBreakdown(query: EventBreakdownQuery): Promise<EventBreakdownResult> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const predicate = renderFilterPlan(query.filterPlan)
      const totalCount = await this.readEventBreakdownCount(reader, query, predicate)
      const rows = await this.readEventBreakdownRows(reader, query, predicate)
      const hasMore = query.offset + query.limit < totalCount
      return {
        rows,
        totalCount,
        hasMore,
        nextOffset: hasMore ? query.offset + query.limit : null,
      }
    })
  }

  private async readEventRowCount(
    reader: AnalyticsWindowReader,
    query: EventRowsQuery,
    predicate: RenderedFragment,
  ): Promise<number> {
    const sql = `WITH windowed AS (
  SELECT e.event_id AS event_id
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)
    AND e.event_kind = ?${predicate.sql}
)
SELECT count(DISTINCT event_id) AS total_count
FROM windowed`
    const rows = await reader.read(sql, [
      query.siteId,
      timestamp(query.period.interval.start),
      timestamp(query.period.interval.endExclusive),
      query.eventKind,
      ...predicate.args,
    ])
    return readCount(rows[0]?.['total_count'])
  }

  private async readEventRowPage(
    reader: AnalyticsWindowReader,
    query: EventRowsQuery,
    predicate: RenderedFragment,
  ): Promise<readonly EventRowFacts[]> {
    const direction = query.direction === 'desc' ? 'DESC' : 'ASC'
    const sql = `WITH windowed AS (
  SELECT e.site_id AS site_id,
         e.event_id AS event_id,
         e.event_kind AS event_kind,
         epoch_ms(e.occurrence_time) AS occurrence_ms,
         epoch_ms(e.receipt_time) AS receipt_ms,
         e.page_path AS page_path,
         e.referrer AS referrer,
         e.name AS name,
         e.destination AS destination,
         e.value AS value,
         e.unit AS unit,
         e.code AS code,
         e.message AS message,
         e.replay_sequence AS replay_sequence,
         row_number() OVER (
           PARTITION BY e.site_id, e.event_id ORDER BY e.replay_sequence DESC
         ) AS replay_rank
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)
    AND e.event_kind = ?${predicate.sql}
),
deduplicated AS (
  SELECT site_id, event_id, event_kind, occurrence_ms, receipt_ms, page_path, referrer,
         name, destination, value, unit, code, message
  FROM windowed
  WHERE replay_rank = 1
)
SELECT event_id, event_kind, occurrence_ms, receipt_ms, page_path, referrer,
       name, destination, value, unit, code, message
FROM deduplicated
ORDER BY occurrence_ms ${direction}, event_id ASC
LIMIT CAST(? AS BIGINT) OFFSET CAST(? AS BIGINT)`
    const rows = await reader.read(sql, [
      query.siteId,
      timestamp(query.period.interval.start),
      timestamp(query.period.interval.endExclusive),
      query.eventKind,
      ...predicate.args,
      query.limit,
      query.offset,
    ])
    const facts: EventRowFacts[] = []
    for (const row of rows) {
      const eventId = readString(row['event_id'])
      const kind = readEventKind(row['event_kind'])
      if (eventId === null || kind === null) continue
      facts.push({
        eventId,
        kind,
        occurredAt: createInstantMs(readInstantValue(row['occurrence_ms'], 'occurrence_time')),
        createdAt: createInstantMs(readInstantValue(row['receipt_ms'], 'receipt_time')),
        pagePath: clampNullableString(row['page_path'], EVENT_FIELD_MAX_LENGTHS.pagePath),
        referrer: clampNullableString(row['referrer'], EVENT_FIELD_MAX_LENGTHS.referrer),
        name: readNullableString(row['name']),
        destination: clampNullableString(row['destination'], EVENT_FIELD_MAX_LENGTHS.destination),
        value: readNullableNumber(row['value']),
        unit: clampNullableString(row['unit'], EVENT_FIELD_MAX_LENGTHS.unit),
        code: clampNullableString(row['code'], EVENT_FIELD_MAX_LENGTHS.code),
        message: clampNullableString(row['message'], EVENT_FIELD_MAX_LENGTHS.message),
        properties: await this.readEventProperties(reader, query.siteId, eventId),
      })
    }
    return facts
  }

  private async readEventProperties(
    reader: AnalyticsWindowReader,
    siteId: string,
    eventId: string,
  ): Promise<Readonly<Record<string, string | number | boolean | null>> | null> {
    const sql = `SELECT property_key, value_type, string_value, number_value, boolean_value
FROM event_properties
WHERE site_id = ? AND event_id = ?
ORDER BY property_key
LIMIT ${EVENT_PROPERTIES_MAX_KEYS}`
    const rows = await reader.read(sql, [siteId, eventId])
    if (rows.length === 0) return null
    const properties: Record<string, string | number | boolean | null> = {}
    for (const row of rows) {
      const key = readString(row['property_key'])
      if (key === null) continue
      properties[key] = readPropertyValue(row)
    }
    return Object.keys(properties).length === 0 ? null : properties
  }

  private async readEventBreakdownCount(
    reader: AnalyticsWindowReader,
    query: EventBreakdownQuery,
    predicate: RenderedFragment,
  ): Promise<number> {
    const value = eventBreakdownValueExpression(query.field)
    const sql = `WITH windowed AS (
  SELECT ${value} AS value
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)
    AND e.event_kind = ?${predicate.sql}
)
SELECT count(DISTINCT value) AS total_count
FROM windowed
WHERE value IS NOT NULL AND trim(value) <> ''`
    const rows = await reader.read(sql, [
      query.siteId,
      timestamp(query.period.interval.start),
      timestamp(query.period.interval.endExclusive),
      query.eventKind,
      ...predicate.args,
    ])
    return readCount(rows[0]?.['total_count'])
  }

  private async readEventBreakdownRows(
    reader: AnalyticsWindowReader,
    query: EventBreakdownQuery,
    predicate: RenderedFragment,
  ): Promise<readonly EventBreakdownRowFacts[]> {
    const value = eventBreakdownValueExpression(query.field)
    const direction = query.direction === 'desc' ? 'DESC' : 'ASC'
    const order = query.sort === 'count' ? `event_count ${direction}` : `value ${direction}`
    const sql = `WITH windowed AS (
  SELECT ${value} AS value
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)
    AND e.event_kind = ?${predicate.sql}
)
SELECT value, count(*) AS event_count
FROM windowed
WHERE value IS NOT NULL AND trim(value) <> ''
GROUP BY value
ORDER BY ${order}, value ASC
LIMIT CAST(? AS BIGINT) OFFSET CAST(? AS BIGINT)`
    const rows = await reader.read(sql, [
      query.siteId,
      timestamp(query.period.interval.start),
      timestamp(query.period.interval.endExclusive),
      query.eventKind,
      ...predicate.args,
      query.limit,
      query.offset,
    ])
    const facts: EventBreakdownRowFacts[] = []
    for (const row of rows) {
      const raw = readString(row['value'])
      if (raw === null || raw.length === 0) continue
      facts.push({ value: clampValue(raw), count: readCount(row['event_count']) })
    }
    return facts
  }

  private async readFilteredSessionCount(
    reader: AnalyticsWindowReader,
    query: TrafficBreakdownQuery,
    predicate: RenderedFragment,
  ): Promise<number> {
    const sql = `WITH windowed AS (
  SELECT e.analytics_session_id AS session_id
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)${predicate.sql}
)
SELECT count(DISTINCT session_id) AS denominator
FROM windowed
WHERE session_id IS NOT NULL`
    const rows = await reader.read(sql, [
      query.siteId,
      timestamp(query.period.interval.start),
      timestamp(query.period.interval.endExclusive),
      ...predicate.args,
    ])
    return readCount(rows[0]?.['denominator'])
  }

  private async readBreakdownGroupCount(
    reader: AnalyticsWindowReader,
    query: TrafficBreakdownQuery,
    predicate: RenderedFragment,
  ): Promise<number> {
    const grouped = breakdownGroupCte(query.dimension)
    const sql = `WITH ${sessionScopeCte(predicate.sql)},
${grouped.cte}
SELECT count(DISTINCT value) AS total_count
FROM breakdown_values`
    const rows = await reader.read(sql, [
      query.siteId,
      timestamp(query.period.interval.start),
      timestamp(query.period.interval.endExclusive),
      ...predicate.args,
      ...breakdownJoinArgs(query.dimension, query.siteId),
    ])
    return readCount(rows[0]?.['total_count'])
  }

  private async readBreakdownRows(
    reader: AnalyticsWindowReader,
    query: TrafficBreakdownQuery,
    predicate: RenderedFragment,
  ): Promise<readonly TrafficBreakdownRowFacts[]> {
    const grouped = breakdownGroupCte(query.dimension)
    const order = breakdownOrderSql(query.sort, query.direction)
    const sql = `WITH ${sessionScopeCte(predicate.sql)},
${grouped.cte}
SELECT value,
       count(DISTINCT session_id) AS session_count
FROM breakdown_values
GROUP BY value
ORDER BY ${order}, value ASC
LIMIT CAST(? AS BIGINT) OFFSET CAST(? AS BIGINT)`
    const rows = await reader.read(sql, [
      query.siteId,
      timestamp(query.period.interval.start),
      timestamp(query.period.interval.endExclusive),
      ...predicate.args,
      ...breakdownJoinArgs(query.dimension, query.siteId),
      query.limit,
      query.offset,
    ])
    const facts: TrafficBreakdownRowFacts[] = []
    for (const row of rows) {
      const raw = row['value']
      if (typeof raw !== 'string' || raw.length === 0) continue
      facts.push({ value: clampValue(raw), count: readCount(row['session_count']) })
    }
    return facts
  }

  private async readMetrics(
    reader: AnalyticsWindowReader,
    predicateSql: string,
    args: readonly BoundValue[],
  ): Promise<TrafficMetricsFacts> {
    const sql = `WITH windowed AS (
  SELECT e.analytics_session_id AS session_id,
         e.visitor_id AS visitor_id,
         e.event_kind AS event_kind,
         epoch_ms(e.occurrence_time) AS occurrence_ms
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)${predicateSql}
),
session_stats AS (
  SELECT session_id,
         count(*) AS event_count,
         sum(CASE WHEN event_kind = 'page_view' THEN 1 ELSE 0 END) AS page_view_count,
         sum(CASE WHEN event_kind = 'custom_event' THEN 1 ELSE 0 END) AS custom_event_count,
         sum(CASE WHEN event_kind = 'outbound' THEN 1 ELSE 0 END) AS outbound_count,
         max(occurrence_ms) AS max_ms,
         min(occurrence_ms) AS min_ms
  FROM windowed
  WHERE session_id IS NOT NULL
  GROUP BY session_id
)
SELECT
  (SELECT count(*) FROM windowed WHERE event_kind = 'page_view') AS pageviews,
  (SELECT count(DISTINCT visitor_id) FROM windowed) AS visitors,
  (SELECT count(DISTINCT session_id) FROM windowed) AS sessions,
  (SELECT count(*) FROM session_stats WHERE page_view_count >= 1) AS eligible_sessions,
  (SELECT count(*) FROM session_stats WHERE event_count >= 2) AS sessions_with_valid_duration,
  (SELECT coalesce(sum(max_ms - min_ms), 0) FROM session_stats WHERE event_count >= 2)
    AS total_session_duration_ms,
  (SELECT count(*) FROM session_stats
     WHERE page_view_count = 1 AND custom_event_count = 0 AND outbound_count = 0
       AND (max_ms - min_ms) < 10000) AS bounced_sessions`
    const rows = await reader.read(sql, args)
    const row = rows[0] ?? {}
    return {
      visitors: readCount(row['visitors']),
      sessions: readCount(row['sessions']),
      pageviews: readCount(row['pageviews']),
      eligibleSessions: readCount(row['eligible_sessions']),
      sessionsWithValidDuration: readCount(row['sessions_with_valid_duration']),
      bouncedSessions: readCount(row['bounced_sessions']),
      totalSessionDurationMs: readCount(row['total_session_duration_ms']),
    }
  }

  private async readTrend(
    reader: AnalyticsWindowReader,
    query: TrafficAggregateQuery,
    predicateSql: string,
    predicateArgs: readonly BoundValue[],
  ): Promise<readonly TrafficTrendBucket[]> {
    const starts = query.period.bucketStarts
    if (starts === null || starts.length === 0) return []

    const bucketArgs: BoundValue[] = []
    const rows: string[] = []
    for (let index = 0; index < starts.length; index += 1) {
      const bucket = starts[index]!
      const end = starts[index + 1]?.at ?? query.period.interval.endExclusive
      rows.push('(CAST(? AS BIGINT), CAST(? AS BIGINT), CAST(? AS BIGINT))')
      bucketArgs.push(index, bucket.at, end)
    }

    const sql = `WITH windowed AS (
  SELECT e.visitor_id AS visitor_id,
         epoch_ms(e.occurrence_time) AS occurrence_ms
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)${predicateSql}
),
buckets(bucket_index, start_ms, end_ms) AS (
  VALUES ${rows.join(', ')}
)
SELECT buckets.bucket_index AS bucket_index,
       count(DISTINCT windowed.visitor_id) AS visitors
FROM buckets
JOIN windowed
  ON windowed.occurrence_ms >= buckets.start_ms
 AND windowed.occurrence_ms < buckets.end_ms
GROUP BY buckets.bucket_index
ORDER BY buckets.bucket_index`
    const args: BoundValue[] = [
      query.siteId,
      timestamp(query.period.interval.start),
      timestamp(query.period.interval.endExclusive),
      ...predicateArgs,
      ...bucketArgs,
    ]
    const result = await reader.read(sql, args)
    const buckets: TrafficTrendBucket[] = []
    for (const row of result) {
      const index = Number(row['bucket_index'] ?? -1)
      const bucket = starts[index]
      if (bucket === undefined) continue
      buckets.push({ at: createInstantMs(bucket.at), visitors: readCount(row['visitors']) })
    }
    return buckets
  }
}

function readCount(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampValue(value: string): string {
  return value.length > BREAKDOWN_VALUE_MAX_LENGTH
    ? value.slice(0, BREAKDOWN_VALUE_MAX_LENGTH)
    : value
}

const EVENT_KINDS: readonly EventKind[] = [
  'page_view',
  'custom_event',
  'outbound',
  'performance',
  'error',
]

function eventBreakdownValueExpression(field: EventBreakdownField): string {
  const column = EVENT_BREAKDOWN_COLUMNS[field]
  if (column === undefined) {
    throw new Error(`Unsupported event breakdown field '${field}'`)
  }
  return column
}

function readEventKind(value: unknown): EventKind | null {
  return typeof value === 'string' && (EVENT_KINDS as readonly string[]).includes(value)
    ? (value as EventKind)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function clampNullableString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * `epoch_ms` projects a TIMESTAMP as a millisecond number. Anything else is a corrupt row rather
 * than an instant, so it fails loudly instead of becoming an epoch value.
 */
function readInstantValue(value: unknown, column: string): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  throw new Error(`Expected a numeric ${column} from the events projection`)
}

function readPropertyValue(row: Record<string, unknown>): string | number | boolean | null {
  const type = readString(row['value_type'])
  if (type === 'number') return readNullableNumber(row['number_value']) ?? 0
  if (type === 'boolean') return Boolean(row['boolean_value'])
  if (type === 'null') return null
  return readString(row['string_value'])
}

/**
 * The windowed-session scan shared by every breakdown leg. `page` partitions over the page_view
 * paths the session saw, everything else partitions over one `analytics_sessions` attribution
 * column, so the CTE keeps the filtered session ids and projects the per-dimension value source.
 */
function sessionScopeCte(predicateSql: string): string {
  return `windowed AS (
  SELECT e.analytics_session_id AS session_id,
         e.event_kind AS event_kind,
         e.page_path AS page_path
  FROM events e
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)${predicateSql}
)`
}

interface BreakdownGroupCte {
  readonly cte: string
}

function breakdownGroupCte(dimension: TrafficBreakdownDimension): BreakdownGroupCte {
  if (dimension === 'page') {
    return {
      cte: `breakdown_values AS (
  SELECT DISTINCT windowed.session_id AS session_id, trim(windowed.page_path) AS value
  FROM windowed
  WHERE windowed.event_kind = 'page_view'
    AND windowed.session_id IS NOT NULL
    AND windowed.page_path IS NOT NULL
    AND trim(windowed.page_path) <> ''
)`,
    }
  }

  const value = breakdownSessionValueExpression(dimension)
  return {
    cte: `breakdown_values AS (
  SELECT windowed.session_id AS session_id, ${value} AS value
  FROM (SELECT DISTINCT session_id FROM windowed WHERE session_id IS NOT NULL) windowed
  JOIN analytics_sessions session
    ON session.site_id = ? AND session.session_id = windowed.session_id
  WHERE ${value} IS NOT NULL
)`,
  }
}

function breakdownSessionValueExpression(dimension: TrafficBreakdownDimension): string {
  if (dimension === 'utm') {
    return "NULLIF(concat_ws(' / ', NULLIF(trim(session.utm_source), ''), NULLIF(trim(session.utm_medium), ''), NULLIF(trim(session.utm_campaign), '')), '')"
  }
  const column = BREAKDOWN_SESSION_COLUMNS[dimension]
  if (column === undefined) {
    throw new Error(`Unsupported traffic breakdown dimension '${dimension}'`)
  }
  return `session.${column}`
}

function breakdownOrderSql(sort: BreakdownSort, direction: 'asc' | 'desc'): string {
  const order = direction === 'desc' ? 'DESC' : 'ASC'
  if (sort === 'value') return `value ${order}`
  return `count(DISTINCT session_id) ${order}`
}

function breakdownJoinArgs(dimension: TrafficBreakdownDimension, siteId: string): BoundValue[] {
  return dimension === 'page' ? [] : [siteId]
}

/** DuckDB cannot cast a bound BIGINT to TIMESTAMP, so instants bind as ISO strings. */
function timestamp(instant: number): string {
  return new Date(instant).toISOString()
}

/**
 * Renders the plan into SQL appended to the `events AS e` filter. Each fragment is introduced with
 * ` AND (...)`. Property, session, visitor, and presence predicates correlate on `e`, so they stay
 * inside the same windowed scan and share the caller's bound arguments.
 */
function renderFilterPlan(plan: ReportFilterPlan): RenderedFragment {
  const fragments: string[] = []
  const args: BoundValue[] = []

  for (const predicate of plan.event) {
    const rendered = renderEventPredicate(predicate)
    fragments.push(` AND (${rendered.sql})`)
    args.push(...rendered.args)
  }
  for (const predicate of plan.session) {
    const rendered = renderSessionPredicate(predicate)
    fragments.push(` AND (${rendered.sql})`)
    args.push(...rendered.args)
  }
  for (const predicate of plan.visitor) {
    const rendered = renderVisitorPredicate(predicate)
    fragments.push(` AND (${rendered.sql})`)
    args.push(...rendered.args)
  }
  for (const presence of plan.sessionPresence) {
    const rendered = renderPresencePredicate(presence)
    fragments.push(` AND (${rendered.sql})`)
    args.push(...rendered.args)
  }
  for (const predicate of plan.profile) {
    throw new Error(
      `Reporting profile filter '${predicate.propertyKey ?? ''}' requires the profile join, which is not implemented`,
    )
  }

  return { sql: fragments.join(''), args }
}

function renderEventPredicate(predicate: Predicate): RenderedFragment {
  if (predicate.target === 'event.property') {
    return renderPropertyExists(predicate)
  }
  if (predicate.target === 'profile.trait') {
    throw new Error(
      `Reporting profile filter '${predicate.propertyKey ?? ''}' requires the profile join, which is not implemented`,
    )
  }
  const column = EVENT_COLUMNS[predicate.target]
  if (column === undefined) {
    throw new Error(`Unsupported reporting event filter target '${predicate.target}'`)
  }
  return renderColumnComparison(column, predicate.operator, predicate.bind)
}

function renderSessionPredicate(predicate: Predicate): RenderedFragment {
  if (predicate.target === 'session.exitPage') {
    throw new Error(
      'Reporting session.exitPage filter is not supported: analytics_sessions stores no exit page',
    )
  }
  const column = SESSION_COLUMNS[predicate.target]
  if (column === undefined) {
    throw new Error(`Unsupported reporting session filter target '${predicate.target}'`)
  }
  const comparison = renderColumnComparison(`session.${column}`, predicate.operator, predicate.bind)
  return {
    sql: `EXISTS (SELECT 1 FROM analytics_sessions session
       WHERE session.site_id = e.site_id AND session.session_id = e.analytics_session_id
         AND ${comparison.sql})`,
    args: comparison.args,
  }
}

function renderVisitorPredicate(predicate: Predicate): RenderedFragment {
  if (predicate.target !== 'visitor.identityKind') {
    throw new Error(`Unsupported reporting visitor filter target '${predicate.target}'`)
  }
  const values = predicate.bind.map((value) =>
    typeof value === 'string' ? (IDENTITY_KIND_TO_STORE[value] ?? value) : value,
  )
  const comparison = renderColumnComparison('visitor.identity_kind', predicate.operator, values)
  return {
    sql: `EXISTS (SELECT 1 FROM visitors visitor
       WHERE visitor.site_id = e.site_id AND visitor.visitor_id = e.visitor_id
         AND ${comparison.sql})`,
    args: comparison.args,
  }
}

function renderPropertyExists(predicate: Predicate): RenderedFragment {
  const key = predicate.propertyKey ?? ''
  if (predicate.operator === 'contains') {
    const args: BoundValue[] = [key]
    const parts: string[] = []
    for (const value of predicate.bind) {
      if (typeof value !== 'string') {
        throw new Error('Reporting property contains filter requires string values')
      }
      parts.push("property.string_value LIKE ? ESCAPE '\\'")
      args.push(`%${escapeLike(value)}%`)
    }
    return {
      sql: `EXISTS (SELECT 1 FROM event_properties property
         WHERE property.site_id = e.site_id AND property.event_id = e.event_id
           AND property.property_key = ? AND (${parts.join(' OR ')}))`,
      args,
    }
  }
  const args: BoundValue[] = [key]
  const comparison = renderPropertyComparison(predicate, args)
  return {
    sql: `EXISTS (SELECT 1 FROM event_properties property
       WHERE property.site_id = e.site_id AND property.event_id = e.event_id
         AND property.property_key = ? AND (${comparison}))`,
    args,
  }
}

function renderPropertyComparison(predicate: Predicate, args: BoundValue[]): string {
  const parts: string[] = []
  for (const value of predicate.bind) {
    if (value === null) {
      parts.push(
        predicate.operator === 'neq'
          ? "property.value_type <> 'null'"
          : "property.value_type = 'null'",
      )
      continue
    }
    if (typeof value === 'number') {
      parts.push(`property.number_value ${operatorSql(predicate.operator)} ?`)
      args.push(value)
      continue
    }
    if (typeof value === 'boolean') {
      parts.push(`property.boolean_value ${operatorSql(predicate.operator)} ?`)
      args.push(value)
      continue
    }
    parts.push(`property.string_value ${operatorSql(predicate.operator)} ?`)
    args.push(value)
  }
  return parts.join(' OR ')
}

function renderPresencePredicate(presence: PresencePredicate): RenderedFragment {
  const args: BoundValue[] = [presence.action]
  const conditions = ['present.event_kind = ?']
  if (presence.name !== null) {
    conditions.push('present.name = ?')
    args.push(presence.name)
  }
  for (const property of presence.propertyFilters) {
    const comparison = renderPropertyFilterComparison(property.operator, property.bind)
    args.push(property.key, ...comparison.args)
    conditions.push(
      `EXISTS (SELECT 1 FROM event_properties property
         WHERE property.site_id = present.site_id AND property.event_id = present.event_id
           AND property.property_key = ? AND (${comparison.sql}))`,
    )
  }
  const inner = `SELECT 1 FROM events present
     WHERE present.site_id = e.site_id
       AND present.analytics_session_id = e.analytics_session_id
       AND ${conditions.join(' AND ')}`
  return {
    sql: presence.negated ? `NOT EXISTS (${inner})` : `EXISTS (${inner})`,
    args,
  }
}

function renderPropertyFilterComparison(
  operator: PredicateOperator,
  bind: readonly PredicateValue[],
): RenderedFragment {
  const parts: string[] = []
  const args: BoundValue[] = []
  for (const value of bind) {
    if (value === null) {
      parts.push(
        operator === 'neq' ? "property.value_type <> 'null'" : "property.value_type = 'null'",
      )
    } else if (typeof value === 'number') {
      parts.push(`property.number_value ${operatorSql(operator)} ?`)
      args.push(value)
    } else if (typeof value === 'boolean') {
      parts.push(`property.boolean_value ${operatorSql(operator)} ?`)
      args.push(value)
    } else if (operator === 'contains') {
      parts.push("property.string_value LIKE ? ESCAPE '\\'")
      args.push(`%${escapeLike(value)}%`)
    } else {
      parts.push(`property.string_value ${operatorSql(operator)} ?`)
      args.push(value)
    }
  }
  return { sql: parts.join(' OR '), args }
}

function renderColumnComparison(
  column: string,
  operator: PredicateOperator,
  bind: readonly PredicateValue[],
): RenderedFragment {
  const args: BoundValue[] = []
  const parts: string[] = []
  for (const value of bind) {
    if (value === null) {
      parts.push(`${column} IS ${operator === 'neq' ? 'NOT ' : ''}NULL`)
      continue
    }
    if (operator === 'contains') {
      if (typeof value !== 'string') {
        throw new Error('Reporting contains filter requires string values')
      }
      parts.push(`${column} LIKE ? ESCAPE '\\'`)
      args.push(`%${escapeLike(value)}%`)
      continue
    }
    parts.push(`${column} ${operatorSql(operator)} ?`)
    args.push(value)
  }
  return { sql: parts.join(' OR '), args }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

const OPERATOR_SQL: Readonly<Record<Exclude<PredicateOperator, 'contains'>, string>> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  lt: '<',
}

function operatorSql(operator: PredicateOperator): string {
  if (operator === 'contains') throw new Error('contains is rendered as LIKE, not as an operator')
  return OPERATOR_SQL[operator]
}
