---
status: accepted
---

# Recoverable Site Deletion

## Context

A Site deletion must stop collection and disclosure immediately without making
an accidental request or process failure permanently destructive. The prior Site
contract exposed only `active -> deleted`, while the Organization/Site decision
requires a hidden, recoverable Site for thirty days and the executable delete
command already represents asynchronous work with `deleting`.

Deletion also crosses the SQLite acceptance boundary, DuckDB projections,
identity data, Public Dashboard access, backups, and installation-wide backup or
restore operations. A backup restored after deletion must not silently
resurrect a Site that an Owner intentionally removed.

## Decision

Use the persisted Site lifecycle:

```text
active -> deleting -> deleted -> purged
deleting -> recovering -> active
deleted -> recovering -> active
```

- `deleteSite` remains Owner-only, returns `202`, and is retry-safe. It acquires
  the shared lifecycle boundary, marks the Site `deleting`, blocks new
  collection admissions, and hides the Site from normal reads, authenticated
  analytics, and Public Query immediately. Candidates admitted before the
  transition are grandfathered and drain through the sequential global SQLite
  writer; this in-flight work is not new collection admission.
- `deleting` and `deleted` Sites retain their live data, Ingestion Identifier,
  and Public Dashboard configuration during the recovery window, subject to
  normal retention. The Site is non-ingestible for new requests and
  non-queryable in both states; candidates admitted before `deleting` may
  complete their durable acceptance flush.
- `recoverSite` is an explicit Owner/Administrator command. It is accepted from
  `deleting` or `deleted`, enters persisted `recovering`, cancels pending
  deletion work, and restores the prior access boundary asynchronously.
- `deleted` begins a thirty-day recovery window when entered. Automatic purge
  then removes all live Site data, including configuration, acceptance Events,
  identities, derived analytics, definitions, and public configuration, while
  retaining only minimal tombstone/audit metadata needed to reject resurrection.
- Backup payloads are not synchronously purged by Site deletion. They follow
  normal backup retention, and restore always honors the canonical deletion
  tombstone so an older backup cannot reactivate a deleted or purged Site. A
  restored generation may temporarily rehydrate historical payload while
  cleanup catches up, and must expose that cleanup-pending state.
- Site deletion suspends Public Dashboard requests but is not equivalent to the
  explicit `disablePublicDashboard` command. Recovery therefore restores the
  prior Public Dashboard configuration and identifier.
- `getSiteDeletionStatus` is the privileged status surface. It returns state,
  operation and lifecycle timestamps, recovery/purge deadlines, and cleanup
  status/error summary without returning hidden Site data or credentials.

## Considered Options

- A single reversible `deleted` state was rejected because it hides asynchronous
  cleanup and recovery progress.
- Immediate live-data deletion with a configuration-only recovery was rejected
  because it makes the thirty-day recovery promise misleading.
- Synchronously deleting every backup copy was rejected because backup cleanup
  has its own lifecycle and would make Site purge depend on unavailable copies.
- Treating Site deletion as Public Dashboard disable was rejected because it
  would rotate a public identifier during a recoverable suspension and violate
  the selected prior-access recovery behavior.

## Consequences

- Site lifecycle status is durable and observable without exposing a hidden Site
  through ordinary Site reads.
- The deletion boundary is linearized with Event admission: post-transition
  requests fail closed, while pre-transition candidates may finish and retain
  their admission Receipt Time.
- Recovery is meaningful for the full grace period because destructive live
  cleanup is deferred until purge, while normal retention may still expire data.
- Backup storage may contain deleted Site payloads after live purge. Restore may
  temporarily rehydrate those payloads as the accepted restore-time cleanup
  exception, but the tombstone still prevents Site activation and normal
  collection, query, or Public Query visibility until cleanup completes.
- Public URLs and ingestion clients resume automatically after recovery, so an
  Owner who wants fresh access boundaries must explicitly rotate or disable them.
- Implementations must serialize Site deletion, recovery, purge, backup, and
  restore under the existing global lifecycle lock.

## Compatibility Rules

Future changes must preserve these invariants:

- Deleting and deleted Sites fail closed for collection, normal Site reads,
  authenticated analytics, and Public Query.
- Event candidates admitted before the deletion boundary are grandfathered
  through the acceptance flush; no candidate admitted after the boundary may be
  journaled for the Site.
- Only Owners can request deletion; Owners and Administrators can recover it.
- Recovery is available only before `purged` and is safe to retry.
- A restore cannot resurrect a Site whose canonical tombstone says `purged`.
- Public Dashboard disable/enable rotation semantics remain distinct from Site
  deletion suspension.
