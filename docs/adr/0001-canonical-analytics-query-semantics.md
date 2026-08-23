---
status: accepted
---

# Canonical Analytics Query Semantics

Cimi analytics queries use inclusive Site-local calendar dates resolved through an explicit Site Reporting Timezone and Week Start, while evaluation uses an internal half-open interval. The coarse-range horizon remains pending [Freeze the canonical query horizon and retention envelope](https://github.com/falentio/cimi/issues/25); effective retention and bounded planner cost remain enforced regardless of that decision. Reports use named, non-additive metrics with explicit Event, Session, Visitor, or Identified User grain; bounded JSON filters with explicit scope; procedure-specific time buckets; zero-filled incomplete-aware series; and explicit current/previous comparison objects for all analytical reports. Pagination is zero-based live offset pagination with allowlisted sorting and documented best-effort page drift. This deliberately favors explicit domain semantics over copying incompatible vendor meanings from Plausible, Rybbit, Matomo, DataBuddy, Simple Analytics, or PostHog.

## Considered Options

- UTC-only half-open timestamps versus Site-local calendar dates: Site-local dates were chosen because reporting, weeks, months, and comparisons are calendar concepts for a Site.
- Cursor pagination versus offset pagination: zero-based offset pagination was chosen for one uniform first-release contract, accepting live-page drift and requiring deterministic allowlisted sorting.
- Coarse-range horizon: issue #25 must choose between a fixed maximum query envelope and effective-retention-bounded queries; effective retention and `QUERY_LIMIT_EXCEEDED` remain mandatory safeguards either way.

## Consequences

- The old cursor vocabulary and `nextCursor` contract fields were replaced by the zero-based `nextOffset` contract before implementation.
- `displayTimezone` becomes `reportingTimezone`, and Sites require an explicit `weekStartsOn` preference with a Monday default.
- The canonical metric catalog is recorded in [`docs/specs/analytics-reporting/METRICS.md`](../specs/analytics-reporting/METRICS.md) and must remain synchronized with query contracts before handlers or storage projections are implemented.
