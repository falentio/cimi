---
status: accepted
---

# SQLite and DuckDB Logical Ownership

Cimi uses one embedded SQLite control plane and one embedded DuckDB analytical store. The stores have different logical responsibilities even though they run in the same installation and process boundary.

## Decision

- SQLite is canonical for Site configuration, Goal/Funnel/Cohort definitions, Identity Profiles, aliases, retention and deletion intent, Event Acceptance Records, deduplication, projector cursors, quarantine gaps, and lifecycle status.
- DuckDB owns full normalized Analytical Facts, derived Identity Projections, Analytics Sessions, aggregates, Goal/Funnel/Cohort projections, and report indexes. All of these are rebuildable from SQLite-owned state; their definitions remain SQLite-canonical.
- Analytical Facts contain validated Event fields, occurrence and receipt times, opaque identity and Session IDs, attribution, and bounded properties. Acceptance fingerprints, policy metadata, replay cursors, and deletion intent remain SQLite-owned control data.
- The SQLite acceptance journal covers the full configured raw-event retention window. SQLite is the authoritative backup artifact; restore replays it to rebuild DuckDB and may report ready after structural health checks while retention/deletion cleanup continues asynchronously.
- Collection acknowledgment is independent from analytical materialization. Reports expose projected acceptance sequence and occurrence-time coverage; no-gap projection lag may be reported as `stale`, while relevant Projection Gaps fail query preflight.
- A repeatedly failing accepted Event is quarantined and the projector advances. Later independent facts continue; a gap overlapping either a resolved current or comparison half-open Site interval blocks every affected report family until the Event is replayed and affected dependencies are rebuilt.
- Deletion is hidden immediately through a SQLite-canonical Deletion Tombstone in the live installation. Physical DuckDB cleanup is asynchronous and incremental, followed by compaction; a full rebuild remains the repair path. Restoring an older backup may temporarily expose payloads until cleanup catches up, while the tombstone prevents Site reactivation and cleanup-pending state is visible.
- Identity deletion and profile expiry use a SQLite-canonical Identity Redaction overlay. Accepted Event sequence history remains immutable; replay and queries remove profile, alias, trait, and identity linkage, and retained non-personal Event facts may re-enter analytics as anonymous activity. A later explicit identification starts a new Profile Epoch rather than restoring the expired linkage.

## Considered Options

- DuckDB as the acceptance or configuration authority: rejected because collection recovery, identity mutation, and lifecycle control would depend on rebuildable analytical state.
- Synchronous dual-store writes: rejected because the benchmark measured materially lower acceptance throughput without improving the durable SQLite acknowledgment contract.
- A paired SQLite/DuckDB backup as the correctness artifact: rejected because DuckDB is derived and can be recreated from the full-retention acceptance journal.
- Silent projection gaps: rejected because advancing after quarantine without blocking affected queries would make analytical results appear complete when they are not.

## Consequences

- SQLite remains the small, durable control and recovery boundary; DuckDB can be recreated after restore or repair.
- DuckDB receives broad normalized facts so future reports do not require reconstructing discarded Event fields.
- Identity and definition changes are eventually visible in DuckDB and must participate in freshness reporting.
- Quarantine preserves ingestion and unrelated analytical progress but requires a gap ledger, query preflight checks, replay tooling, and Site-scoped dependency rebuild support.
- Incremental deletion keeps request-path work bounded but requires compaction monitoring and a deterministic rebuild fallback.
- Restore readiness and deletion completion are separate lifecycle states. Operators must be able to see when a restored generation still contains cleanup work from a historical backup.
- Redaction overlays preserve journal replay and deduplication history but require every analytical rebuild and identity-sensitive report to apply the overlay.
