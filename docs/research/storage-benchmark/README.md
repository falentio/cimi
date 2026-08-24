# Storage Benchmark

This directory contains the completed research and reproducible benchmark record for issue [#18](https://github.com/falentio/cimi/issues/18). It supports the resolved SQLite/DuckDB ownership decision in issue [#14](https://github.com/falentio/cimi/issues/14) without specifying implementation details.

## Research

- `official-guidance.md` records first-party SQLite, DuckDB, and Daytona guidance.

## Accepted Benchmark Authority

Container sandbox results are authoritative for the accepted issue #18 benchmark scope. The Linux VM profile was investigated but was not run and is historical/superseded material, not a pending fairness prerequisite. These results are evidence for the storage ownership decision and do not establish a product capacity promise.

## Fairness Rules

- Run candidates on the same constrained container sandbox, local sandbox filesystem, dataset, runtime, schema meaning, and result checksums.
- Keep live database files, database WAL files, journal files, and DuckDB temporary spill files on local sandbox storage. Do not use a Daytona volume for database files.
- Record effective cgroup CPU and memory limits instead of trusting host-level `nproc` or `free` output.
- Pin and record SQLite, better-sqlite3, DuckDB, @duckdb/node-api, Node.js, kernel, Daytona CLI, snapshot, region, and all database settings.
- Separate durable acceptance latency from analytics materialization latency and query visibility.
- Compare equivalent contracts. A direct DuckDB commit, a SQLite journal acknowledgment, and a synchronous dual write are different acknowledgment contracts, not interchangeable engine measurements.
- Report both warm-cache and cold-start/restart behavior. Do not reuse WAL, spill, connection, or materializer state across independent candidates unless the profile explicitly measures it.

## Candidate Paths

| Candidate                              | Acknowledgment boundary   | Query store | Purpose                                   |
| -------------------------------------- | ------------------------- | ----------- | ----------------------------------------- |
| SQLite direct                          | SQLite transaction commit | SQLite      | Control/raw-event baseline                |
| DuckDB direct                          | DuckDB transaction commit | DuckDB      | Single-process analytics baseline         |
| SQLite journal plus DuckDB projector   | SQLite journal commit     | DuckDB      | Outbox/journal tradeoff                   |
| SQLite journal plus synchronous DuckDB | Both stores commit        | DuckDB      | Upper-bound freshness and dual-write cost |

All candidates use the same deterministic logical Event shape. Candidate-specific physical schemas and indexes are recorded in the result manifest rather than hidden.

## Workload Matrix

| Phase           | Measurement                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Acceptance      | Per-event and batch acknowledgment latency, throughput, errors, bytes written                           |
| Deduplication   | Existing Event ID lookup latency and changed-payload collision behavior                                 |
| Materialization | Projector throughput, backlog, lag, batch size, transaction size, and query visibility                  |
| Mixed load      | Fixed readers plus writer/projector, lock or conflict errors, tail latency, queue growth                |
| Reports         | Time buckets, unique Visitors, filtered Event breakdowns, and stable offset pages with result checksums |
| Retention       | Delete latency, checkpoint latency, compaction time, and live/WAL/temp file sizes                       |
| Recovery        | Process restart, interrupted projection, replay correctness, duplicate suppression, and recovery time   |
| Backup          | SQLite online backup, DuckDB checkpoint/copy, artifact size, duration, and source impact                |

## Measurement Rules

- Use a deterministic seed and record row count, Site count, Event-kind distribution, timestamp range, property shape, insertion order, and retention cutoff.
- Use declared warmup and repetition counts. Report p50, p95, p99, minimum, maximum, mean, and run-to-run variance.
- Capture wall time, CPU time, peak RSS, cgroup memory pressure, thread count, database size, WAL/journal size, temporary spill size, checkpoint time, compaction time, and errors.
- Capture SQLite `EXPLAIN QUERY PLAN` and DuckDB `EXPLAIN`/profiling output in a non-timed diagnostic pass.
- Verify row counts, duplicate counts, query checksums, and report results after every phase.
- Never count Daytona sandbox creation, CLI transport, repository setup, or artifact upload in database timings.

## Historical VM Probe

The planned but unexecuted Linux VM profile used the documented `daytona-vm-small` shape: 1 vCPU, 1 GiB memory, and 3 GiB disk. It is retained as a historical execution note only; no VM result is part of the accepted benchmark.

The historical probe found an authenticated CLI (`daytona list` succeeds), a client/API version mismatch (`v0.190.0` versus API `v0.207.0`), and no Linux VM runners in either `eu` or `us`:

```bash
daytona version
daytona snapshot list
daytona create --snapshot daytona-vm-small --name cimi-storage-bench --auto-stop 0 --auto-delete -1
```

Both the default VM create and a custom `linux-vm` snapshot attempt fail with `No runners are configured in region ... for sandbox class 'linux-vm'`. No VM result was produced, and no regional VM capacity or quota change is required for the accepted container benchmark.

The planned VM execution would have used an explicit working directory and timeout, kept databases on sandbox storage, and exported only diagnostic artifacts. No such VM execution occurred.

## Accepted Container Benchmark

Container sandboxes are the accepted benchmark environment for this research. Database files stay on the sandbox filesystem and no Daytona volume is mounted. Node `v25.9.0` is accepted for benchmark runs.

- Profile: 1,000 base rows, 100 mixed rows, three repetitions, three query repetitions, batch sizes 1/100/1000, two readers, one DuckDB thread, and a 128 MiB DuckDB memory limit.
- Result: 36 runs across all four candidates completed with no mixed-load errors, 1,100 rows after drain, and valid SQLite/DuckDB backup row counts. The raw result was copied to `/tmp/opencode/cimi-storage-benchmark-results-container-1k-r3.json`.
- Boundary: the original 20,000-row profile and a 5,000-row DuckDB profile were OOM-killed with exit 137 under the 1 GiB cgroup limit. This is a batch-size-sensitive diagnostic caveat, not a pure row-count limit or product capacity claim.

## Two GiB Capacity Diagnostics

A separate container snapshot with 1 vCPU, 2 GiB cgroup memory, and 3 GiB disk was used for the next capacity comparison.

- Profile: 5,000 base rows, 500 mixed rows, three repetitions, three query repetitions, batch sizes 1/100/1000, two readers, one DuckDB thread, and a 512 MiB DuckDB memory limit.
- Result: 36 runs across all four candidates completed with no mixed-load errors, 5,500 rows after drain, and valid SQLite/DuckDB backup row counts. The raw result was copied to `/tmp/opencode/cimi-storage-benchmark-results-2gb-5k.json`.
- Boundary: the full 20,000-row profile was OOM-killed with exit 137 while entering `duckdb-direct`; the cgroup recorded `oom_kill=1`. Isolated 20,000-row DuckDB runs with `batchSize=100` and `batchSize=1000` passed, while `batchSize=1` independently reproduced the OOM with mixed load, backup, and retention disabled. The failure therefore points to per-batch Appender allocation pressure, not a pure 20,000-row capacity limit.

## Historical Production-Parity Batch Comparison

The recorded benchmark artifacts below use a historical 1,000-row acceptance profile. The adopted ingestion contract now uses a 500-candidate active flush with a 1,000 ms coalescing window and a separate pending queue, so these artifacts are evidence for the storage engine comparison rather than current production-parity evidence. The benchmark runner defaults now use 500-row acceptance and mixed-load batches.

- Configuration: SQLite WAL, `synchronous=FULL`, foreign keys, 5-second busy timeout, and 1000-page WAL auto-checkpoint; DuckDB one thread, 512 MiB memory limit, local temp directory, and 1 GiB temp-directory cap.
- Historical profile: 20,000 base rows, 1,000 mixed rows, three repetitions, five query repetitions, batch size 1000, two readers, and 1,000-row mixed-load batches.
- 1 GiB final result: 12 runs across all four candidates completed with no mixed-load errors, 21,000 rows after drain, and valid SQLite/DuckDB backup row counts. Raw result: [`results/production-parity-1gb.json`](results/production-parity-1gb.json).
- 2 GiB final result: 12 runs across all four candidates completed with no mixed-load errors, 21,000 rows after drain, and valid SQLite/DuckDB backup row counts. Raw result: [`results/production-parity-2gb.json`](results/production-parity-2gb.json).
- Verdict: the historical 1,000-row profile fits both 1 GiB and 2 GiB containers. The excluded one-row Appender stress path remains diagnostic only; the adopted 500-row profile still requires a fresh measurement.

## Verdict

### Recommendation

Use **SQLite as the durable acceptance journal and outbox, with asynchronous DuckDB projection for analytics queries**.

- SQLite owns the accepted Event envelope, deduplication fingerprint, acceptance state, replay sequence, and outbox record. Its backup is the authoritative recovery artifact for accepted collection data.
- DuckDB owns the derived analytics projection and report-query workload. Its file is rebuildable from the durable SQLite journal; a checkpointed/copied DuckDB artifact may accelerate repair but is never required for backup correctness.
- A successful collection acknowledgment promises durable recoverable acceptance, not immediate DuckDB query visibility. The projector must expose lag and recovery state.

This recommendation follows both the benchmark and the accepted durability boundary. The outbox candidate preserves the separation between collection durability and analytics availability while avoiding the synchronous dual-write coupling.

### Evidence

The final production-parity results are means across three repetitions on one-vCPU containers. Query values are the mean of each run's timeseries p95.

| Candidate | 1 GiB acceptance rows/s | 2 GiB acceptance rows/s | 1 GiB timeseries p95 | 2 GiB timeseries p95 |
| --- | ---: | ---: | ---: | ---: |
| SQLite direct | 117,591 | 135,985 | 1.51 ms | 1.81 ms |
| DuckDB direct | 186,777 | 221,802 | 2.65 ms | 7.20 ms |
| SQLite outbox plus DuckDB | 112,492 | 108,444 | 3.14 ms | 7.73 ms |
| SQLite synchronous dual write | 72,803 | 87,394 | 4.23 ms | 7.41 ms |

- All four candidates completed 12 runs in both 1 GiB and 2 GiB containers with zero mixed-load errors, valid backup row counts, and 21,000 rows after drain.
- Direct DuckDB has the highest measured acceptance throughput, but it does not provide the selected durable acceptance boundary by itself.
- SQLite direct has the lowest measured report latency and simplest topology, but it does not provide the intended separation between collection and analytical materialization.
- Synchronous dual write adds the largest acceptance cost without being required for the selected recoverable-acceptance contract.
- The historical 1,000-row profile fits both tested memory envelopes. This does not establish a product capacity promise; the 20,000-row base is a synthetic harness scale, and the adopted 500-row profile requires a separate run.

### Closure Check

Issue #18 is **ready to close as a completed benchmark research issue under the revised scope**:

- Official SQLite, DuckDB, and Daytona guidance is recorded.
- The reproducible harness and human-readable report are present.
- The accepted container environment, runtime, cgroup limits, configuration, workload, repetitions, and raw JSON artifacts are recorded.
- The historical production-parity profile was rerun before the 500-candidate acceptance contract was adopted; current benchmark defaults now model the 500-row flush cap.
- The results support an explicit recommendation rather than an inconclusive outcome.

Closing issue #18 does not imply that ingestion, projection, versioned migrations, backup/restore procedures, or Astro shutdown wiring are implemented. Issue #14 records the logical ownership decision; those implementation tasks follow that decision.

## Status

- Official guidance: complete.
- Wayfinder research ticket: closed as issue #18 and indexed under issue #1.
- Benchmark runner: `packages/db/benchmarks/storage-benchmark.mjs` with the `@cimi/db` `benchmark` script. It covers direct SQLite, direct DuckDB, SQLite journal plus DuckDB projection, synchronous SQLite plus DuckDB dual write, acceptance, deduplication, representative reports, mixed writer/readers/projector load, SQLite online backup, DuckDB checkpoint/copy, retention maintenance, and close/reopen recovery checks.
- Local smoke validation: 100 rows, one repetition, batch size 10, four candidates, mixed load, and backup verification passed. This is only a harness check on a high-spec workstation and is not benchmark evidence.
- Container benchmark execution: accepted as the authoritative environment; Node `v25.9.0` is accepted.
- Production-parity benchmark: current defaults match SQLite/DuckDB client settings and the adopted 500-row acceptance flush; the recorded full artifacts are historical 1,000-row runs completed on both 1 GiB and 2 GiB containers.
- Production client audit: SQLite durability/concurrency pragmas, DuckDB resource/spill limits, explicit DuckDB close checkpoints, and coordinated frontend database shutdown are implemented and covered by focused tests. Astro standalone signal wiring remains host-runtime work.
- VM execution: intentionally out of scope because Linux VM runners are unavailable in the configured regions.
- Storage ownership decision: benchmark recommendation is recorded above and incorporated into the resolved issue #14 decision.
