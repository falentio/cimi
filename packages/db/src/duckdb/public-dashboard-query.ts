import {
  type PublicDashboardAggregateQuery,
  type PublicDashboardAggregateRow,
  type PublicDashboardQueryPort,
} from '@cimi/kernel'
import type { AnalyticsDb } from './index.ts'
import { renderFilterPlan, type EventColumnOverrides } from './reporting-query.ts'

export interface DuckDbPublicDashboardQueryDependencies {
  readonly analytics: AnalyticsDb
}

type BoundValue = string | number | boolean | null

const PUBLIC_DIMENSION_KEY_MAX_LENGTH = 2_048

export class DuckDbPublicDashboardQuery implements PublicDashboardQueryPort {
  constructor(private readonly deps: DuckDbPublicDashboardQueryDependencies) {}

  async countDimensionValues(query: PublicDashboardAggregateQuery): Promise<number> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const predicate = renderFilterPlan(
        query.filterPlan,
        query.period.interval,
        PUBLIC_EVENT_COLUMN_OVERRIDES,
      )
      const grouped = publicDashboardGroupedCte(query)
      const rows = await reader.read(
        `WITH ${publicDashboardFilteredCte(predicate.sql)},
session_stats AS (
  SELECT analytics_session_id AS session_id,
         count(*) AS event_count,
         sum(CASE WHEN event_kind = 'page_view' THEN 1 ELSE 0 END) AS page_view_count,
         sum(CASE WHEN event_kind = 'custom_event' THEN 1 ELSE 0 END) AS custom_event_count,
         sum(CASE WHEN event_kind = 'outbound' THEN 1 ELSE 0 END) AS outbound_count,
         max(epoch_ms(occurrence_time)) AS max_ms,
         min(epoch_ms(occurrence_time)) AS min_ms
  FROM events
  WHERE site_id = ?
  GROUP BY analytics_session_id
),
${grouped}
SELECT count(DISTINCT group_key) AS total_count
FROM grouped
WHERE group_key IS NOT NULL AND trim(CAST(group_key AS VARCHAR)) <> ''`,
        publicDashboardArgs(query, predicate.args, true),
      )
      return readCount(rows[0]?.['total_count'])
    })
  }

  async countDistinctVisitors(query: PublicDashboardAggregateQuery): Promise<number> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const predicate = renderFilterPlan(
        query.filterPlan,
        query.period.interval,
        PUBLIC_EVENT_COLUMN_OVERRIDES,
      )
      const rows = await reader.read(
        `WITH ${publicDashboardFilteredCte(predicate.sql)}
SELECT count(DISTINCT visitor_id) AS total_count
FROM filtered`,
        publicDashboardArgs(query, predicate.args),
      )
      return readCount(rows[0]?.['total_count'])
    })
  }

  async aggregate(
    query: PublicDashboardAggregateQuery,
  ): Promise<readonly PublicDashboardAggregateRow[]> {
    return this.deps.analytics.readWindowed(async (reader) => {
      const predicate = renderFilterPlan(
        query.filterPlan,
        query.period.interval,
        PUBLIC_EVENT_COLUMN_OVERRIDES,
      )
      const grouped = publicDashboardGroupedCte(query)
      const rows = await reader.read(
        `WITH ${publicDashboardFilteredCte(predicate.sql)},
session_stats AS (
  SELECT analytics_session_id AS session_id,
         count(*) AS event_count,
         sum(CASE WHEN event_kind = 'page_view' THEN 1 ELSE 0 END) AS page_view_count,
         sum(CASE WHEN event_kind = 'custom_event' THEN 1 ELSE 0 END) AS custom_event_count,
         sum(CASE WHEN event_kind = 'outbound' THEN 1 ELSE 0 END) AS outbound_count,
         max(epoch_ms(occurrence_time)) AS max_ms,
         min(epoch_ms(occurrence_time)) AS min_ms
  FROM events
  WHERE site_id = ?
  GROUP BY analytics_session_id
),
${grouped}
SELECT group_key,
       count(DISTINCT visitor_id) AS distinct_visitors,
       ${publicDashboardMetricExpression(query.metric)} AS metric_value
FROM grouped
GROUP BY group_key
ORDER BY group_key`,
        publicDashboardArgs(query, predicate.args, true),
      )
      return rows.flatMap((row) => {
        const groupKey = readGroupKey(row['group_key'])
        if (groupKey === null) return []
        return [
          {
            groupKey,
            value: readCount(row['metric_value']),
            distinctVisitors: readCount(row['distinct_visitors']),
          },
        ]
      })
    })
  }
}

function publicDashboardFilteredCte(predicateSql: string): string {
  return `filtered AS (
  SELECT e.event_kind,
         epoch_ms(e.occurrence_time) AS occurrence_ms,
         e.visitor_id,
         e.analytics_session_id AS session_id,
         e.name,
         e.page_path,
          session.referrer AS session_referrer,
         session.utm_source,
         session.utm_medium,
         session.utm_campaign,
         session.device,
         session.browser,
         session.operating_system,
         session.country,
         session.region,
         session.city,
         visitor.identity_kind
  FROM events e
  LEFT JOIN analytics_sessions session
    ON session.site_id = e.site_id AND session.session_id = e.analytics_session_id
  LEFT JOIN visitors visitor
    ON visitor.site_id = e.site_id AND visitor.visitor_id = e.visitor_id
  WHERE e.site_id = ?
    AND e.occurrence_time >= CAST(? AS TIMESTAMP)
    AND e.occurrence_time < CAST(? AS TIMESTAMP)${predicateSql}
)`
}

function publicDashboardGroupedCte(query: PublicDashboardAggregateQuery): string {
  if (query.dimension === 'time') {
    const starts = query.period.bucketStarts ?? []
    const values = starts
      .map(() => '(CAST(? AS BIGINT), CAST(? AS BIGINT), CAST(? AS BIGINT))')
      .join(', ')
    return `buckets(bucket_index, start_ms, end_ms) AS (
  VALUES ${values}
),
grouped AS (
  SELECT buckets.bucket_index AS group_key,
         filtered.*,
         session_stats.event_count,
         session_stats.page_view_count,
         session_stats.custom_event_count,
         session_stats.outbound_count,
         session_stats.max_ms,
         session_stats.min_ms
  FROM buckets
  JOIN filtered
    ON filtered.occurrence_ms >= buckets.start_ms
   AND filtered.occurrence_ms < buckets.end_ms
  LEFT JOIN session_stats ON session_stats.session_id = filtered.session_id
)`
  }

  const value = publicDashboardDimensionExpression(query.dimension)
  return `grouped AS (
  SELECT ${value} AS group_key,
         filtered.*,
         session_stats.event_count,
         session_stats.page_view_count,
         session_stats.custom_event_count,
         session_stats.outbound_count,
         session_stats.max_ms,
         session_stats.min_ms
  FROM filtered
  LEFT JOIN session_stats ON session_stats.session_id = filtered.session_id
  WHERE ${value} IS NOT NULL AND trim(CAST(${value} AS VARCHAR)) <> ''
)`
}

function publicDashboardDimensionExpression(
  dimension: PublicDashboardAggregateQuery['dimension'],
): string {
  switch (dimension) {
    case 'page':
      return `CASE WHEN filtered.event_kind = 'page_view' THEN ${publicUrlExpression('filtered.page_path')} END`
    case 'referrer':
      return publicUrlExpression('filtered.session_referrer')
    case 'utm':
      return "NULLIF(concat_ws(' / ', NULLIF(trim(filtered.utm_source), ''), NULLIF(trim(filtered.utm_medium), ''), NULLIF(trim(filtered.utm_campaign), '')), '')"
    case 'device':
      return 'filtered.device'
    case 'browser':
      return 'filtered.browser'
    case 'os':
      return 'filtered.operating_system'
    case 'country':
      return 'filtered.country'
    case 'region':
      return 'filtered.region'
    case 'city':
      return 'filtered.city'
    case 'event_name':
      return "NULLIF(trim(filtered.name), '')"
    case 'identity_kind':
      return "CASE filtered.identity_kind WHEN 'anonymous' THEN 'anonymous' WHEN 'identified' THEN 'identified' END"
    case 'time':
      throw new Error('Time is grouped by bucket starts')
  }
}

function publicUrlExpression(column: string): string {
  return `NULLIF(trim(split_part(split_part(${column}, '?', 1), '#', 1)), '')`
}

const PUBLIC_EVENT_COLUMN_OVERRIDES = {
  'event.pagePath': publicUrlExpression('e.page_path'),
  'event.referrer': publicUrlExpression('e.referrer'),
} satisfies EventColumnOverrides

function publicDashboardMetricExpression(metric: PublicDashboardAggregateQuery['metric']): string {
  switch (metric) {
    case 'visitors':
      return 'count(DISTINCT visitor_id)'
    case 'sessions':
      return 'count(DISTINCT session_id)'
    case 'pageviews':
      return "sum(CASE WHEN event_kind = 'page_view' THEN 1 ELSE 0 END)"
    case 'events':
      return 'count(*)'
    case 'bounce_rate':
      return `CAST(count(DISTINCT CASE
        WHEN session_id IS NOT NULL
         AND event_count >= 2
         AND page_view_count = 1
         AND custom_event_count = 0
         AND outbound_count = 0
         AND (max_ms - min_ms) < 10000
         AND event_kind = 'page_view'
        THEN session_id END) AS DOUBLE)
        / NULLIF(count(DISTINCT CASE WHEN event_kind = 'page_view' THEN session_id END), 0)`
  }
}

function publicDashboardArgs(
  query: PublicDashboardAggregateQuery,
  predicateArgs: readonly BoundValue[],
  includeSessionStats = false,
): BoundValue[] {
  const args: BoundValue[] = [
    query.siteId,
    timestamp(query.period.interval.start),
    timestamp(query.period.interval.endExclusive),
    ...predicateArgs,
  ]
  if (includeSessionStats) args.push(query.siteId)
  if (query.dimension === 'time') {
    const starts = query.period.bucketStarts ?? []
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index]!
      const end = starts[index + 1]?.at ?? query.period.interval.endExclusive
      args.push(index, start.at, end)
    }
  }
  return args
}

function readCount(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function readGroupKey(value: unknown): string | number | null {
  if (typeof value === 'string') {
    return value.length > PUBLIC_DIMENSION_KEY_MAX_LENGTH
      ? value.slice(0, PUBLIC_DIMENSION_KEY_MAX_LENGTH)
      : value
  }
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return null
}

function timestamp(instant: number): string {
  return new Date(instant).toISOString()
}
