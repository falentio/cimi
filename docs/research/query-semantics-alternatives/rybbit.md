# Rybbit Query Semantics

Scope: Rybbit's analytics query contract as a reference for Cimi's canonical
query semantics: time windows, buckets, metric and unique-count definitions,
filters/dimensions, ordering/pagination, and public/shared reads.

## Evidence Boundary

This report uses only Rybbit's official documentation and the checked-in official
source repository at commit [`64f8c4f`](https://github.com/rybbit-io/rybbit/tree/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2)
(`2026-08-20`). The local checkout is the official repository
`https://github.com/rybbit-io/rybbit`; source links below point to that immutable
commit. The API documentation labels the API beta, so deployed behavior may
change.

Labels:

- **Fact:** directly documented or implemented behavior.
- **Inference:** a consequence of the implementation, not necessarily a product promise.
- **Mismatch:** documentation and source do not say the same thing.

## Executive Summary

| Area       | Rybbit behavior                                                                                                                                                                   | Cimi relevance                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Time       | Date ranges use a site-supplied IANA timezone; exact datetimes are half-open; relative windows use older/newer minute offsets. Missing time params resolve to all-time in source. | Define inclusivity, timezone defaults, and whether all-time is allowed instead of relying on endpoint convention. |
| Buckets    | `minute`, `five_minutes`, `ten_minutes`, `fifteen_minutes`, `hour`, `day`, `week`, `month`, and `year`; bounded series fill empty buckets.                                        | Bucket assignment and empty-bucket behavior need to be part of the query contract.                                |
| Users      | `identified_user_id` wins; otherwise the anonymous device fingerprint is used.                                                                                                    | "Unique users" is a chosen identity key, not necessarily unique people.                                           |
| Dimensions | Most breakdown counts are distinct sessions that touched a value. `event_name` is an event-occurrence count.                                                                      | Metric grain must be explicit per metric and dimension.                                                           |
| Filters    | JSON filter objects; filters are ANDed, values usually ORed, and some filters are session-level subqueries.                                                                       | Filter scope must state whether a matching event qualifies a session or only the matching rows.                   |
| Pagination | Offset pages for metrics, sessions, and users; cursor timestamps for events. Sort defaults differ by endpoint.                                                                    | A single generic pagination model would not reproduce Rybbit semantics.                                           |
| Sharing    | Public Analytics and valid private links authorize the same analytics read routes; query semantics are not narrowed by sharing.                                                   | Shared access needs an explicit data scope, not only a read authorization flag.                                   |

## Time Windows

### Supported forms

The official [common-parameters documentation](https://rybbit.com/docs/api/getting-started#time-parameters)
defines three alternatives:

1. `start_date` and `end_date`, interpreted with `time_zone`.
2. `start_datetime` and `end_datetime`, where `end_datetime` is exclusive.
3. `past_minutes_start` and `past_minutes_end`, where the start is the older boundary and must be larger.

The HTTP validator rejects a present-but-incomplete or malformed pair, while
absent parameters are accepted as all-time. [`query-validation.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/query-validation.ts#L93-L165)

**Mismatch:** the same documentation says all endpoints "require" one of the
three forms and that `time_zone` is required with date and exact datetime ranges,
but the source explicitly calls no time parameters a legitimate all-time query
and defaults a missing timezone to `UTC`. [`timeWindow.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/timeWindow.ts#L82-L99,L165-L214)

### Boundary behavior

- **Date range:** `start_date` starts at local midnight, and a non-current `end_date` ends at the next local midnight, so the named end date is included. If `end_date` is today in the selected timezone, the upper bound is `now`, not tomorrow's midnight. [`timeWindow.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/timeWindow.ts#L278-L300)
- **Exact datetime:** `timestamp >= start_datetime AND timestamp < end_datetime`; accepted timezone suffixes are normalized to a UTC instant before ClickHouse evaluation. [`timeWindow.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/timeWindow.ts#L71-L80,L303-L305)
- **Relative minutes:** `timestamp > older_boundary AND timestamp <= newer_boundary`. Therefore the lower bound is exclusive and the newer bound is inclusive, unlike the exact-datetime form. [`timeWindow.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/timeWindow.ts#L146-L149,L195-L209,L307-L309)
- **Precedence:** if more than one complete mode is supplied, source precedence is date range, then exact datetime, then relative minutes. [`timeWindow.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/timeWindow.ts#L352-L360)
- **All-time:** no usable window produces no time predicate and no fill clause. [`timeWindow.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/timeWindow.ts#L214-L224,L312-L315)

### Endpoint exceptions

The event log has two cursor modes in addition to common ranges: `since_timestamp`
polls for newer events, and `before_timestamp` pages backward from a timestamp.
The official [events documentation](https://rybbit.com/docs/api/events/list) describes
both. In source, the polling mode uses only `since_timestamp`; the ordinary cursor
mode applies the shared time helper only when `start_date` or `end_date` is present.
Consequently, exact datetime and `past_minutes_*` parameters are validated but do
not bound the ordinary event cursor query in this snapshot. [`getEvents.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/events/getEvents.ts#L77-L133)

The live-user endpoint is a separate trailing window: it defaults to five minutes
and counts events with `timestamp > now() - minutes`. It does not use the common
time-window helper. [`live-visitors`](https://rybbit.com/docs/api/overview/live-visitors), [`getLiveUsercount.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/getLiveUsercount.ts#L10-L29)

## Granularity and Buckets

The [overview time-series endpoint](https://rybbit.com/docs/api/overview/time-series)
defaults to `hour` and accepts:

`minute`, `five_minutes`, `ten_minutes`, `fifteen_minutes`, `hour`, `day`, `week`,
`month`, and `year`. [`time.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/shared/src/time.ts#L1-L10)

Buckets are truncated in the requested timezone using ClickHouse
`toStartOf...` functions. For bounded queries, `WITH FILL` creates zero rows for
empty buckets; all-time queries do not fill. [`timeWindow.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/timeWindow.ts#L261-L276,L312-L349)

The overview series has different grains inside one response:

- Sessions are grouped by each session's `MIN(timestamp)` (`start_time`), so a session belongs to the bucket where it started.
- Pageviews are counted by event `timestamp`.
- Users are distinct effective user IDs by event bucket, so a user can appear in more than one bucket and summing bucket users is not a period-wide unique count.

[`getOverviewBucketed.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/getOverviewBucketed.ts#L18-L83)

Custom-event time series use the same bucket vocabulary and timezone truncation,
but first select the top event names by count over the requested range and then
return counts by `(time, event_name)`. The endpoint limits the selected names to
1-10 and defaults to 5. [`getEventBucketed.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/events/getEventBucketed.ts#L24-L69)

## Metrics and Unique Counts

The official [overview documentation](https://rybbit.com/docs/api/overview/overview)
defines `sessions`, `pageviews`, `users`, `pages_per_session`, `bounce_rate`, and
`session_duration`. The official [definitions page](https://rybbit.com/docs/definitions)
describes unique users as distinct IDs, sessions as ending after 30 minutes of
inactivity, pageviews as page loads/reloads, and bounce rate as a one-page session.

The implemented overview query is more precise:

- `sessions` is the number of session IDs remaining after the time window and filters.
- `pageviews` is the sum of pageview events in those qualifying, filtered rows.
- `users` is `COUNT(DISTINCT COALESCE(NULLIF(identified_user_id, ''), user_id))`.
- `pages_per_session` averages the session's full pageview count, even when a filter narrowed which events qualified the session.
- `bounce_rate` is the percentage of qualifying sessions whose full session pageview count is exactly one.
- `session_duration` averages `MAX(timestamp) - MIN(timestamp)` over the filtered events in each qualifying session.

[`siteMetrics.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/siteMetrics/siteMetrics.ts#L74-L126)

This creates an important filter caveat: with filters, `pages_per_session` and
`bounce_rate` use the session's unfiltered pageview total, while `pageviews` and
session duration use the filtered event set. They are not necessarily reducible
to `pageviews / sessions` or the duration of the full session.

**Mismatch:** the definitions page says a bounce is one page "without any
interaction," but the overview SQL checks only pageview count. No interaction
absence test is part of that query. [`definitions.mdx`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docs/content/docs/%28docs%29/definitions.mdx#L18-L25)

### Effective identity

The shared identity expression is:

```text
COALESCE(NULLIF(identified_user_id, ''), user_id)
```

An identified user ID therefore takes precedence over the anonymous device
fingerprint; anonymous rows fall back to `user_id`. The source notes that an event
before `identify()` and a later identified event can still count as two users in a
window because the event-level rows carry different identities. [`effectiveUserId.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/effectiveUserId.ts#L1-L40)

Most dimensional metrics count distinct sessions. The [metric documentation](https://rybbit.com/docs/api/overview/metric)
states that `count` is "number of unique sessions" for a dimension, while
`event_name` is the exception and counts total event occurrences. Source confirms
the distinction: `event_name` uses `COUNT(*)`; pathname, page title, and generic
dimensions use `COUNT(DISTINCT session_id)`. [`getMetric.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/getMetric.ts#L69-L99,L102-L167,L247-L404)

For `event_name`, source computes `percentage` from distinct sessions even though
`count` is event occurrences. This is documented as a percentage of total sessions
but is not the same denominator as the displayed count. [`getMetric.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/getMetric.ts#L83-L98)

## Filters and Dimensions

The [filter contract](https://rybbit.com/docs/api/getting-started#filter-parameters)
is a JSON-encoded array of `{ parameter, type, value }` objects. Source accepts
these parameters: browser, operating system, language, country, region, city,
device type, referrer, hostname, pathname, page title, query string, event name,
channel, UTM fields, entry/exit page, screen dimensions, browser/OS version,
`user_id`, latitude/longitude, timezone, tag, and `feature_flag:<name>`. [`filters.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/shared/src/filters.ts#L17-L47)

Supported operators in source are equals, not-equals, contains, not-contains,
starts-with, ends-with, regex, not-regex, null/not-null, and numeric comparisons
(`>`, `<`, `>=`, `<=`). Regex patterns are validated and capped at 500
characters. [`query-validation.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/query-validation.ts#L9-L27,L64-L75,L94-L148)

Composition rules are:

- Multiple filter objects are ANDed.
- Multiple values in a positive filter are ORed.
- `not_equals` and `not_contains` values are ANDed to implement NOT-IN semantics.
- `user_id` equality can match either the identified ID or the anonymous fingerprint, but the fingerprint branch is limited to rows without an identified ID.
- `event_name` and `channel` default to session-level subqueries. `entry_page` and `exit_page` are also session-level; the sessions endpoint additionally treats pathname, page title, and query string as session-level filters. A matching event can therefore qualify an entire session rather than only the matching row.

[`getFilterStatement.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/getFilterStatement.ts#L34-L35,L77-L124,L195-L299), [`getSessions.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/sessions/getSessions.ts#L98-L108)

Session attribution is also dimension-specific: referrer is the first non-empty
referrer, and channel is the first attributed channel, falling back to the first
event's channel. [`sessionAttribution.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/sessionAttribution.ts#L1-L20)

## Sorting and Pagination

| Endpoint        | Default and controls                                                                                                                                                      | Ordering/cursor semantics                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview metric | `limit=100`, `page=1`; response is `{ data, totalCount }`.                                                                                                                | Source orders by count descending, then value ascending; no caller-selected sort. [`metric docs`](https://rybbit.com/docs/api/overview/metric), [`getMetric.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/getMetric.ts#L56-L68,L392-L403)                                                                                                             |
| Page titles     | `limit=10`; adding `page` changes the response to `{ data, totalCount }`.                                                                                                 | Count descending; source does not add a value tie-breaker. [`page-title docs`](https://rybbit.com/docs/api/overview/page-titles), [`getPageTitles.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/getPageTitles.ts#L34-L49,L110-L151)                                                                                                                   |
| Sessions        | `limit=100`, `page=1`.                                                                                                                                                    | Aggregation orders by `session_end DESC`, then applies `LIMIT/OFFSET`; no sort controls are documented. [`sessions docs`](https://rybbit.com/docs/api/sessions/list), [`getSessions.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/sessions/getSessions.ts#L81-L98,L153-L195)                                                                          |
| Users           | `page_size=100`, `page=1`; `sort_by` is `first_seen`, `last_seen`, `pageviews`, `sessions`, or `events`; `sort_order` is `asc` or `desc`, defaulting to `last_seen desc`. | Response includes `totalCount`, `page`, and `pageSize`; invalid sort values fall back to the defaults in source. [`users docs`](https://rybbit.com/docs/api/users/list), [`getUsers.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/users/getUsers.ts#L46-L73,L146-L153,L194-L228)                                                                      |
| Events          | `page_size=50`.                                                                                                                                                           | Newest first. `before_timestamp` is a backward cursor; `since_timestamp` is a realtime poll capped at 500. Non-poll responses include `hasMore` and `oldestTimestamp`, not a total count. [`events docs`](https://rybbit.com/docs/api/events/list), [`getEvents.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/events/getEvents.ts#L77-L133,L138-L160) |

Offset pagination uses `(page - 1) * limit` and runs a separate count query for
paginated metric/user/page-title surfaces. The shared helper emits no offset for
page 1 and defaults invalid limits/pages rather than returning a validation error.
[`analyticsQuery.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/analyticsQuery.ts#L49-L95)

## Public and Shared Analytics

Public Analytics (`sites.public`) and a valid private-link key use the same
public-site access helper. The route registry places overview, time series,
metrics, page titles, sessions, events, and users behind those public read chains;
the helper then authorizes either the public flag or an exact private-key header.
[`index.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/index.ts#L212-L240,L347-L370), [`auth-utils.ts`](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/lib/auth-utils.ts#L448-L480)

The official [Public Analytics documentation](https://rybbit.com/docs/site-settings#public-analytics)
describes the access as read-only, and the [Dashboard Embed documentation](https://rybbit.com/docs/embeds/dashboard#requirements)
says anyone with a private link can view the dashboard. In the inspected source,
sharing changes authorization, not the time range, metric grain, filter language,
pagination, or response field set. **Inference:** a shared viewer should be
treated as able to issue the same query forms as an authenticated analytics
viewer unless Cimi adds a separate sharing scope.

## Unknowns and Risks

1. The deployed Cloud version may differ from the checked-in commit; the official API docs explicitly call the API beta.
2. Documentation says time parameters are required, while source permits all-time queries and defaults a missing timezone to UTC. Cimi should choose one canonical rule rather than copy this ambiguity.
3. Event cursor mode does not apply exact datetime or relative-minute bounds in this source snapshot, despite common-parameter validation.
4. "Unique users" is unique effective IDs, with fingerprint collisions/splits and possible pre-/post-identification splits; it is not a verified count of human individuals.
5. Source does not establish a stable tie-breaker for session or page-title offset pagination, so concurrent ingestion can make page boundaries unstable.
6. The metric endpoint's event-name count and percentage use different grains, and the public definition of bounce rate is broader than the SQL implementation. These need explicit Cimi metric definitions if compatibility is desired.

## Cimi Reference Takeaways

- Make every range explicitly half-open or explicitly inclusive, including relative windows and date-only end dates.
- Carry the display timezone into both predicates and bucket truncation; define whether missing timezone means UTC, site timezone, or invalid input.
- Model metric grain separately: event count, session count, unique effective identity, and session-start bucket are not interchangeable.
- Define filter scope per endpoint, especially whether event properties qualify a session and whether filtered metrics use full-session denominators.
- Prefer cursor pagination with a unique tie-breaker for event-like rows; if using offsets, return a deterministic total ordering and document snapshot behavior.
- Treat public/shared access as a separate data-scope policy. A read-only gate alone does not make drill-down, traits, query strings, or raw events aggregate-safe.
