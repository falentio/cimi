I have everything I need. Here are my findings.

# DuckDB Derived Projection — Explorer Report

## Components Found

### `packages/db/src/duckdb/index.ts` (1507 lines) — the projection itself

**Public surface** — `AnalyticsDb` interface, lines 113–126:

| Method | Line | Notes |
|---|---|---|
| `ready()` | 114 / impl 188 | Store-level probe |
| `rebuild({ controlDb })` | 115 / impl 341 | Full re-derivation |
| `deleteExpired({ siteId, occurrenceCutoff })` | 116 / impl 643 | Returns deleted count |
| `purgeSite({ siteId })` | 117 / impl 840 | Site teardown |
| `readProjectionSnapshot({ siteId })` | 118 / impl 216 | Checkpoint + gaps + live count |
| `readReportData({ siteId, from, toExclusive })` | 119 / impl 279 | Events + sessions |
| `readWindowed<T>(work)` | 124 / impl 324 | Generic read escape hatch |
| `close()` | 125 / impl 868 | Via close controller |

`createAnalyticsDb(options)` at line 136 opens `DuckDBInstance.create(options.path, {...})` (line 140) with `threads`/`memory_limit`/`temp_directory`/`max_temp_directory_size` defaults `1`/`512MB`/`<dir>/analytics.duckdb.tmp`/`1GB` (lines 137–145), then takes **exactly one connection** (line 150) and calls `applyMigrations(connection)`.

Closure state at lines 162–164 — the whole serialization machinery:
```ts
let unavailable = false
let rebuilding  = false
let serial: Promise<void> = Promise.resolve()
```

`enqueue<T>` (lines 166–174) is a promise chain: `serial.then(work, work)` — note the **same `work` runs on both fulfil and reject paths**, so a failed predecessor does not poison the queue.

**`ready()`** (188–215) returns false if `!closeController.isOpen() || unavailable || rebuilding`, then counts `information_schema.tables` against `ANALYTICS_REQUIRED_TABLES` (7 tables), then asserts zero rows of `projection_checkpoints` with `projection_version <> ANALYTICS_PROJECTION_VERSION`. Any throw → `false`.

**`readProjectionSnapshot`** (216–278) runs three queries inside one `enqueue`: checkpoint row, `projection_gaps WHERE status = 'open' ORDER BY id`, and live `count(*) FROM events WHERE site_id = ?`. Maps to `AnalyticsProjectionCheckpoint` / `AnalyticsProjectionGap` / `factCardinality`.

**`readReportData`** (279–323) reads `analytics_sessions` and `events` for the window; `exit_page` is a correlated subquery (last event by `occurrence_time DESC, event_id DESC`). Note `region`/`city` are **not** populated by rebuild — only `country` is.

**`readWindowed`** (324–340) wraps an `AnalyticsWindowReader` whose `read` returns `getRowObjects()`; this is the only DuckDB surface the reporting queries use.

**`rebuild`** (341–642) — see Flow.

**`deleteExpired`** (643–839) — see Flow.

**`purgeSite`** (840–867) — `nextProjectionGeneration` → `writeProjectionGeneration` **first**, then deletes all 7 table families for the site. Survives its own checkpoint deletion: the generation lives in `projection_generations`, so a purge still bumps the generation. Test asserts double-purge is idempotent (duckdb.test.ts:769–771).

**Row interfaces**, lines 874–1004: `EventRow`, `PropertyRow`, `IdentityEpochRow`, `IdentityLinkRow`, `IdentityRedactionRow`, `Identities`, `ProjectedCheckpointRow`, `GapRow`, `VisitorRow`, `SessionRow`.

**Module helpers**: `readEvents` 1006, `readProperties` 1071, `readIdentities` 1084, `readActiveSiteIds` 1126, `foldProjectedCheckpoints` 1141, `readProjectionGenerations` 1189, `nextProjectionGeneration` 1209, `writeProjectionGeneration` 1224, `readProjectionGaps` 1238, `projectEventIdentity` 1252, `propertyValue` 1325, `timestamp` 1335, `readInstant` 1344, `readRequiredInstant` 1361, `readReportSession` 1369, `readReportEvent` 1391, `readReportProperties` 1421, `readGapRows` 1444, `closeResources` 1453, `applyMigrations` 1466.

`applyMigrations` (1466–1507) owns a private `schema_migrations` table, applies `ANALYTICS_MIGRATIONS` not in the applied set, one row per migration inside a transaction. It is **not** the drizzle `schema_migrations` the control DB uses — separate namespace in a separate store.

### `packages/db/src/duckdb/schema.ts` (174 lines)
- `ANALYTICS_REQUIRED_TABLES` (7–15): `visitors`, `analytics_sessions`, `events`, `event_properties`, `projection_checkpoints`, `projection_generations`, `projection_gaps`.
- `ANALYTICS_PROJECTION_VERSION = 'v5'` (17).
- `ANALYTICS_MIGRATIONS` (19–173), 5 versions:
  - v1 `analytics-core` — all 6 core tables + 7 indexes.
  - v2 `event-identity-and-attribution` — `events.anonymous_identity_id`, `events.bot_policy_outcome`.
  - v3 `event-attribution` — utm/device/browser/os/country columns.
  - v4 `projected-fact-cardinality` — `projection_checkpoints.projected_fact_cardinality`.
  - v5 `projection-generation` — `projection_checkpoints.projection_generation` + the whole `projection_generations` table, and `UPDATE projection_checkpoints SET projection_generation = 0 WHERE projection_generation IS NULL`.

`projection_checkpoints` columns (93–103): `site_id` PK, `projected_replay_sequence`, `occurrence_covered_from`, `occurrence_covered_through`, `effective_retention_from`, `statistics_refreshed_at`, `readiness` (default `'ready'`), `projection_version` NOT NULL, `updated_at` NOT NULL. v4 adds `projected_fact_cardinality`; v5 adds `projection_generation`.

`projection_generations` (167–171): `site_id` PK, `projection_generation` NOT NULL, `updated_at` NOT NULL. A separate high-water mark table, independent of whether a checkpoint exists.

`projection_gaps` (105–114): `id` PK, `site_id`, `occurrence_from`, `occurrence_to`, `unbounded`, `status` (default `'open'`), `observed_at`, `resolved_at`.

`events` (55–80) carries `replay_sequence BIGINT NOT NULL UNIQUE` — a **global** uniqueness constraint, not per-site. And `properties_json JSON` (74).

### `packages/db/src/duckdb/close-progress.ts` (122 lines)
`createDuckDbCloseController({ operations: { checkpoint, closeConnection, closeInstance }, schedule })` (33). Lifecycle enum `'open' | 'closing' | 'retryable-failure' | 'closed'` (31); `isOpen()` is `lifecycle === 'open'` (48). Close is a resumable state machine (`CloseProgress`, 12–29) so a failed close can be retried — `closePromise` reset to `undefined` on failure (114) and `lifecycle = 'retryable-failure'`.

### `packages/db/src/duckdb/reporting-query.ts` (1180 lines)
`DuckDbReportingQuery implements ReportingQueryPort` (120), ctor takes `{ analytics: AnalyticsDb }` (43–45, 121). Six methods — `trafficAggregate` 123, `trafficBreakdown` 144, `eventOverview` 163, `eventBuckets` 199, `eventRows` 259, `eventBreakdown` 275 — **all** wrap `this.deps.analytics.readWindowed(...)`. Internals: `EVENT_COLUMNS` 54, `SESSION_COLUMNS` 68, `IDENTITY_KIND_TO_STORE` 81, `EVENT_FIELD_MAX_LENGTHS` 98, `EVENT_PROPERTIES_MAX_KEYS = 64` 107. Exports `RenderedFragment` (49) and `renderFilterPlan` (867) — re-used by the dashboard module. It reads only the 5 derived fact tables, never the control DB.

### `packages/db/src/duckdb/public-dashboard-query.ts` (330 lines)
`DuckDbPublicDashboardQuery` (28) — `countDimensionValues` 31, `countDistinctVisitors` 56, `aggregate` 76, all through `readWindowed`, all reusing `renderFilterPlan` with `PUBLIC_EVENT_COLUMN_OVERRIDES`.

### Kernel / admission
- `packages/kernel/src/reporting/admission.ts` (332 lines) — `ReportingAdmissionService`, `admit` 34, `prepare` 46, `admitPrepared` 84, `#readFacts` 145, `readPort` 200.
- `packages/kernel/src/reporting/ports.ts` — port contracts 13–56, `ReportingEvidencePort` 79, `ReportingAdmissionDependencies` union 94–101.
- `packages/kernel/src/reporting/interval.ts:119` `findRelevantProjectionGap`.
- `packages/db/src/identity/coverage.ts:30` `linkCoversEvent`.

### Adapter bridging DuckDB to the kernel
`apps/api/src/resources/traffic-report/evidence.drizzle-duckdb.ts` — `ReportingEvidenceDrizzleDuckDb.read` (22) calls `analytics.readProjectionSnapshot` (23), reads retention from the **control** DB (65–72), and computes `resolveStatistics` (100–125): `aligned` iff `readiness === 'ready'` **and** `projectedFactCardinality === factCardinality`; `stale` otherwise; `unknown` when checkpoint is null or not ready.

## Flow

### 1. Events: SQLite journal → DuckDB

There is **no incremental path today**. `rebuild()` is a bulk re-read:

**Read phase** (rebuild lines 351–355, synchronous, from the `Db` passed in):
```
readEvents       → events: EventRow[]
readProperties   → properties: PropertyRow[]
readIdentities   → identities: Identities (epochs, links, redactions)
readActiveSiteIds→ activeSiteIds: string[]
readProjectionGaps → gaps: GapRow[]
```

`readEvents` (1006–1069) is the **7-join skeleton** — 1 `JOIN site s` (inner, `s.status = 'active'`) + 7 `LEFT JOIN`s = 8 join clauses total:

```
FROM accepted_event ae
JOIN site s               ON s.id = ae.site_id AND s.status = 'active'
LEFT JOIN event_page_view epv     ON epv.event_pk = ae.event_pk
LEFT JOIN event_payload payload   ON payload.event_pk = ae.event_pk
LEFT JOIN event_custom ec         ON ec.event_pk = ae.event_pk
LEFT JOIN event_outbound eo       ON eo.event_pk = ae.event_pk
LEFT JOIN event_performance ep    ON ep.event_pk = ae.event_pk
LEFT JOIN event_error ee          ON ee.event_pk = ae.event_pk
LEFT JOIN retention_effective_cutoff rc ON rc.site_id = ae.site_id
WHERE (rc.site_id IS NULL OR ae.occurrence_time >= rc.event_occurrence_cutoff_at)
  AND NOT EXISTS (SELECT 1 FROM site_tombstone st WHERE st.site_id = ae.site_id)
ORDER BY ae.replay_sequence
```
The one-table-per-kind shape is why `LEFT JOIN` is required — `accepted_event` has exactly one child row per event kind. `name` is `COALESCE(ec.name, eo.name, ep.name, ee.name)`. Attribution is then re-derived in JS (1044–1067): `mergeEventAttribution(<accepted_event columns>, parseEventAttribution(canonicalPayloadJson))` — column wins, canonical payload fills gaps.

`readProperties` (1071) is flat: all rows from `event_property ORDER BY event_pk, property_key`, grouped into `propertiesByEvent` in JS (357–366) and stored as one `properties_json` JSON blob on the event.

**Transform phase** (368–461):
- `events.filter(e => e.projectionState !== 'failed').map(e => projectEventIdentity(e, identities))` (368–370) — `failed` events are dropped, `projected`/`pending` are all treated as candidates.
- `projectEventIdentity` (1252–1323) resolves a profile epoch: link-covered epochs (via `linkCoversEvent`, matching on `anonymousIdentityId`, session, and a receipt-time window) take priority over temporal epochs (matched on `identifiedUserId` + occurrence time inside `started_at`/`ended_at`); `>1` candidate throws `'Ambiguous identity Profile Epoch'`; links with no epoch throw `'Identity link references a missing or missing or mismatched Profile Epoch'`. Redacted / non-active-profile / `epochStatus = 'redacted'` → both `identifiedUserId` and `profileId` nulled.
- `previousGenerations = await readProjectionGenerations(connection)` (372) — reads **before** the write transaction.
- `foldProjectedCheckpoints(activeSiteIds, projectedEvents, Date.now(), previousGenerations)` (374) folds per-site: `projectedReplaySequence` = max replay_sequence, `projectedFactCardinality` = event count, `occurrenceCoveredFrom/Through` = min/max occurrence, `readiness: 'ready'` **hardcoded** (1182), `projectionVersion: 'v5'`, `effectiveRetentionFrom: null`. **Every active site gets a checkpoint row, even with zero events** (duckdb.test.ts:531–540 asserts `ste-2` gets `projected_replay_sequence: 0`, `projected_fact_cardinality: 0`).
- visitors and sessions are folded in JS from the same `projectedEvents` (384–461). Sessions: `startedAt`/`endedAt` min/max, `entryPage` and all attribution fields taken from the **earliest** event (`earlier || session.X === null`, 441–459). Visitors: `identityKind` flips to `'identified'` on any identified event (401); `profileId` is set to `null` when two different profiles collide (403–406).

**Write phase** (463–628), one DuckDB transaction:
```
BEGIN TRANSACTION
DELETE FROM event_properties         (full table, no site predicate)
DELETE FROM events
DELETE FROM analytics_sessions
DELETE FROM visitors
DELETE FROM projection_checkpoints
DELETE FROM projection_gaps
-- then insert, in this order:
INSERT INTO events                  (per event, bound params; properties_json = JSON.stringify or null)
INSERT INTO visitors                (per visitor)
INSERT INTO analytics_sessions      (per session; region/city always null — lines 559-560)
INSERT INTO projection_checkpoints  (per site) + writeProjectionGeneration
INSERT INTO projection_gaps         (per gap)
INSERT INTO event_properties ... SELECT ... FROM events WHERE event_pk = ?
COMMIT
```
Rollback on any failure (629–637) — and if the `ROLLBACK` itself throws, `unavailable = true` (633), which poisons every subsequent method. `finally { rebuilding = false }` (638–640).

The **`INSERT ... SELECT`** for properties is line 612–626: it does not insert `site_id`/`event_id` as literals; it looks them up from the already-inserted `events` row by `event_pk`, so the site/event identity is copied from the fact table rather than from SQLite. This is the only `INSERT ... SELECT` in rebuild.

### 2. `projection_checkpoints` writers

Exactly three:

| Writer | Line | What it sets |
|---|---|---|
| `rebuild` INSERT | 565–585 | All columns incl. `projected_fact_cardinality`, `projection_generation`, `effective_retention_from = null`, `readiness = 'ready'`, `projection_version = 'v5'` |
| `deleteExpired` UPDATE | 804–824 | `projection_generation`, `occurrence_covered_from/through` (min/max of surviving events), `projected_fact_cardinality` (count of surviving), `effective_retention_from = cutoff`, `statistics_refreshed_at = current_timestamp`, `updated_at = current_timestamp`. `readiness` untouched. |
| schema migration v5 | 165 | Backfill `projection_generation = 0` where NULL |

### 3. `projection_generation` — the max+1 rule

Three functions, in ascending scope:

- **`foldProjectedCheckpoints` line 1177** — the rebuild rule: `(previousGenerations.get(siteId) ?? 0) + 1`. Flat +1 over the folded map.
- **`readProjectionGenerations` 1189–1207** — `SELECT site_id, projection_generation FROM projection_generations UNION ALL SELECT site_id, projection_generation FROM projection_checkpoints`, then `Math.max` per site. Reading the map *before* the write transaction is what makes the rebuild rule safe against the `purgeSite` case (which deletes the checkpoint but leaves the generation row).
- **`nextProjectionGeneration` 1209–1222** — the incremental rule, for `deleteExpired` and `purgeSite`:
```sql
SELECT greatest(
  coalesce((SELECT max(projection_generation) FROM projection_generations WHERE site_id = ?), 0),
  coalesce((SELECT max(projection_generation) FROM projection_checkpoints WHERE site_id = ?), 0)
) + 1 AS next_generation
```
The **`projection_generations` table exists purely so the generation survives checkpoint deletion** — without it, purging a site and rebuilding would restart at generation 1, which would make a stale `projectionGeneration` pin look fresh. `writeProjectionGeneration` (1224–1236) is delete-then-insert (not upsert), a single-row high-water mark.

Invariant pinned by projection-read.test.ts:82–108 — rebuild → 1, rebuild → 2, purge → (generation 3, no checkpoint), rebuild → **4**. Not 3 and not 1.

### 4. Readiness, gaps, and admission

Two different "readiness" notions:

**Store readiness** (`ready()`, index.ts:188) is `isOpen ∧ ¬unavailable ∧ ¬rebuilding ∧ all-tables-present ∧ no-stale-version`. Consumed by `apps/api/src/health.ts:189` inside `readStoreHealth` (159–), which is the single probe both `systemHealthHandler` and the reporting readiness port read (doc comment 154–158). `apps/api/src/resources/traffic-report/readiness.ts:14 createReportingReadinessPort` wraps it into `AnalyticsReadinessPort.getHealth()`, returning `{ controlStore, analyticsStore }`. `ReportingAdmissionService.prepare` (admission.ts:47–51) throws `serviceUnavailable('analytics-not-ready')` unless **both** are `'ready'`.

**Row readiness** (the `readiness` column) is typed `ready | rebuilding | unavailable` in SQLite (`packages/db/src/schema/projection.ts:14–18`) but in DuckDB is only ever written `'ready'` by rebuild (1182), and `deleteExpired`/`purgeSite` never change it. The SQLite journal's `readiness` value (e.g. `'rebuilding'`, `'v2'` in the duckdb.test.ts:389 fixture) is **not copied** — DuckDB recomputes. Read at index.ts:272 with `?? 'unavailable'` fallback, and enforced downstream at evidence.drizzle-duckdb.ts:108 (`readiness !== 'ready'` → statistics `unknown`).

**Gap semantics**:
- The journal is the source of truth: `readProjectionGaps` (1238–1250) reads **all** rows from SQLite `projection_gap` `ORDER BY id`, with no site or status filter, and rebuild copies every one verbatim (594–610) including `resolved` rows.
- DuckDB filters to open gaps on read only: `status = 'open'` (239).
- `rejectRelevantGap` (admission.ts:269–273) throws `queryLimitExceeded('projection-gap')` when `findRelevantProjectionGap(openGaps, periods)` matches. `findRelevantProjectionGap` (interval.ts:119–134): unbounded gaps always hit; bounded gaps hit on overlap with `current.interval` **or** `comparison.interval`. Note the period *sequences* (time-series sub-periods) are **not** gap-checked — only the two top-level intervals.
- Freshness is separate: `resolveFreshness` (admission.ts:316–332) returns `'current'` iff `occurrenceCoveredThrough >= evaluationEndExclusive`, else `'stale'`.
- `requireAlignedStatistics` (275–291) requires `statistics.asOfAcceptanceSequence === checkpoint.projectedAcceptanceSequence` **and** non-null `projectedFactCardinality === statistics.factCardinality`; otherwise `queryLimitExceeded('statistics-uncertain')`. This is the heartbeat of the design — it's what catches a fact set that no longer matches its published checkpoint.
- `deleteExpired` deletes gaps with `occurrence_to < cutoff` (826–830) and deliberately preserves unbounded/`occurrence_to IS NULL` gaps.

## Files Read

- `packages/db/src/duckdb/index.ts` (full, 1507 lines)
- `packages/db/src/duckdb/schema.ts` (full)
- `packages/db/src/duckdb/close-progress.ts` (full)
- `packages/db/src/duckdb/reporting-query.ts` (skeleton + method map)
- `packages/db/src/duckdb/public-dashboard-query.ts` (1–110)
- `packages/db/src/duckdb/testing/duckdb.test.ts` (245–860 + test titles)
- `packages/db/src/duckdb/testing/projection-read.test.ts` (full)
- `apps/api/src/resources/traffic-report/evidence.drizzle-duckdb.ts` (full)
- `apps/api/src/resources/traffic-report/testing/evidence.drizzle-duckdb.read.test.ts` (full)
- `apps/api/src/resources/traffic-report/readiness.ts` (full)
- `packages/kernel/src/reporting/admission.ts` (full)
- `packages/kernel/src/reporting/ports.ts` (full)
- `packages/db/src/schema/projection.ts`, `packages/db/src/schema/collection.ts` (65–239)
- `packages/db/src/identity/coverage.ts` (full)
- `apps/api/src/health.ts` (1–200)
- `apps/api/src/resources/event-ingestion/retention-cleanup.ts` (1–260)
- `apps/api/src/server.ts` (68–95), `apps/api/src/resources/installation/index.ts` (50–108)
- `packages/db/src/testing/index.ts` (full)

## Boundaries

- `packages/db/src/duckdb/` imports only `@cimi/utils`, `../client.ts` (type-only `Db`), `../identity/coverage.ts`, and `./schema.ts` + `./close-progress.ts`. **It never imports another resource's repository.** It holds a `Db` (SQLite) handle for the duration of one `rebuild()` call and reads it with raw `db.$client.prepare(...).all()`, bypassing drizzle's typed query builder — every call site carries a `// SAFETY: raw SQL via drizzle returns untyped rows` comment (1007, 1072, 1085, 1100, 1112, 1127, 1239).
- The `AnalyticsDb` interface is the **only** DuckDB surface outside this directory. `DuckDbReportingQuery` and `DuckDbPublicDashboardQuery` depend on `AnalyticsDb` (not `DuckDBConnection`), and both speak through `readWindowed` + `AnalyticsWindowReader.read(sql, args)` which returns plain `Record<string, DuckDBValue>[]`. No SQL text from the reporting layer escapes via any other channel.
- The kernel (`packages/kernel/src/reporting/`) knows nothing about DuckDB. It talks to `ReportingEvidencePort` / `AnalyticsReadinessPort` / `ReportingProjectionPort`; the DuckDB→kernel mapping lives entirely in `apps/api/src/resources/traffic-report/evidence.drizzle-duckdb.ts`. `ReportingEvidenceDrizzleDuckDb` is the only place that reads both stores in one call — and even it reads SQLite retention *after* the DuckDB snapshot, so the two are not transactionally atomic; the alignment requirement in `requireAlignedStatistics` is what covers that.
- `apps/api` is the only caller of `rebuild`, `deleteExpired`, `purgeSite` — five call sites: `event-ingestion/retention-cleanup.ts:65, 121, 137, 215, 232`, plus `installation/index.ts:70` and `backup-restore/executor.ts:102`. **Ingestion never calls rebuild.** Nothing in the write path touches DuckDB.

## Non-Obvious Things

1. **`rebuild()` is not a full-truncate.** It deletes all 6 fact tables unconditionally — no site predicate — **then re-inserts only what the SQLite read produced**. Since `readActiveSiteIds` only returns non-tombstoned active sites, **rebuilding is a hard delete of every tombstoned site's derived data with no replacement**. The `readEvents` SQL and `readActiveSiteIds` both `NOT EXISTS site_tombstone`.
2. **`readEvents` applies retention, `readActiveSiteIds` does not.** A site with a `retention_effective_cutoff` so old that all its events are filtered still gets a checkpoint with cardinality 0 — that's intentional (the fixture in duckdb.test.ts:112 and projection-read.test.ts prove both the empty-site checkpoint and the retention filter separately).
3. **The rebuild rule and the incremental rule for `projection_generation` are deliberately different code paths** (`previousGenerations.get() + 1` at 1177 vs. the SQL `greatest(max(...), max(...)) + 1` at 1214–1217). The rebuild path can't use the SQL form because it writes checkpoints in a loop and needs the value before the transaction; the SQL form can't be used by purge because the checkpoint is being deleted mid-transaction.
4. **`purgeSite` writes the generation before deleting the checkpoint** (851–852). Order matters: after the deletes, `nextProjectionGeneration` would return 1.
5. **`unavailable` is sticky and one-way.** It is set only in rebuild's rollback-failure handler (633) and never cleared short of recreating the `AnalyticsDb`. Every method gates on it.
6. **`enqueue` runs `work` on both the fulfil and reject path** (167: `serial.then(work, work)`), so one failing rebuild does not deadlock the queue for all subsequent reads.
7. **`rebuilding` rejects write-path methods with a throw but makes reads fail soft.** `rebuild` throws `'Analytics database rebuild is already running'` (346); `deleteExpired`/`purgeSite` throw the same message (648, 845); but `ready()` returns `false` (189) and `readProjectionSnapshot`/`readReportData`/`readWindowed` still run — they only gate on `isOpen()` and `unavailable`. Long rebuilds therefore don't block reporting reads.
8. **`properties_json` is the only denormalized column.** Everything else in the `events` table is 1:1 with SQLite columns. `readReportProperties` (1421) re-parses it and rejects a non-object with `'Analytics report properties are not an object'`.
9. **Timestamps cross the boundary as ISO strings, read back as epoch ms.** `timestamp()` (1335) does `new Date(ms).toISOString()`; every write uses `CAST(? AS TIMESTAMP)`; every read selects `epoch_ms(col)`. The reason is documented at 1339–1343 — a naive DuckDB `TIMESTAMP` converts to a JS `Date` through the **host** timezone, so `readInstant` rebuilds the instant from epoch ms instead of trusting DuckDB's conversion.
10. **`replay_sequence` is globally UNIQUE in DuckDB** (schema.ts:76) but per-site-scoped in SQLite (collection.ts:97 `.unique()` on `replay_sequence` — also global there, but `eventPk` is the site-scoped PK). The DuckDB PK is `(site_id, event_id)`, so the same `event_id` can exist in two sites — pinned by duckdb.test.ts:551 and its `seedSharedEventIdAcrossSites` fixture.
11. **The journal's `projection_state` is never updated by the projection.** `readEvents` filters out `'failed'` but nothing writes `'projected'` back to `accepted_event.projection_state` / `projected_at`. Ingestion writes `'pending'` / `null` (`event-ingestion/repository.drizzle.ts:295–296, 317`). So `projection_state` stays `'pending'` for the life of an event, and `EventRow.projectionState` (`'pending' | 'projected' | 'failed'`) effectively only ever distinguishes pending from failed.
12. **DuckDB's `projection_checkpoints` and SQLite's `projection_checkpoint` are different tables with different columns.** The DuckDB one has `projected_fact_cardinality` and `projection_generation`; the SQLite one (`schema/projection.ts:5–21`) has neither but has `effective_retention_from`. `readProjectionGenerations` deliberately UNIONs the two DuckDB tables and ignores SQLite entirely for generation.

## Open Questions

1. **Where would the incremental append hook in?** The seam is `rebuild`'s read phase (351–355) — replace `readEvents`/`readProperties` with a `replay_sequence > projected_replay_sequence` cursor read, and replace the unconditional `DELETE FROM ...` block (466–471) with nothing. But three things fight it: (a) the visitor/session folds (384–461) are currently derived from the whole event set in JS and would need to become incremental derived-table maintenance, exactly like `deleteExpired` already does with its 14 correlated-subquery `UPDATE analytics_sessions` (677–762); (b) identity resolution (`projectEventIdentity`) is restrospectively ambiguous — an event's `profileId` depends on links that may be created later, which is precisely why `runIdentityDerived` (retention-cleanup.ts:56–68) forces a full `rebuild` on any identity change; (c) `foldProjectedCheckpoints` folds min/max occurrence over all events, so an append must merge against the previous checkpoint's `occurrence_covered_from/through` rather than recompute. `deleteExpired` is the closest existing template for what an incremental writer looks like.
2. **`projection_generation` has no consumer pinning it.** `admitPrepared` puts it on the ticket (admission.ts:125, from `facts.projection.checkpoint.projectionGeneration`) but I found nothing in the kernel that *requires* it to be monotonically increasing. The rule exists and is tested (projection-read.test.ts:82–108) but the invariance that would be violated by a weaker rule is only implied — likely by caching/ticket identity outside this slice.
3. **Does anything ever write a non-`'ready'` `readiness` into DuckDB?** The column is typed and defaulted, `readProjectionSnapshot` defaults missing to `'unavailable'`, and the evidence adapter gates on it — but rebuild hardcodes `'ready'` and no UPDATE touches the column. It's reachable only via a legacy file migration or a manual write. Whether the `unavailable` default at 272 is a live path or defensive is unclear from this slice.
4. **`deleteExpired`'s UPDATE recomputes sessions from surviving events but keeps `ended_at` from the subquery even when a session has no surviving events** — actually it guards with `EXISTS` (756–760) and then deletes empty sessions/visitors (786–803). So the pattern is "update what survives, delete what doesn't", but the ordering UPDATE-then-DELETE means the UPDATE work on soon-to-be-deleted rows is wasted. Whether that matters depends on cutoff sizes.
5. **`region`/`city` are inserted as hardcoded `null`** (rebuild 559–560) even though `SessionRow` (1003–1004) declares them and `readReportData` (297) selects them. They come from the session dimension, which this projection doesn't populate — presumably because nothing sources them yet. Confirm whether an upstream feature fills them.