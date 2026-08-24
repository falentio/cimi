---
status: accepted
---

# Installation Recovery Lifecycle

Cimi runs as one self-hosted container with SQLite acceptance/control state and a rebuildable DuckDB analytical projection. Lifecycle operations must preserve the SQLite acceptance boundary without pretending that analytical state is available when it is not.

## Decision

- Health reports overall lifecycle state plus independent control-store and analytics-store state. Any analytics-store state other than `ready` (`degraded`, `rebuilding`, or `unavailable`) returns generic `SERVICE_UNAVAILABLE` (503) for every analytics read before cache or execution; collection may continue in accept-only mode while SQLite remains healthy.
- Backup creation enters read-only maintenance: analytics reads may continue, while new collection admissions and lifecycle mutations are rejected. The active and pending acceptance coalescer queues drain before the backup snapshot; a failed drain fails the backup and its waiting ingestion requests. One installation-wide lifecycle lock prevents overlapping backup, restore, upgrade, retention, and destructive cleanup operations.
- Restore and upgrade operations persist durable phase/checkpoint state. Startup automatically resumes an interrupted operation and never reports readiness for a partial generation.
- Upgrades create an authoritative SQLite backup first. Supported older manifests are migrated; newer manifests are rejected. An incompatible DuckDB schema is rebuilt from migrated SQLite state.
- If canonical SQLite migration or the subsequent DuckDB rebuild cannot complete, roll back the whole pre-upgrade generation from the authoritative backup.
- Restore may report ready after structural SQLite/DuckDB health checks while historical retention/deletion cleanup remains pending. Cleanup state is visible through bounded lifecycle diagnostics and report freshness.

## Considered Options

- Stop collection whenever DuckDB is unavailable: rejected because it collapses durable acceptance and analytical materialization into one availability boundary.
- Allow overlapping lifecycle operations: rejected because one embedded SQLite writer and one embedded DuckDB projection make mixed generations difficult to reason about.
- Require manual recovery after every interrupted operation: rejected because ordinary process crashes would leave a self-hosted installation unavailable without human intervention.

## Consequences

- Operators receive safe phase, component, progress, last-safe-sequence, cleanup-pending, and error-code diagnostics without filesystem paths, credentials, or raw provider errors.
- Read-only backup maintenance pauses new collection admission but drains already-admitted acceptance candidates before preserving analytical reads and giving the SQLite backup a clear generation boundary.
- Rollback requires sufficient storage for the authoritative backup and can discard an incomplete upgrade generation, but cannot discard accepted Events because writes are quiesced.
- Rebuild duration is part of the operating envelope and needs focused failure-path measurement; it is not a product throughput promise.
