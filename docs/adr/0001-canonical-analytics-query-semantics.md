---
status: accepted
---

# Canonical Analytics Query Semantics

Authenticated analytical reports use inclusive Site-local calendar dates resolved through an explicit Site Reporting Timezone and Week Start, while evaluation uses an internal half-open interval. They have no independent coarse duration cap: Effective Retention is the data-availability horizon, with retention cutoffs resolved at the Site-local start of day. Public Query is a separate aggregate contract that retains its independent maximum 90-day Site-local window and 2,161 actual hourly-start bound; a derived count above that bound returns `BAD_REQUEST` before cache or execution. Every requested dependency must cover the complete current and adjacent equal-length comparison windows, and over-budget, uncertain, or gapped preflight admission returns `QUERY_LIMIT_EXCEEDED`. Reports use named metrics with explicit Event, Session, Visitor, or Identified User grain and additivity; bounded JSON filters with explicit scope; procedure-specific time buckets; zero-filled incomplete-aware series; and explicit current/previous comparison objects for authenticated analytical report procedures only. Pagination is zero-based live offset pagination with allowlisted sorting, a stable ID tie-breaker, and documented best-effort page drift. This deliberately favors explicit domain semantics over copying incompatible vendor meanings from Plausible, Rybbit, Matomo, DataBuddy, Simple Analytics, or PostHog.

## Considered Options

- UTC-only half-open timestamps versus Site-local calendar dates: Site-local dates were chosen because reporting, weeks, months, and comparisons are calendar concepts for a Site.
- Cursor pagination versus offset pagination: zero-based offset pagination was chosen for one uniform first-release contract, accepting live-page drift and requiring deterministic allowlisted sorting followed by a stable ID tie-breaker.
- Coarse-range horizon for authenticated reports: no independent maximum was chosen; Effective Retention wins for every requested dependency and `QUERY_LIMIT_EXCEEDED` rejects ranges that are unavailable, over budget, or not safely estimable. Public Query remains governed by its separate 90-day and 2,161-start admission bounds.

## Consequences

- The old cursor vocabulary and `nextCursor` contract fields were replaced by the zero-based `nextOffset` contract before implementation. Pages use a stable ID tie-breaker after each allowlisted sort field.
- `displayTimezone` becomes `reportingTimezone`, and Sites require an explicit `weekStartsOn` preference with a Monday default.
- Analytical Event retention uses Occurrence Time; Receipt Time governs acceptance-journal, deduplication, and replay-source retention. Events older than the analytical Event cutoff are rejected at ingestion.
- `eventMonths` gates Event, Session, Visitor, Goal, Funnel, and Cohort analytics. `profileMonths` gates profiles, aliases, Traits, identity projections, Identified User metrics, and profile-dependent filters, with `profileMonths <= eventMonths`; replay retention gates replay and must be shorter than both non-replay horizons.
- Authenticated preflight uses projection-checkpoint-aligned cardinality statistics and additive fact-work weights: base facts 1.0, extra metrics 0.25, bucket work 0.10, dimensions 0.50, filters 0.25, and distinct-count work 1.0. Fixed budgets are 25M aggregate, 10M breakdown, 1M row-list, and 10M stateful Goal/Funnel/Cohort units; Public Query shares the aggregate budget.
- Preflight fails closed for stale statistics or a Projection Gap whose bounded Occurrence Time interval overlaps either the resolved current or comparison half-open Site interval; an unbounded gap blocks the whole Site. Gap checks run before serving cached results. Successful reports expose only `current` or `stale` freshness; there is no post-admission wall-clock timeout in the first-release query contract.
- Public Query is not covered by the authenticated no-coarse-cap rule: its independent calendar-window and hourly-start bounds remain admission checks and are never silently clamped.
- The canonical metric catalog is recorded in [`docs/specs/analytics-reporting/METRICS.md`](../specs/analytics-reporting/METRICS.md) and must remain synchronized with query contracts before handlers or storage projections are implemented.
