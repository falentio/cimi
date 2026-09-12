import {
  createInstantMs,
  type Predicate,
  type PredicateOperator,
  type PredicateValue,
  type PresencePredicate,
  type ReportFilterPlan,
  type ReportingQueryPort,
  type TrafficAggregateQuery,
  type TrafficAggregateResult,
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
