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

- Every metric declares one counting grain: Event, Analytics Session, Visitor, or Identified User.
- Distinct Visitor and Identified User values are never silently coalesced.
- Counts are additive across disjoint time buckets only when the metric is marked additive. Distinct counts and rates must not be summed across buckets or dimensions.
- `Event` metrics use accepted Events and the validated Occurrence Time for placement. Receipt Time remains the acceptance-order field.
- `Analytics Session` metrics use server-authoritative Session boundaries. A repeated matching Event does not create another conversion within the same Session.
- `Visitor` metrics use the Site-scoped Anonymous Identity projection. `Identified User` metrics use the explicit Site-scoped opaque application ID.
- Profile filters are authenticated-only and limited to Site collection-policy-approved trait keys. Public Query never evaluates profile filters.
- There is no independent coarse query horizon. Effective Retention is the data-availability horizon for each requested dependency; the full current and comparison windows must be covered, and unavailable history is rejected rather than clamped or partially returned.

## Query Admission

Authenticated admission uses projection-checkpoint-aligned cardinality statistics and fails closed when statistics are stale or a requested range contains a known Projection Gap. Fact-Work is an additive estimate based on fact cardinality, normalized bucket work, metrics, dimensions, filters, and distinct-count operations. The fixed family budgets are 25M units for aggregate reports, 10M for breakdowns, 1M for row lists, and 10M for stateful Goal/Funnel/Cohort reports. Public Query shares the aggregate budget. `QUERY_LIMIT_EXCEEDED` is returned before execution; no post-admission wall-clock timeout is part of the contract.

## Metric Definitions

| Metric | Grain | Numerator / denominator | Additivity | Filter scope |
| --- | --- | --- | --- | --- |
| `events` | Event | Count accepted Events | Additive across disjoint time buckets | Event, Session, Visitor, authenticated Profile |
| `pageviews` | Event | Count accepted `page_view` Events | Additive across disjoint time buckets | Event, Session, Visitor, authenticated Profile |
| `sessions` | Analytics Session | Count distinct Sessions intersecting the range | Non-additive across buckets and dimensions | Event, Session, Visitor, authenticated Profile |
| `visitors` | Visitor | Count distinct Visitors intersecting the range | Non-additive across buckets and dimensions | Event, Session, Visitor, authenticated Profile |
| `identified_users` | Identified User | Count distinct Site-scoped Identified Users | Non-additive across buckets and dimensions | Event, Session, Visitor, authenticated Profile |
| `unique_sessions` | Analytics Session | Count distinct Sessions containing a matching Event | Non-additive across buckets and dimensions | Event, Session, Visitor, authenticated Profile |
| `unique_visitors` | Visitor | Count distinct Visitors containing a matching Event | Non-additive across buckets and dimensions | Event, Session, Visitor, authenticated Profile |
| `bounce_rate` | Analytics Session | Bounced Sessions / eligible Sessions | Non-additive | Event, Session, Visitor, authenticated Profile |
| `pages_per_session` | Analytics Session | Pageviews / Sessions | Non-additive | Event, Session, Visitor, authenticated Profile |
| `average_session_duration_seconds` | Analytics Session | Sum Session duration / Sessions with a valid duration | Non-additive | Event, Session, Visitor, authenticated Profile |
| `goal_conversions` | Analytics Session | Sessions matching one Goal action, counted once per Session | Additive across disjoint time buckets | Goal action, Event, Session, Visitor, authenticated Profile |
| `goal_conversion_rate` | Analytics Session | Converted Sessions / eligible Sessions | Non-additive | Goal action, Event, Session, Visitor, authenticated Profile |
| `funnel_step_entries` | Analytics Session | Sessions reaching a Funnel step in order within one Session | Non-additive across steps and buckets | Funnel action, Event, Session, Visitor, authenticated Profile |
| `funnel_entry_rate` | Analytics Session | Step entries / Funnel entrants | Non-additive | Funnel action, Event, Session, Visitor, authenticated Profile |
| `funnel_previous_step_rate` | Analytics Session | Step entries / previous-step entries | Non-additive | Funnel action, Event, Session, Visitor, authenticated Profile |
| `cohort_size` | Visitor or Identified User | Distinct subjects entering at the first qualifying action | Non-additive across periods | Cohort action, Event, Session, Visitor, authenticated Profile |
| `cohort_retained` | Visitor or Identified User | Distinct cohort subjects with the retention action in a period | Non-additive across periods | Cohort action, Event, Session, Visitor, authenticated Profile |
| `cohort_retention_rate` | Visitor or Identified User | Retained subjects / cohort size | Non-additive | Cohort action, Event, Session, Visitor, authenticated Profile |

## Public Catalog

Public Query exposes only these aggregate entries through its dedicated
contract. It never inherits the authenticated catalog wholesale.

| Category | Values |
| --- | --- |
| Metrics | `visitors`, `sessions`, `pageviews`, `events`, `bounce_rate` |
| Dimensions | `time`, `page`, `referrer`, `utm`, `device`, `browser`, `os`, `country`, `region`, `city`, `event_name` |
| Filters | Approved aggregate Event and Session fields only; no profile scope, identity ID, raw IP, raw property, or sensitive URL/query field |
| Bounds | One-hour buckets, inclusive Site-local range of at most 90 days, `k=5` suppression, five-minute cache |

## Procedure Ownership

| Procedure family | Catalog entries |
| --- | --- |
| Traffic overview | `visitors`, `sessions`, `pageviews`, `bounce_rate`, `pages_per_session`, `average_session_duration_seconds` |
| Event overview and timeseries | `events`, `unique_visitors`, `unique_sessions` |
| Goal report | `goal_conversions`, `goal_conversion_rate` |
| Funnel report | `funnel_step_entries`, `funnel_entry_rate`, `funnel_previous_step_rate` |
| Cohort retention report | `cohort_size`, `cohort_retained`, `cohort_retention_rate` |
| Public Query | Public Catalog only |

Unknown metric names, unsupported grains, unapproved filter scopes, and
requests that would silently combine Visitor and Identified User populations
are contract errors rather than implementation-defined behavior.
