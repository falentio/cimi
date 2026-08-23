# PostHog: Canonical Query Semantics

- Investigated: 2026-08-23
- Source scope: official PostHog documentation/API docs and the pinned
  `PostHog/posthog` checkout at `0142feede7fed4f0bfe6a2e0096e46895ab6113d`
- Purpose: record PostHog behavior relevant to Cimi's query contract. Cimi
  implications are recommendations, not PostHog guarantees.

## Executive Summary

PostHog has two materially different query surfaces:

- `TrendsQuery` is a structured, time-series insight query with date ranges,
  fixed intervals, event/property aggregations, filters, and breakdowns.
- `HogQLQuery` is SQL-like and lets the caller define `WHERE`, `GROUP BY`,
  `ORDER BY`, and `LIMIT` directly.

The official Query API is `POST /api/projects/:project_id/query/`. Its default
result limit is 100 rows and an explicit `LIMIT` can return up to 50,000 rows.
PostHog explicitly says `/query` is not an export mechanism and rejects
programmatic `OFFSET` pagination; it recommends keyset pagination instead.
([API queries](https://posthog.com/docs/api/queries), [query API](https://posthog.com/docs/api/query))

For Cimi, PostHog is evidence that a canonical contract needs to make the
following explicit: inclusive or exclusive time bounds, bucket timezone and
alignment, whether unique counts are exact and over which identity, dimension
top-N behavior, and whether pagination is offset, cursor, or unsupported.

## Evidence Matrix

### Time Windows and Ranges

- **Default:** The Trends UI defaults to the last 7 days. ([Trends](https://posthog.com/docs/product-analytics/trends/overview))
- **Range syntax:** `DateRange.date_from` accepts ISO 8601 timestamps or
  relative values such as `-7d`, `-2w`, `-1m`, `-1h`, `-1mStart`, and
  `-1yStart`; `date_to` uses the same format and omitted/null means `now`.
  ([schema.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema.py#L1104-L1120))
- **Rounding:** `explicitDate` means the supplied dates are used verbatim and
  disables period rounding. Otherwise the local query implementation rounds
  relative starts toward the beginning of the relevant period and, for ranges
  above hourly granularity, ends the date at `23:59:59.999999` in the project
  timezone. ([schema.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema.py#L1138-L1143), [query_date_range.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/utils/query_date_range.py#L97-L124))
- **Bounds:** The Trends builder filters ordinary series with
  `timestamp >= date_from_with_adjusted_start_of_interval` and
  `timestamp <= date_to`. The lower-bound helper can align a non-explicit
  range to an interval start, while an exact range uses the supplied start;
  both SQL comparisons are inclusive in this path. ([trends_query_builder.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/insights/trends/trends_query_builder.py#L799-L817), [query_date_range.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/utils/query_date_range.py#L351-L416))
- **Incomplete periods:** `excludeIncompletePeriods` clips `date_to` to just
  before the current interval, evaluated in the project timezone. If there is
  no complete interval, it is a no-op. ([schema.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema.py#L1121-L1136), [query_date_range.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/utils/query_date_range.py#L126-L168))
- **Comparison windows:** Previous-period comparisons are derived from the
  resolved current range and can use an explicit comparison target; the local
  implementation returns a separate previous `date_from`/`date_to` range.
  ([query_previous_period_date_range.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/utils/query_previous_period_date_range.py#L61-L92))
- **HogQL distinction:** In a `HogQLQuery`, the caller writes the time filter,
  for example `timestamp >= now() - INTERVAL 7 DAY`; the docs recommend a
  short explicit time range but do not impose Trends' DateRange rounding.
  ([API queries](https://posthog.com/docs/api/queries), [SQL](https://posthog.com/docs/sql))

### Granularity and Buckets

- `TrendsQuery.interval` defaults to `day`. The pinned schema accepts
  `second`, `minute`, `hour`, `day`, `week`, `month`, `quarter`, and `year`.
  ([TrendsQuery schema](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema.py#L28320-L28360), [IntervalType](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema_enums.py#L2996-L3004))
- PostHog's product docs describe grouping by second, minute, hour, day, week,
  or month. The current-period bucket may be incomplete; the docs describe it
  as a dotted line rather than silently removing it. ([Trends](https://posthog.com/docs/product-analytics/trends/overview))
- The Trends implementation creates a bucket start with
  `toStartOf<interval>(timestamp)` and orders time buckets ascending.
  ([trends_query_builder.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/insights/trends/trends_query_builder.py#L404-L450))
- Smoothing is a display/query option for day-grouped data and is documented
  as a 7-day or 28-day rolling average. It is not the underlying bucket value.
  ([Trends](https://posthog.com/docs/product-analytics/trends/overview))
- WAU and MAU are rolling windows, not simple labels for weekly/monthly
  buckets: WAU counts unique users in the prior 7 days and MAU in the prior 30
  days for each period. ([Aggregations](https://posthog.com/docs/product-analytics/trends/aggregations))

### Metrics and Unique Counts

The documented event aggregations are:

| Metric | Definition |
| --- | --- |
| Total count | Total event occurrences in the period/bucket. |
| Unique users | Unique users who performed the event in the period/bucket. |
| Daily active users | Unique users in the day-level window. |
| WAU / MAU | Unique users in rolling 7-day / 30-day windows. |
| Unique sessions | Unique sessions in which the event occurred. |
| Unique groups | Unique groups that performed the event. |
| Property math | Average, sum, min, max, median, or p75/p90/p95/p99 of a numeric property. |

The official aggregation docs state that two occurrences by the same user count
as one for Unique users. The implementation maps the main unique-user path to
`count(DISTINCT person_id)`; depending on the team setting, it can aggregate by
`distinct_id` instead. Unique sessions use `count(DISTINCT "$session_id")`,
and unique groups use the selected `$group_N` field. ([Aggregations](https://posthog.com/docs/product-analytics/trends/aggregations), [aggregation_operations.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/insights/trends/aggregation_operations.py#L89-L168))

Unique-person results are identity-sensitive: PostHog documents that merging
two person records can change a result from two unique persons to one. Person
properties stored on events are historical snapshots; current person-property
filtering requires a cohort or a SQL path. ([Querying data](https://posthog.com/docs/how-posthog-works/queries))

Other metric details:

- Total count is the default Trends aggregation. ([Trends](https://posthog.com/docs/product-analytics/trends/overview))
- First-ever and first-matching-event aggregations have different filter
  semantics: the former tests the user's first occurrence even if it fails the
  current filter; the latter finds the first occurrence that matches it.
  ([Filters](https://posthog.com/docs/product-analytics/trends/filters))
- `samplingFactor` exists on the structured query schema, but the sources
  inspected here do not establish an exactness guarantee for unique metrics
  when sampling is enabled. ([TrendsQuery schema](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema.py#L28345-L28360))

### Filters and Dimensions

- Trends has per-series inline filters and insight-wide filter groups. Inline
  filters are `AND` only. Filter groups support `AND` and `OR`, including
  combinations between groups. ([Filters](https://posthog.com/docs/product-analytics/trends/filters))
- Filterable dimensions include event, person, group, session, cohort,
  autocaptured HTML element, feature flag, and SQL expressions. A property
  absent from an event fails a filter that references it. ([Filters](https://posthog.com/docs/product-analytics/trends/filters), [property filter types](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema_enums.py#L3617-L3647))
- Supported operators include exact/not-exact, contains/not-contains, regex,
  numeric comparisons, set/unset, date comparisons, ranges, membership, and
  semver comparisons. ([Property operators](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema_enums.py#L3662-L3700))
- Breakdowns split a series into distinct values of event, session, person,
  feature-flag, group, cohort, or SQL dimensions. Trends supports up to three
  breakdowns. ([Breakdowns](https://posthog.com/docs/product-analytics/trends/breakdowns), [BreakdownFilter](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema.py#L4544-L4557))
- Non-numeric breakdowns initially load the first 25 values. Numeric binning
  groups values into the requested number of ranges and aggregates all values,
  rather than applying the non-numeric top-25 behavior. ([Breakdowns](https://posthog.com/docs/product-analytics/trends/breakdowns), [constants.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql/constants.py#L48-L54))
- Breakdown ranking is metric-dependent in the current Trends builder: it ranks
  by the chosen aggregate, then by the breakdown value. Values outside the
  limit are combined into `Other`; null and `Other` are ordered after ordinary
  values. ([trends_query_builder.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/insights/trends/trends_query_builder.py#L80-L118), [breakdown ordering](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/insights/trends/trends_query_builder.py#L995-L1028))
- HogQL avoids Trends' three-breakdown UI/schema limitation: the SQL surface can
  use `SELECT`, `WHERE`, `GROUP BY`, `JOIN`, and arbitrary SQL expressions,
  subject to the query engine's own limits.
  ([SQL](https://posthog.com/docs/sql))

### Sorting and Pagination

- HogQL sorting is caller-defined with `ORDER BY`; PostHog's own example orders
  event counts descending. ([SQL](https://posthog.com/docs/sql))
- Query API responses default to 100 rows. An explicit `LIMIT` can be at most
  50,000 rows. ([API queries](https://posthog.com/docs/api/queries), [constants.py](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql/constants.py#L23-L29))
- Programmatic `/query` requests do not support `OFFSET`; PostHog documents an
  HTTP 400 for personal API keys and recommends keyset pagination, using
  `timestamp` for `events` and `id` for `persons`. `/query` is not supported for
  bulk export. ([API queries](https://posthog.com/docs/api/queries))
- Structured Trends results are not a generic row-paginated table: time buckets
  are returned chronologically, while breakdowns are top-N ranked and may have
  an `Other` series. The source exposes `breakdown_limit`, but the exact
  user-facing "load more" cursor/continuation contract is not documented in the
  sources inspected. ([Breakdowns](https://posthog.com/docs/product-analytics/trends/breakdowns), [Trends builder](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/insights/trends/trends_query_builder.py#L602-L619))
- Saved dashboard and insight collection endpoints are a separate REST-list
  contract with `limit`, `offset`, `count`, `next`, and `previous`; that should
  not be confused with `/query` result pagination. ([dashboards API](https://posthog.com/docs/api/dashboards), [insights API](https://posthog.com/docs/api/insights))

### Public and Shared Analytics

- A shared insight or dashboard is a public link: the official docs say anyone
  with the link can view it and the link does not require authentication. The
  external viewer sees the saved configuration and cannot change the
  visualization or date range. ([Sharing](https://posthog.com/docs/product-analytics/sharing))
- Shared and embedded dashboards auto-refresh every 30 minutes while visible;
  if data is older than 30 minutes on load or when returning to a tab, PostHog
  triggers a full refresh. ([Sharing](https://posthog.com/docs/product-analytics/sharing))
- Public sharing is blocked when a query references tables denied by warehouse
  access control. The sharing API exposes enable/refresh/password operations for
  dashboards and insights. ([Sharing](https://posthog.com/docs/product-analytics/sharing), [dashboards API](https://posthog.com/docs/api/dashboards), [insights API](https://posthog.com/docs/api/insights))
- Insight-based endpoints add a related distinction: non-materialized insight
  endpoints accept `date_from`/`date_to` variables, while materialized endpoints
  do not support date variables and only support breakdown-value variables.
  ([Endpoint variables](https://posthog.com/docs/endpoints/variables))

## Implications for Cimi

- Keep Cimi's canonical query contract narrower than PostHog's combined
  Trends/HogQL surface. Treat HogQL as an escape hatch, not as the definition of
  standard metric semantics.
- Specify time bounds as a contract, including inclusivity, timezone, relative
  range resolution, incomplete-period behavior, and DST behavior.
- Specify whether a unique metric is per event bucket or across the complete
  requested window. PostHog's ordinary Trends metrics are bucketed; rolling
  WAU/MAU and cumulative displays are different operations.
- Specify the identity key for unique counts and how merges, anonymous IDs,
  sessions, and sampling affect it.
- Specify dimension cardinality and ordering. A stable Cimi result should not
  silently inherit PostHog's top-25/`Other` behavior unless that is intentional.
- Use cursor/keyset pagination for large row results. Do not make `OFFSET` part
  of Cimi's vendor-neutral contract solely because saved-resource REST lists
  expose it.
- Treat public sharing as a disclosure mode for an immutable saved query, not
  as an authenticated query API. Cimi should independently approve the fields,
  filters, date range, and refresh policy exposed by a public report.

## Unknowns and Verification Gaps

- The inspected sources do not define one exact range/bucket contract shared by
  every PostHog query kind. Trends DateRange behavior and caller-written HogQL
  are different surfaces.
- Exact DST behavior and timezone conversion for every interval and query type
  were not exhaustively verified.
- The public API contract for continuing beyond the first 25 Trends breakdown
  values is not clear from the inspected docs/source; do not assume a stable
  cursor.
- Exact unique-count behavior under `samplingFactor` was not established.
- Generic HogQL result ordering is only as deterministic as the caller's
  `ORDER BY`; no universal tie-breaker contract was found.
- The inspected public-sharing docs do not establish whether a normal public
  dashboard/insight link exposes CSV or JSON raw-result export.

## Primary Sources

- [API queries](https://posthog.com/docs/api/queries)
- [Query API reference](https://posthog.com/docs/api/query)
- [Trends](https://posthog.com/docs/product-analytics/trends/overview)
- [Aggregations](https://posthog.com/docs/product-analytics/trends/aggregations)
- [Breakdowns](https://posthog.com/docs/product-analytics/trends/breakdowns)
- [Filters](https://posthog.com/docs/product-analytics/trends/filters)
- [Querying data](https://posthog.com/docs/how-posthog-works/queries)
- [SQL access](https://posthog.com/docs/sql)
- [Sharing and embedding](https://posthog.com/docs/product-analytics/sharing)
- [Dashboards API](https://posthog.com/docs/api/dashboards)
- [Insights API](https://posthog.com/docs/api/insights)
- [Endpoint variables](https://posthog.com/docs/endpoints/variables)
- [`posthog/schema.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema.py)
- [`posthog/schema_enums.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/schema_enums.py)
- [`query_date_range.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/utils/query_date_range.py)
- [`trends_query_builder.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/insights/trends/trends_query_builder.py)
- [`aggregation_operations.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql_queries/insights/trends/aggregation_operations.py)
- [`hogql/constants.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/hogql/constants.py)
