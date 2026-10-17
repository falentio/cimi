# Throughput checkpoint — attribution in the demo fabric

Feature playbook step 3. Four items, with `n/a` where the dimension does not apply.

## Blocking first steps

One gate, and it runs before any implementation fan-out: the change is not done
until a **real seeded site's breakdown queries return non-null values**, driven
through the real composition root. A unit test proving the fabric carries
attribution is a proxy; the acceptance is the query result, because the reporting
layer re-derives the session row through the fold and the SQL could still drop it.
That gate is why this is sequenced as implement, then verify at the API surface.

## Independent workstreams

`n/a: no fan-out.` The change is three files inside one package with one owner:
`demo-seed/fabric.ts`, `demo-seed/ports.ts` and `event-ingestion/seed-journal.ts`,
plus their tests. There is no second artifact to build in parallel, and splitting
the port shape from its only two consumers would cost a hand-off for no gain.

## Shared mutable state

`n/a: no concurrent actors.` `generateEventFabric` is a pure function of its input,
seeded from the site id, so it is deterministic and holds no shared state. The
attribution pick consumes the same `random` stream as the rest of the fabric, which
keeps determinism without a new source of ordering.

## Smallest safe decomposition

One owner. Reason: the port shape and both of its consumers land in the same edit,
and a test that asserts the fabric is deterministic has to see all three files to
be meaningful. Decomposing further would put the data shape, its writer and its
reader in three reviews of one change.
