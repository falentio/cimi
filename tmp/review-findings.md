# Review findings status

## Resolved P1. Cached public results bypassed current suppression

`apps/api/src/resources/public-dashboard/service.ts` now keys response caching by the complete query, current freshness witness, and a persisted monotonic projection generation. Stale admissions and tickets without a generation bypass the cache. A changed generation forces `PublicDashboardAggregatePlanner.execute()` to rerun current `k=5` suppression; `statisticsRefreshedAt` remains observability data rather than cache identity.

Regression coverage lives in `apps/api/src/resources/public-dashboard/testing/service.query.test.ts` and covers changed suppression with identical sequence and coverage, stale freshness, expiry, revocation, and cache bounds. DuckDB coverage proves the generation advances across same-timestamp rebuilds, retention deletion, and purge/rebuild.

## Resolved P1. Event ingestion lost the transport source IP

`apps/api/src/resources/event-ingestion/router.ts` now overlays the API boundary's canonical `context.sourceIp` for both `collectEvent` and `collectEvents`. Trusted proxy behavior remains in `extractRequestContext`; the router does not resolve forwarded headers again.

`apps/api/src/resources/event-ingestion/testing/router.test.ts` proves both handlers receive the transport peer address even when `X-Forwarded-For` disagrees.

## Resolved P2. The public rate limiter retained expired keys

`apps/api/src/resources/public-dashboard/protection.ts` now sweeps both fixed-window maps once when traffic enters a new minute. It removes only entries from older windows and preserves Site-before-IP failure ordering.

`apps/api/src/resources/public-dashboard/testing/protection.test.ts` proves old Site and IP keys are removed on rollover.

## Resolved P2. The event-ingestion context test violated the test-layout rule

`apps/api/src/resources/event-ingestion/testing/router-context.test.ts` now has one top-level `describe` with nested suites for the three request-context functions.

## Resolved P1. Current-line legacy dashboard sentinels were not canonicalized

`packages/db/src/migrations/0015_normalize_legacy_public_dashboard.sql` converts exact `legacy-<hash>` placeholders to `enabled = 0` and `public_identifier = NULL`, preserving the stored hash and allowing the existing administrator-driven rotation path to repair the row.

`packages/db/src/client/testing/client.test.ts` proves exact matching and leaves ordinary disabled identifiers unchanged.

## Open P1. Pre-squash control databases remain unsupported

Databases with the exact pre-squash `471c10d` migration history are still rejected by `packages/db/src/migrate.ts` before the current-line repair can run. The old lineage has schema differences beyond the public-dashboard sentinel, so accepting it by rewriting `__drizzle_migrations` or matching table names would risk applying current migrations to an incompatible schema.

Supporting that lineage requires a separately designed, transactional schema bridge with exact journal and schema validation. This pass keeps the migration boundary fail-closed rather than claiming an unsafe upgrade.

## Pre-existing scope issue

`apps/api/src/resources/traffic-report/service.ts` and `apps/api/src/resources/event-report/service.ts` still execute without an `analytics-read` lifecycle lease. This predates PR #108 and remains a separate follow-up.

## Verification

- 18 focused event-ingestion tests passed.
- 4 focused public rate-limit tests passed.
- 16 focused public-dashboard service tests passed.
- 72 focused API/kernel reporting, admission, aggregate, and evidence tests passed.
- 51 focused DuckDB projection, rebuild, and report-query tests passed.
- The complete 10-file focused regression suite passed: 101 tests.
- Narrow `vp check` passed on all changed TypeScript files.
- `git diff --check` passed.
