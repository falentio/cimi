---
status: accepted
---

# Canonical Analytics Query Semantics

Cimi analytics queries use inclusive Site-local calendar dates resolved through an explicit Site Reporting Timezone and Week Start, while evaluation uses an internal half-open interval. There is no independent coarse duration cap: Effective Retention is the data-availability horizon, every requested dependency must cover the complete current and comparison windows, and over-budget or uncertain preflight admission returns `QUERY_LIMIT_EXCEEDED`. Reports use named, non-additive metrics with explicit Event, Session, Visitor, or Identified User grain; bounded JSON filters with explicit scope; procedure-specific time buckets; zero-filled incomplete-aware series; and explicit current/previous comparison objects for all analytical reports. Pagination is zero-based live offset pagination with allowlisted sorting and documented best-effort page drift. This deliberately favors explicit domain semantics over copying incompatible vendor meanings from Plausible, Rybbit, Matomo, DataBuddy, Simple Analytics, or PostHog.

## Considered Options

- UTC-only half-open timestamps versus Site-local calendar dates: Site-local dates were chosen because reporting, weeks, months, and comparisons are calendar concepts for a Site.
- Cursor pagination versus offset pagination: zero-based offset pagination was chosen for one uniform first-release contract, accepting live-page drift and requiring deterministic allowlisted sorting.
- Coarse-range horizon: no independent maximum was chosen; Effective Retention wins for every requested dependency and `QUERY_LIMIT_EXCEEDED` rejects ranges that are unavailable, over budget, or not safely estimable.

## Consequences

- The old cursor vocabulary and `nextCursor` contract fields were replaced by the zero-based `nextOffset` contract before implementation.
- `displayTimezone` becomes `reportingTimezone`, and Sites require an explicit `weekStartsOn` preference with a Monday default.
- Analytical retention uses Occurrence Time; Receipt Time governs acceptance-journal, deduplication, and replay retention. Events older than the analytical retention cutoff are rejected at ingestion.
- Profile retention gates only profile-dependent reports and filters; Event retention gates Event, Session, Visitor, Goal, Funnel, and Cohort analytics; replay retention gates replay only.
- Authenticated preflight uses projection-checkpoint-aligned cardinality statistics and additive fact-work weights. Fixed budgets are 25M aggregate, 10M breakdown, 1M row-list, and 10M stateful Goal/Funnel/Cohort units; Public Query shares the aggregate budget.
- Preflight fails closed for stale statistics or affected Projection Gaps. There is no post-admission wall-clock timeout in the first-release query contract.
- The canonical metric catalog is recorded in [`docs/specs/analytics-reporting/METRICS.md`](../specs/analytics-reporting/METRICS.md) and must remain synchronized with query contracts before handlers or storage projections are implemented.
