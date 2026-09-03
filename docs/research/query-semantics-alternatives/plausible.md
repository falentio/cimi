# Plausible Analytics: Canonical Query Semantics

## Scope and Source Boundary

Research date: 2026-08-23. This report focuses on Plausible's aggregate query
semantics, primarily the Stats API v2 endpoint (`POST /api/v2/query`). It uses
Plausible-owned documentation and the official `plausible/analytics` repository.
Source observations are pinned to commit
[`9cc669b97ece3ecd37fcb3950791cb3873d7944d`](https://github.com/plausible/analytics/commit/9cc669b97ece3ecd37fcb3950791cb3873d7944d),
also available locally at `docs/research/vendor/plausible`. The repository
contains Community Edition and Enterprise branches; source details are not
automatically Cloud-plan guarantees.

## Executive Findings

- **Aggregate-only query contract:** Plausible describes the Stats API as a
  single endpoint that accepts a query and returns requested metrics as JSON.
  The legacy API documentation explicitly says, "You can't query individual
  records from our stats database"; queries return aggregates over a time
  period ([Stats API v2](https://plausible.io/docs/stats-api),
  [legacy API](https://plausible.io/docs/stats-api-v1)).
- **Query shape is explicit:** A query supplies `site_id`, `date_range`, and
  `metrics`, with optional `dimensions`, `filters`, `order_by`, `include`, and
  offset/limit `pagination` ([v2 request structure](https://plausible.io/docs/stats-api),
  [source parser](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/api_query_parser.ex#L21-L43)).
- **Unique counts are scope-sensitive:** Plausible counts a visitor once per
  day/site/device, and a person returning on another day or device is a
  separate visitor. A visitor can have multiple sessions on one day, so
  `visitors`, `visits`, and sums across time buckets are not interchangeable
  ([metric definitions](https://plausible.io/docs/metrics-definitions),
  [dashboard FAQ on minute buckets](https://plausible.io/docs/dashboard-faq)).
- **Buckets are reporting-timezone buckets:** The API exposes time dimensions
  and omits empty buckets by default. `include.time_labels` asks for the full
  set of valid labels, including labels with no results ([time dimensions and
  include options](https://plausible.io/docs/stats-api),
  [source time handling](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/time.ex#L47-L122)).
- **Public sharing is dashboard sharing, not a narrow query capability:** A
  shared link can require a password and enforce a base segment, but viewers
  can still use the dashboard's date ranges, intervals, filters, and exports.
  Public visibility is site-wide and tokenless ([shared links](https://plausible.io/docs/shared-links),
  [public visibility](https://plausible.io/docs/visibility)).

## Query and Result Model

The v2 API documents these required fields:

- `site_id`: the configured site domain.
- `date_range`: a relative shorthand or an ISO 8601 date/date-time pair.
- `metrics`: one or more named calculations.

Dimensions are described as SQL-like `GROUP BY` attributes. A response has an
ordered `results` list; each row contains `dimensions` in the same order as the
request and `metrics` in the same order as the request. The executed query is
echoed in the response ([v2 dimensions and response structure](https://plausible.io/docs/stats-api),
[source result builder](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_result.ex#L206-L228)).

This is a curated aggregate surface, not an arbitrary SQL or event-row
surface. The official legacy documentation makes the row-level boundary
explicit; the v2 source routes the request through query parsing, query
building, and `Plausible.Stats.query/2` ([v2 controller](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible_web/controllers/api/external_query_api_controller.ex#L9-L24)).

## Time Windows and Range Behavior

### Documented inputs

The v2 documentation lists these range forms:

| Input                             | Documented meaning                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `"day"`                           | Current day                                                                                   |
| `"24h"`                           | Last 24 hours relative to now                                                                 |
| `"7d"`, `"28d"`, `"30d"`, `"91d"` | Last N days relative to today                                                                 |
| `"month"`                         | Since the start of the current month                                                          |
| `"6mo"`, `"12mo"`                 | Last N months relative to the start of this month                                             |
| `"year"`                          | Since the start of the current year                                                           |
| `"all"`                           | Since stats collection began                                                                  |
| `["YYYY-MM-DD", "YYYY-MM-DD"]`    | Custom ISO 8601 date range                                                                    |
| `["...+02:00", "...+02:00"]`      | Custom ISO 8601 date-time range; the docs also show a five-minute pair for real-time querying |

Source details add important boundary behavior:

- Date ranges are inclusive in the SQL predicate: event timestamps must be
  `>= first` and `<= last` ([source](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/sql/where_builder.ex#L95-L119)).
- Date-only endpoints expand to local-day boundaries, from `00:00:00` on the
  first date through `23:59:59` on the last date. Explicit date-times are
  shifted to the site's configured reporting timezone before query execution
  ([date range source](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/datetime_range.ex#L16-L57),
  [query period source](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_period.ex#L199-L227)).
- In the inspected source, `last_n_days` ends on the day before the relative
  date, so a seven-day range excludes the current day; dashboard documentation
  similarly says that only month-to-date, year-to-date, and all-time include
  the current day ([source](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_period.ex#L163-L179),
  [dashboard overview](https://plausible.io/docs/guided-tour)).
- The source accepts positive `Nd` ranges up to 5,000 days and `Nmo` ranges up
  to 100 months. These bounds are source behavior rather than a prominently
  documented v2 contract ([source parser](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/api_query_parser.ex#L175-L220)).
- The dashboard parser has additional aliases `realtime` and `realtime_30m`,
  which resolve to five- and thirty-minute windows in the source; these are
  dashboard query semantics, not the relative-date strings listed in the v2
  API table ([dashboard parser](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/dashboard/query_parser.ex#L42-L53),
  [query period](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_period.ex#L24-L38)).

## Granularity and Buckets

The v2 time dimensions are:

| Dimension    | Meaning                                  |
| ------------ | ---------------------------------------- |
| `time`       | Automatic bucket selected from the range |
| `time:hour`  | Hour bucket                              |
| `time:day`   | Calendar date                            |
| `time:week`  | Start of week                            |
| `time:month` | Start of month                           |

The pinned source parser also accepts `time:minute`. The source rejects a
minute-dimension query when the range exceeds 30 hours, with the error
"Dimension `time:minute` is only supported for time ranges up to 30 hours"
([source parser](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/api_query_parser.ex#L283-L289),
[granularity validation](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_builder.ex#L284-L297)).

The API documentation says:

- `time` cannot be used as a filter; callers should constrain time with
  `date_range`.
- Empty time buckets are omitted unless `include.time_labels` is true.
- Time labels are reported in the site's Reporting Timezone.

The dashboard offers interval choices based on the selected range. For example,
"Today" can be shown by minute or hour, while "Last 28 days" can be shown by
day or week ([dashboard overview](https://plausible.io/docs/guided-tour)).

Minute and hour visitor/session series have a non-obvious rule. The dashboard
FAQ says those metrics are counted when a session is active in a bucket, while
pageviews are counted only in the bucket where they occurred. The source calls
this "smear" behavior and expands active sessions across minute/hour slots
([dashboard FAQ](https://plausible.io/docs/dashboard-faq),
[table decider](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/table_decider.ex#L124-L157),
[time expressions](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/sql/expression.ex#L117-L160)).

## Metric Definitions and Unique Counts

| Metric                                     | Plausible definition                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `visitors`                                 | Number of unique visitors                                                                            |
| `visits`                                   | Number of visits/sessions; a session ends after 30 minutes without action                            |
| `pageviews`                                | Number of pageview events                                                                            |
| `events`                                   | Pageviews plus custom events; when filtered by a goal, this is total conversions                     |
| `views_per_visit`                          | Pageviews divided by visits                                                                          |
| `bounce_rate`                              | Percentage of visits that did not meaningfully engage; by default, one page only and no custom event |
| `visit_duration`                           | Average session duration; zero-second bounces remain in the denominator                              |
| `conversion_rate`                          | Unique conversions divided by unique visitors, subject to filters                                    |
| `unique conversions` / `total conversions` | One conversion per visitor/goal versus every repeated conversion                                     |

These definitions are documented in [Metrics definitions](https://plausible.io/docs/metrics-definitions)
and the [v2 metric table](https://plausible.io/docs/stats-api). A non-interactive
custom event is still recorded but does not remove a visit from the bounce
count ([metric definitions](https://plausible.io/docs/metrics-definitions)).

Unique-count boundaries are especially important for a canonical contract:

- Plausible says a person using multiple devices or returning on multiple days
  is counted as separate visitors; within one day, the person counts once even
  with multiple sessions ([metrics definitions](https://plausible.io/docs/metrics-definitions)).
- The source implements event-level `visitors` as `uniq(user_id)` and
  `visits` as `uniq(session_id)`, while session-level visitors also use
  `uniq(user_id)` ([SQL expressions](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/sql/expression.ex#L296-L318),
  [session metrics](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/sql/expression.ex#L444-L480)).
- Consequently, unique values are calculated within the selected range and
  dimension group. Summing visitor rows across days, or across overlapping
  dimension groups, is not a generally valid way to recover a global unique
  count. This follows from the documented daily identity boundary and the
  source's per-query `uniq` aggregation.
- Imported Google Analytics data is a separate caveat: Plausible documents that
  imported unique visitors are only day-level aggregates, so longer-period
  unique counts are formed by summing daily uniques and can overcount returning
  visitors ([Google Analytics import](https://plausible.io/docs/google-analytics-import)).

Several metrics have query-shape requirements. `conversion_rate` requires an
`event:goal` filter or dimension; `scroll_depth` and `time_on_page` require an
`event:page` filter or dimension. Session metrics such as bounce rate, views per
visit, and visit duration cannot generally be mixed with event dimensions,
except for the documented page/hostname cases ([v2 metric requirements](https://plausible.io/docs/stats-api),
[source validation](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_builder.ex#L426-L524)).

## Filters and Dimensions

Plausible separates dimensions into these useful namespaces:

- `event:*`: goal, page, hostname, and event name.
- `visit:*`: entry/exit pages, source, channel, referrer, UTM values, device,
  browser, OS, and country/region/city.
- `time:*`: time buckets.
- `event:props:<name>`: custom properties attached to pageviews or custom
  events.

The API docs state that visit-dimension values are determined by the first
pageview in a session. Dimensions act as SQL-like `GROUP BY` values; event and
visit dimensions can be used in filters ([v2 dimensions](https://plausible.io/docs/stats-api),
[custom properties](https://plausible.io/docs/custom-props/introduction)).

Simple filters have an operator, dimension, and list of clauses. The documented
operators are `is`, `is_not`, `contains`, `contains_not`, `matches`, and
`matches_not`; `and`, `or`, and `not` compose filter trees. Top-level filters
are combined with an implicit `and` ([v2 filters](https://plausible.io/docs/stats-api)).

Two semantic details matter for Cimi:

- Multiple clauses for one simple filter are alternatives: a row matches if any
  clause matches. Multiple simple event filters select events matching all
  event filters; they do not mean that separate events occurred. The
  behavioral `has_done` and `has_not_done` operators exist for session-level
  "another event occurred" tests ([v2 behavioral filters](https://plausible.io/docs/stats-api),
  [source WHERE builder](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/sql/where_builder.ex#L142-L153)).
- A saved segment is represented as a filter (`["is", "segment", [id]]`).
  Custom-property filters are subject to site feature access and property
  allowlists in the source ([source parser](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/api_query_parser.ex#L350-L377),
  [query builder access check](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_builder.ex#L397-L423)).

## Sorting and Pagination

The v2 API accepts `order_by` as ordered pairs of a queried metric or dimension
and `asc`/`desc`, for example `[["visitors", "desc"], ["visit:country_name", "asc"]]`.
If omitted, the documented default is time ascending when a time dimension is
present, otherwise the first requested metric descending ([v2 order_by](https://plausible.io/docs/stats-api)).
The source rejects an order key that is not in the requested metrics or
dimensions ([source validation](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_builder.ex#L212-L235)).

V2 pagination defaults to `{ "limit": 10000, "offset": 0 }`. Setting
`include.total_rows` adds `meta.total_rows`; the source applies SQL `LIMIT` and
`OFFSET` and obtains the count with `count() over ()` ([v2 pagination](https://plausible.io/docs/stats-api),
[`ApiQueryParser` defaults](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/api_query_parser.ex#L21-L23),
[SQL pagination](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/sql/query_builder.ex#L248-L262)).

The legacy v1 breakdown endpoint is a different contract: default limit 100,
maximum 1,000, and one-based `page` pagination ([legacy API](https://plausible.io/docs/stats-api-v1),
[legacy controller](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible_web/controllers/api/external_stats_controller.ex#L77-L89)).

## Public and Shared Analytics

- **Public dashboard:** Stats are private by default. Enabling visibility lets
  anyone with the dashboard URL view the site's stats; disabling the toggle
  makes the URL private again ([visibility docs](https://plausible.io/docs/visibility)).
- **Shared dashboard:** A recipient needs neither a Plausible account nor a
  login and can see only the specific shared site. The link can have a password
  and can be fixed to a site segment ([shared-link docs](https://plausible.io/docs/shared-links)).
- **Segment enforcement:** Viewers cannot remove the fixed base segment, but
  they can add filters. If they add a filter outside the segment, Plausible
  says the result contains no data ([shared-link docs](https://plausible.io/docs/shared-links)).
  The source enforces the required segment as the first filter on internal
  stats queries ([shared-link route](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible_web/router.ex#L286-L311),
  [required-filter plug](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible_web/controllers/api/stats_controller.ex#L355-L405)).
- **Query surface:** The shared route renders the normal dashboard, so the
  recipient can use the dashboard's supported date ranges, chart intervals,
  filters, and sorting. Quick export follows the selected date range and
  audience filters ([dashboard overview](https://plausible.io/docs/guided-tour),
  [export docs](https://plausible.io/docs/export-stats)).
- **API separation:** The documented Stats API requires a Bearer API key; a
  shared-link URL is not a Stats API credential ([Stats API authentication](https://plausible.io/docs/stats-api)).

For Cimi, this means a Plausible-style shared dashboard is broader than a
canonical public query. A separate public query contract is needed if public
consumers must receive only an approved metric/dimension catalog, fixed range
limits, suppression, or no export.

## Implications for Cimi's Canonical Query

Plausible provides useful competitor evidence for making these parts explicit:

1. Treat `date_range`, timezone, endpoint inclusivity, relative-date anchoring,
   and current/incomplete buckets as part of the query contract.
2. Treat `dimensions` as grouping semantics, not just response decoration, and
   specify whether empty time buckets are materialized.
3. Define unique-count scope independently from additive event/session counts;
   document whether a visitor can be counted in multiple buckets and whether a
   global unique is available alongside grouped uniques.
4. Validate metric/dimension combinations rather than allowing every metric
   with every dimension.
5. Prefer a stable pagination contract. Plausible's v2 offset pagination is
   simple, but the reviewed docs do not state a cursor or a deterministic
   tie-break rule for equal sort values.
6. Keep public/shared disclosure separate from member query semantics. A
   bearer dashboard link should not silently become the authorization model for
   Cimi's aggregate Public Query.

## Unknowns and Evidence Limits

- The reviewed sources do not document a stable tie-break rule for equal
  `order_by` values, cursor pagination, or a maximum v2 offset.
- The public/shared documentation does not specify per-link date-range caps,
  metric allowlists, export disabling, anonymous-link rate limits, or cache
  invalidation guarantees.
- The v2 documentation and pinned source differ in some surface details: the
  source accepts `time:minute` and bounded arbitrary `Nd`/`Nmo` shorthands,
  while the public tables emphasize a smaller named set. Treat the source
  behavior as implementation evidence, not necessarily a Cloud compatibility
  promise.
- Imported data has documented unsupported filter/dimension combinations and
  warning metadata. This report does not exhaustively catalog every native vs.
  imported merge rule ([v2 imported-stats notes](https://plausible.io/docs/stats-api)).
- Plausible's public documentation describes metrics and dashboard behavior,
  while the pinned repository shows implementation details. Plan, Cloud, and
  self-hosted differences should be rechecked before treating any one source
  snapshot as a compatibility target.

## Primary Sources

- [Plausible Stats API v2](https://plausible.io/docs/stats-api)
- [Plausible Stats API v1 (legacy)](https://plausible.io/docs/stats-api-v1)
- [Metrics definitions](https://plausible.io/docs/metrics-definitions)
- [Dashboard overview](https://plausible.io/docs/guided-tour)
- [Dashboard FAQ](https://plausible.io/docs/dashboard-faq)
- [Filters and segments](https://plausible.io/docs/filters-segments)
- [Shared links](https://plausible.io/docs/shared-links)
- [Public visibility](https://plausible.io/docs/visibility)
- [Stats export](https://plausible.io/docs/export-stats)
- [Official Plausible Analytics source snapshot](https://github.com/plausible/analytics/tree/9cc669b97ece3ecd37fcb3950791cb3873d7944d)
