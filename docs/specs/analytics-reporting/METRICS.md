---
document: analytics-metrics
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Analytics Metric Catalog

**Audience:** Both

This is the canonical semantic catalog for metrics used by the authenticated
traffic, Event, Goal, Funnel, Cohort, and Public Dashboard reports. Procedure
specifications define which catalog entries they expose; this document defines
what each entry means.

## Common Rules

- Every metric instance declares one counting grain: Event, Analytics Session, Visitor, or Identified User. Goal, Funnel, and Cohort reports explicitly select Visitor or Identified User where applicable and never combine the two populations in one metric.
- Distinct Visitor and Identified User values are never silently coalesced.
- Counts are additive across disjoint time buckets only when the metric is marked additive. Distinct counts and rates must not be summed across buckets or dimensions.
- `Event` metrics use accepted Events and the validated Occurrence Time for placement. Receipt Time remains the acceptance-order field.
- `Analytics Session` metrics use server-authoritative Session boundaries. A repeated matching Event does not create another conversion within the same Session.
- `Visitor` metrics use the Site-scoped Visitor projection: the Anonymous Identity before identification or the linked Identified User after identification. `Identified User` metrics use the explicit Site-scoped opaque application ID and remain distinct from Visitor metrics.
- Profile filters are authenticated-only and limited to Site collection-policy-approved trait keys. Public Query never evaluates profile filters.
- Authenticated analytical reports have no independent coarse query horizon. Effective Retention is the data-availability horizon for each requested dependency; the full current and comparison windows must be covered, and unavailable history is rejected rather than clamped or partially returned. Public Query retains its separate 90-day and 2,161 hourly-start admission bounds.
- The `Visitor or Identified User` grain shown for Cohort metrics means one identity mode is selected explicitly for the report; a Cohort never combines both populations.
- `bounce_rate` counts a Session as bounced only when it has exactly one accepted `page_view`, no `custom_event` or `outbound` engagement, and a full occurrence span under 10 seconds; `identify` is not engagement.

## Query Admission

Authenticated and Public Query admission uses projection-checkpoint-aligned cardinality statistics and fails closed when statistics are stale, a Projection Gap's bounded Occurrence Time interval overlaps either the resolved current or comparison half-open Site interval, or a Site gap has no reliable time bound. The gap check runs before serving cached results. Fact-Work is an additive estimate based on fact cardinality, normalized bucket work, metrics, dimensions, filters, and distinct-count operations, weighted as base facts 1.0, extra metrics 0.25, bucket work 0.10, dimensions 0.50, filters 0.25, and distinct-count work 1.0. The fixed family budgets are 25M units for aggregate reports, 10M for breakdowns, 1M for row lists, and 10M for stateful Goal/Funnel/Cohort reports. Public Query shares the aggregate budget. `QUERY_LIMIT_EXCEEDED` is returned before cache or execution; no post-admission wall-clock timeout is part of the contract. Successful reports expose `current` or `stale` freshness only.

## Metric Definitions

| Metric                             | Grain                      | Numerator / denominator                                                                                                                       | Additivity                                 | Filter scope                                                  |
| ---------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `events`                           | Event                      | Count accepted Events                                                                                                                         | Additive across disjoint time buckets      | Event                                                         |
| `pageviews`                        | Event                      | Count accepted `page_view` Events                                                                                                             | Additive across disjoint time buckets      | Event                                                         |
| `sessions`                         | Analytics Session          | Count distinct Sessions intersecting the range                                                                                                | Non-additive across buckets and dimensions | Event, Session, Visitor, authenticated Profile                |
| `visitors`                         | Visitor                    | Count distinct Visitors intersecting the range                                                                                                | Non-additive across buckets and dimensions | Event, Session, Visitor, authenticated Profile                |
| `identified_users`                 | Identified User            | Count distinct Site-scoped Identified Users                                                                                                   | Non-additive across buckets and dimensions | Event, Session, Visitor, authenticated Profile                |
| `unique_sessions`                  | Analytics Session          | Count distinct Sessions containing a matching Event                                                                                           | Non-additive across buckets and dimensions | Event                                                         |
| `unique_visitors`                  | Visitor                    | Count distinct Visitors containing a matching Event                                                                                           | Non-additive across buckets and dimensions | Event                                                         |
| `bounce_rate`                      | Analytics Session          | Sessions with exactly one accepted `page_view`, no `custom_event` or `outbound` engagement, and duration under 10 seconds / eligible Sessions | Non-additive                               | Event, Session, Visitor, authenticated Profile                |
| `pages_per_session`                | Analytics Session          | Pageviews / Sessions                                                                                                                          | Non-additive                               | Event, Session, Visitor, authenticated Profile                |
| `average_session_duration_seconds` | Analytics Session          | Sum full Session occurrence spans / Sessions with a valid duration                                                                            | Non-additive                               | Event, Session, Visitor, authenticated Profile                |
| `goal_conversions`                 | Analytics Session          | Sessions matching one Goal action, counted once per Session                                                                                   | Additive across disjoint time buckets      | Goal action, Event, Session, Visitor, authenticated Profile   |
| `goal_conversion_rate`             | Analytics Session          | Converted Sessions / eligible Sessions                                                                                                        | Non-additive                               | Goal action, Event, Session, Visitor, authenticated Profile   |
| `funnel_step_entries`              | Analytics Session          | Sessions reaching a Funnel step in order within one Session                                                                                   | Non-additive across steps and buckets      | Funnel action, Event, Session, Visitor, authenticated Profile |
| `funnel_entry_rate`                | Analytics Session          | Step entries / Funnel entrants                                                                                                                | Non-additive                               | Funnel action, Event, Session, Visitor, authenticated Profile |
| `funnel_previous_step_rate`        | Analytics Session          | Step entries / previous-step entries                                                                                                          | Non-additive                               | Funnel action, Event, Session, Visitor, authenticated Profile |
| `cohort_size`                      | Visitor or Identified User | Distinct subjects entering at the first qualifying action                                                                                     | Non-additive across periods                | Cohort action, Event, Session, Visitor, authenticated Profile |
| `cohort_retained`                  | Visitor or Identified User | Distinct cohort subjects with the retention action in a period                                                                                | Non-additive across periods                | Cohort action, Event, Session, Visitor, authenticated Profile |
| `cohort_retention_rate`            | Visitor or Identified User | Retained subjects / cohort size                                                                                                               | Non-additive                               | Cohort action, Event, Session, Visitor, authenticated Profile |

## Public Catalog

Public Query exposes only these aggregate entries through its dedicated
contract. It never inherits the authenticated catalog wholesale.

| Category   | Values                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Metrics    | `visitors`, `sessions`, `pageviews`, `events`, `bounce_rate`                                                                                                                                                                                           |
| Dimensions | `time`, `page`, `referrer`, `utm`, `device`, `browser`, `os`, `country`, `region`, `city`, `event_name`, `identity_kind`                                                                                                                               |
| Filters    | Approved aggregate Event and Session fields plus `visitor.identityKind` with `equals` and values `anonymous`/`identified`; no profile scope, identity ID, raw IP, raw property, or sensitive URL/query field                                           |
| Bounds     | One-hour buckets, inclusive Site-local range of at most 90 days, at most 2,161 actual hourly interval starts after timezone resolution, at most 100 dimension rows, `k=5` suppression per segment and total, five-minute cache keyed by the full query |

If timezone resolution derives more than 2,161 hourly interval starts, Public Query returns `BAD_REQUEST` before cache or execution and never clamps the requested range.

Public time rows always carry an offset-qualified local `key` and a required UTC
`at` instant. Dimension rows use the separate non-bucket shape with `at: null`
and are limited by the 100-row budget; the hourly interval-start limit never
serves as a dimension-row limit.

## Traffic Trend and Breakdown Semantics

Every Traffic trend point carries `metric`, `grain`, `unit`, and `denominator`.
The allowed trend metrics are `visitors` (Visitor/count), `sessions`
(Analytics Session/count), `pageviews` (Event/count), `bounce_rate`
(Analytics Session/rate over eligible Sessions), `pages_per_session`
(Analytics Session/ratio over eligible Sessions), and
`average_session_duration_seconds` (Analytics Session/seconds over Sessions
with a valid duration). Count metrics use a null denominator.

Traffic overview periods return both `eligibleSessions` and
`sessionsWithValidDuration`. Eligibility applies the selected report range and
filters before metric evaluation; duration denominators include only Sessions
with a valid full occurrence span.

Traffic breakdown rows use the fixed `sessions` metric at Analytics Session
grain. `percentage` is each row's count divided by the filtered,
pre-pagination total, and `denominator` returns that total. Counts and
percentages are not additive across overlapping dimensions.

Event breakdown rows use accepted Events at Event grain. Their `count` is the
filtered pre-pagination count for the row's dimension value; the stable
dimension-value tie-breaker applies after the requested count/value sort.

## Procedure Ownership

| Procedure family              | Catalog entries                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Traffic overview              | `visitors`, `sessions`, `pageviews`, `bounce_rate`, `pages_per_session`, `average_session_duration_seconds` |
| Event overview and timeseries | `events`, `unique_visitors`, `unique_sessions`                                                              |
| Goal report                   | `goal_conversions`, `goal_conversion_rate`                                                                  |
| Funnel report                 | `funnel_step_entries`, `funnel_entry_rate`, `funnel_previous_step_rate`                                     |
| Cohort retention report       | `cohort_size`, `cohort_retained`, `cohort_retention_rate`                                                   |
| Public Query                  | Public Catalog only                                                                                         |

Unknown metric names, unsupported grains, unapproved filter scopes, and
requests that would silently combine Visitor and Identified User populations
are contract errors rather than implementation-defined behavior.
