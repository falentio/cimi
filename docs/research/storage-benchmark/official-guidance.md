# Official Guidance: Storage Benchmark

Research-only note for a fair comparison of SQLite, DuckDB, and outbox/journal variants on a constrained self-hosted VM.

**Evidence labels**

- **[Source fact]** is stated or directly documented by a first-party source.
- **[Recommendation]** is a proposed benchmark or operational practice.
- **[Inference]** is a conclusion drawn from one or more source facts.

The sources below are official Daytona, SQLite, and DuckDB documentation. Cimi-specific behavior is cited to the repository ADR where used.

## Executive Constraints

- **[Source fact]** SQLite WAL permits readers and a writer to run concurrently, but a database has only one WAL writer at a time. [SQLite WAL](https://sqlite.org/wal.html)
- **[Source fact]** DuckDB read-write in-process mode supports multiple writer threads inside one process, while read-only mode supports multiple processes reading and no processes writing. [DuckDB concurrency](https://duckdb.org/docs/current/connect/concurrency)
- **[Source fact]** Daytona volumes are FUSE-based, are generally slower than local sandbox storage, and cannot be used for applications that require block storage access such as database tables. [Daytona volumes](https://www.daytona.io/docs/en/volumes/)
- **[Source fact]** Cimi's accepted-event boundary is a durable local acceptance journal append; analytics-store materialization is asynchronous and is not implied by the acknowledgment. [Cimi durable event acceptance boundary](../../adr/0002-durable-event-acceptance-boundary.md)
- **[Inference]** The benchmark must report at least two separate outcomes: durable acceptance latency and analytics visibility/materialization latency. Combining them into one number would compare different acknowledgment contracts.
- **[Recommendation]** Keep SQLite and DuckDB database files on the VM's local block-backed filesystem. Use Daytona volumes, if a Daytona harness is used, only for datasets, logs, and exported results, not for live database files.
- **[Recommendation]** Treat direct storage, a durable journal/outbox followed by asynchronous materialization, and a synchronous multi-store path as different workload contracts. Report their path decomposition instead of presenting them as equivalent engine-only tests.

## 1. Daytona CLI and Sandboxes

### Resource controls

- **[Source fact]** `daytona create` exposes CPU, memory, disk, snapshot, environment, network, and volume-mount controls. The CLI reference describes `--cpu` as allocated CPU cores, `--memory` as memory in MB, `--disk` as disk space in GB, and `--volume` as `VOLUME_ID_OR_NAME:MOUNT_PATH`. [Daytona CLI](https://www.daytona.io/docs/en/tools/cli/)
- **[Source fact]** Daytona documents default sandbox resources of 1 vCPU, 1 GiB RAM, and 3 GiB disk, with documented organization limits of 4 vCPUs, 8 GiB memory, and 10 GiB disk on the sandbox resources page. [Daytona sandboxes](https://www.daytona.io/docs/en/sandboxes/)
- **[Source fact]** The SDK resource model uses CPU, memory, and disk fields, and Daytona documents that CPU and memory can be increased while running, while disk resizing requires a stopped sandbox and disk can only grow. [Daytona sandbox reference](https://www.daytona.io/docs/en/python-sdk/sync/sandbox/)
- **[Source fact]** Daytona says that cgroup values reflect sandbox CPU and memory limits, while tools such as `nproc` and `free` can report host-level values that do not reflect those limits. [Daytona isolation](https://www.daytona.io/docs/en/isolation/)

**[Recommendation]** Fix CPU, memory, disk, sandbox class, region, image or snapshot, and lifecycle settings before a run. Do not resize during a timed run. Record both the requested settings and the effective cgroup values from inside the sandbox.

**[Inference]** A benchmark that records only `nproc` or `free` can misstate the resources actually available to the workload when running under Daytona-style limits.

### Persistence and lifecycle

- **[Source fact]** Daytona sandboxes are persistent by default: stopping one preserves its identity, filesystem, and configuration, and it can be started again with files, installed packages, and repositories intact. [Daytona persistence](https://www.daytona.io/docs/en/persistence/)
- **[Source fact]** Container sandboxes preserve filesystem state through stop/start but clear memory state on stop; VM sandboxes can preserve memory through pause/resume; GPU sandboxes are ephemeral and are deleted on stop. [Daytona persistence](https://www.daytona.io/docs/en/persistence/)
- **[Source fact]** Filesystem and memory persistence are tied to a sandbox. Deleting the sandbox deletes that state, while snapshots, forks, and volumes provide state that can outlive the sandbox. [Daytona persistence](https://www.daytona.io/docs/en/persistence/)
- **[Source fact]** An ephemeral sandbox is deleted when it stops and discards its state. [Daytona persistence](https://www.daytona.io/docs/en/persistence/)

**[Recommendation]** Use a fresh, persistent sandbox for each benchmark batch when the database state should survive a controlled stop/start. Use an ephemeral sandbox only when the test explicitly includes setup and teardown or when all artifacts have already been exported. Do not allow auto-stop, auto-archive, or auto-delete to interrupt a timed interval.

**[Inference]** A stop/start test is not equivalent to a process restart: on a container, the filesystem survives but memory does not. A pause/resume test on a VM is a different warm-state experiment.

### Volumes

- **[Source fact]** Daytona volumes are FUSE-based mounts backed by an S3-compatible object store. They persist independently of a sandbox and can be mounted by multiple sandboxes. [Daytona volumes](https://www.daytona.io/docs/en/volumes/)
- **[Source fact]** A volume must be ready before mounting, mount paths must be absolute and cannot target system directories, and a `subpath` can expose only a prefix of a shared volume. [Daytona volumes](https://www.daytona.io/docs/en/volumes/)
- **[Source fact]** Sandboxes mounting the same volume see writes immediately, but FUSE-backed volumes are not transactional; concurrent writes to the same path use last-write-wins behavior. [Daytona volumes](https://www.daytona.io/docs/en/volumes/)
- **[Source fact]** Daytona explicitly says volumes cannot be used for applications requiring block storage access such as database tables, and that volumes are generally slower for reads and writes than local sandbox storage. [Daytona volumes](https://www.daytona.io/docs/en/volumes/)

**[Recommendation]** Put live SQLite files, SQLite `-wal`/`-shm` files, DuckDB files, DuckDB temporary spill files, and journal files on local VM storage. Put immutable input data and completed benchmark artifacts on a volume only if the added FUSE/object-storage path is not part of the measured storage path.

**[Inference]** Using a Daytona volume for one candidate but local disk for another would benchmark storage backends as well as database behavior and would invalidate an engine comparison.

### Execution

- **[Source fact]** Daytona's process module can execute shell commands with a working directory, timeout, and environment variables. The documented default command timeout is 10 seconds. [Daytona process and code execution](https://www.daytona.io/docs/en/process-code-execution/)
- **[Source fact]** Daytona sessions preserve shell state across commands and can run long-lived processes in the background. [Daytona process and code execution](https://www.daytona.io/docs/en/process-code-execution/)
- **[Source fact]** Daytona distinguishes stateless code execution, where each invocation starts with a clean interpreter state, from stateful Python interpreter contexts that preserve variables and imports. [Daytona process and code execution](https://www.daytona.io/docs/en/process-code-execution/)
- **[Source fact]** The CLI provides `daytona exec` with `--cwd` and `--timeout` controls for command execution. [Daytona CLI](https://www.daytona.io/docs/en/tools/cli/)

**[Recommendation]** Run the benchmark as one noninteractive command or one named session, set an explicit timeout longer than the intended run, and capture stdout, stderr, exit status, and process termination separately from database timings. Avoid measuring sandbox creation, command transport, or SDK polling in the engine-only interval.

### Authentication and version caveat

- **[Source fact]** Daytona API keys authenticate SDK, API, and CLI requests. The documented environment variables include `DAYTONA_API_KEY`, `DAYTONA_API_URL`, and `DAYTONA_TARGET`; the documented default API URL is `https://app.daytona.io/api`. [Daytona API keys](https://www.daytona.io/docs/en/api-keys/)
- **[Source fact]** Daytona documents separate permission scopes for sandbox, snapshot, volume, and other resources. For example, volume access is split across `read:volumes`, `write:volumes`, and `delete:volumes`. [Daytona API keys](https://www.daytona.io/docs/en/api-keys/)
- **[Source fact]** JWT-authenticated requests require the `X-Daytona-Organization-ID` header, and Daytona says JWT tokens expire after a short period. [Daytona API keys](https://www.daytona.io/docs/en/api-keys/)
- **[Source fact]** The CLI exposes `--version` and a `daytona version` command. [Daytona CLI](https://www.daytona.io/docs/en/tools/cli/)
- **[Source fact]** Daytona's TypeScript SDK documentation says SDK version 0.198.0 introduced WebSocket sandbox state streaming by default; the SDK falls back to polling if the WebSocket cannot be established, and polling-only mode is deprecated. [Daytona TypeScript SDK](https://www.daytona.io/docs/en/typescript-sdk/)

**[Recommendation]** Use a least-privilege, noninteractive API key for an automated harness. Pin and record the Daytona CLI and SDK versions, API URL, target region, sandbox class, and image or snapshot. Do not treat lifecycle completion timing from an unrecorded SDK version as part of database performance.

**[Inference]** A benchmark can otherwise change behavior after a client upgrade even when the database workload is unchanged, because Daytona's lifecycle observation mechanism is version-sensitive.

## 2. SQLite

### WAL and one-writer concurrency

- **[Source fact]** SQLite WAL appends committed changes to a separate WAL file rather than overwriting the database file first. A commit occurs when a commit record is appended to the WAL. [SQLite WAL](https://sqlite.org/wal.html)
- **[Source fact]** WAL allows readers and writers to proceed concurrently, and readers see a stable snapshot for the duration of a read transaction. [SQLite WAL](https://sqlite.org/wal.html) [SQLite isolation](https://www.sqlite.org/isolation.html)
- **[Source fact]** SQLite states that writers append to one WAL file and that only one writer can write at a time. [SQLite WAL](https://sqlite.org/wal.html)
- **[Source fact]** SQLite WAL requires all processes using the database to be on the same host and does not work over a network filesystem because readers use shared memory for the WAL index. [SQLite WAL](https://sqlite.org/wal.html)

**[Recommendation]** Include a single-writer baseline and a contention matrix with fixed producer and reader counts. Measure successful writes, lock or busy outcomes, retry time, reader latency, and writer latency rather than assuming that WAL removes all write contention.

**[Inference]** An outbox or journal that serializes durable appends may fit SQLite's physical writer boundary well, but it adds queueing and replay work that must be reported as part of that architecture rather than hidden as database overhead.

### Synchronous durability

- **[Source fact]** In WAL mode, `synchronous=FULL` adds a WAL sync after each transaction commit to help make transactions durable across power loss. [SQLite WAL](https://sqlite.org/wal.html) [SQLite PRAGMA synchronous](https://www.sqlite.org/pragma.html)
- **[Source fact]** In WAL mode, `synchronous=NORMAL` omits sync operations during most transactions and remains consistent, but a transaction committed with this setting might roll back after power loss or a system crash. [SQLite PRAGMA synchronous](https://www.sqlite.org/pragma.html)
- **[Source fact]** SQLite documents that transactions remain durable across application crashes regardless of the synchronous setting or journal mode, while power-loss durability differs. [SQLite PRAGMA synchronous](https://www.sqlite.org/pragma.html)
- **[Source fact]** SQLite's `synchronous` setting is per connection or schema context as documented by the PRAGMA reference. [SQLite PRAGMA synchronous](https://www.sqlite.org/pragma.html)

**[Recommendation]** Make durability a named benchmark dimension. Run a durable profile with `synchronous=FULL`, and if `NORMAL` is also evaluated, report it as a relaxed power-loss durability profile rather than as an equal replacement for `FULL`. Record the effective PRAGMA values at run start.

**[Inference]** A faster `NORMAL` result is not evidence of a faster equivalent durable acceptance path if the competing path synchronizes at commit.

### Checkpointing

- **[Source fact]** A SQLite checkpoint transfers WAL content back into the database file. [SQLite WAL](https://sqlite.org/wal.html)
- **[Source fact]** SQLite's default automatic checkpoint runs when the WAL reaches 1000 pages, unless the compile-time or runtime threshold is changed. [SQLite WAL](https://sqlite.org/wal.html)
- **[Source fact]** By default, the commit that pushes the WAL over the threshold performs the checkpoint, so most commits are fast but an occasional commit can be slower. [SQLite WAL](https://sqlite.org/wal.html)
- **[Source fact]** A long-running reader can prevent a checkpoint from progressing, and a growing WAL can reduce read performance because readers must check the WAL. [SQLite WAL](https://sqlite.org/wal.html)
- **[Source fact]** SQLite exposes PASSIVE, FULL, RESTART, and TRUNCATE checkpoint modes through `sqlite3_wal_checkpoint_v2`; PASSIVE does not wait for readers or writers, while stronger modes can block writers or wait for readers. [SQLite checkpoint API](https://www.sqlite.org/c3ref/wal_checkpoint_v2.html)

**[Recommendation]** Choose one of these explicit checkpoint policies for each benchmark profile: default automatic checkpointing, application-controlled periodic checkpointing, or checkpointing at phase boundaries. Record WAL size before and after checkpoint, checkpoint duration, commit latency distribution, and whether readers held snapshots during the operation.

**[Inference]** Checkpoint policy can change both tail write latency and read latency, so it is a workload parameter, not an implementation detail to leave uncontrolled.

### Backup API

- **[Source fact]** SQLite's Online Backup API copies one database into another and produces a destination snapshot that is bit-wise identical to the source as it was when copying commenced. [SQLite Backup API](https://www.sqlite.org/backup.html)
- **[Source fact]** The copy can be incremental, so the source need not remain locked for the whole backup; the source is locked only for brief periods while pages are read. [SQLite Backup API](https://www.sqlite.org/backup.html)
- **[Source fact]** The official example handles `SQLITE_OK`, `SQLITE_BUSY`, and `SQLITE_LOCKED` while stepping an online backup and uses a busy handler or timeout when locks cannot be obtained immediately. [SQLite Backup API](https://www.sqlite.org/backup.html)

**[Recommendation]** Benchmark backup as a separate operational phase. Use the Online Backup API for a live SQLite database, record backup duration, source write impact, destination bytes, and whether the source was in WAL mode. Do not include backup time in normal request latency unless backup contention is itself the scenario under test.

### Query plans and indexes

- **[Source fact]** SQLite uses a cost-based query planner and normally needs indexes supplied by the programmer to avoid full table scans for selective lookups. [SQLite query planning](https://sqlite.org/queryplanner.html) [SQLite query optimizer overview](https://sqlite.org/optoverview.html)
- **[Source fact]** SQLite documents multi-column indexes for queries with multiple AND-connected terms and covering indexes when the index contains all columns needed by a query. [SQLite query planning](https://sqlite.org/queryplanner.html)
- **[Source fact]** SQLite can use indexes for ordering as well as searching, and `EXPLAIN QUERY PLAN` reports a high-level view of the selected strategy. [SQLite query planning](https://sqlite.org/queryplanner.html) [SQLite query optimizer overview](https://sqlite.org/optoverview.html)
- **[Source fact]** SQLite's planner can use statistics from `ANALYZE` when choosing among indexes, and the current PRAGMA documentation recommends `PRAGMA optimize` as the way to run analysis beginning with SQLite 3.46.0. [SQLite query planning](https://sqlite.org/queryplanner.html) [SQLite PRAGMA](https://www.sqlite.org/pragma.html)

**[Recommendation]** Freeze schema, index definitions, statistics state, SQL text, parameter distributions, and data order across runs. Capture `EXPLAIN QUERY PLAN` for each timed query, and run cold-cache and warm-cache cases separately. Do not add or omit an index in only one candidate without labeling it as a separate schema profile.

### SQLite version and setting caveat

- **[Source fact]** SQLite documents that PRAGMA syntax is SQLite-specific, that PRAGMAs may be removed or added in future releases without a general backwards-compatibility guarantee, and that an unknown PRAGMA is silently ignored. [SQLite PRAGMA](https://www.sqlite.org/pragma.html)

**[Recommendation]** Record the SQLite library version, driver version, compile options if available, journal mode, synchronous mode, busy timeout, page size, cache setting, auto-checkpoint threshold, and effective query plans. Treat a missing or silently ignored PRAGMA as a failed setup check, not as an accepted default.

## 3. DuckDB

### Single-process concurrency and one-file storage

- **[Source fact]** DuckDB can operate in persistent mode, where data is saved to disk, or in-memory mode, where data is held in memory and is lost when the process finishes. A persistent connection path opens or creates a database file. [DuckDB connect](https://duckdb.org/docs/current/connect/overview.html)
- **[Source fact]** DuckDB read-write in-process mode permits one process to read and write, with multiple writer threads supported through MVCC and optimistic concurrency control. Read-only mode permits multiple processes to read but no processes to write. [DuckDB concurrency](https://duckdb.org/docs/current/connect/concurrency)
- **[Source fact]** Within one process, concurrent appends do not conflict; concurrent updates or deletes of the same row can produce a transaction conflict. [DuckDB concurrency](https://duckdb.org/docs/current/connect/concurrency)
- **[Source fact]** DuckDB's native storage uses a single-file format, and the official reclaiming-space documentation calls out limitations inherent to that format. [DuckDB reclaiming space](https://duckdb.org/docs/current/operations_manual/footprint_of_duckdb/reclaiming_space)

**[Recommendation]** Use one DuckDB writer process per native database file in the benchmark. Use threads within that process only when the candidate architecture actually does so, and record both process count and DuckDB thread count. If an outbox/journal variant uses a separate materializer process, make that serialization boundary explicit and compare it as an architecture-level result.

**[Inference]** Starting several independent writer processes against the same native DuckDB file would test an unsupported or different access model rather than the documented in-process concurrency model.

### WAL and checkpoint behavior

- **[Source fact]** DuckDB's `CHECKPOINT` statement synchronizes data in the WAL to the database data file. [DuckDB CHECKPOINT](https://duckdb.org/docs/current/sql/statements/checkpoint)
- **[Source fact]** DuckDB performs checkpoint operations automatically based on WAL size; the configuration reference documents `checkpoint_threshold` and `wal_autocheckpoint`, with a documented default of 16 MiB on the current page. [DuckDB configuration](https://duckdb.org/docs/current/configuration/overview.html)
- **[Source fact]** DuckDB documents `auto_checkpoint_skip_wal_threshold` as a threshold at which it may skip WAL writing and only checkpoint; the documentation says concurrent commits are blocked while that checkpoint runs. [DuckDB configuration](https://duckdb.org/docs/current/configuration/overview.html)
- **[Source fact]** DuckDB documents `FORCE CHECKPOINT` as synchronizing data while preventing new transactions from starting; beginning with v1.4 it waits for the checkpoint lock rather than aborting in-progress transactions. [DuckDB CHECKPOINT](https://duckdb.org/docs/current/sql/statements/checkpoint)

**[Recommendation]** Make DuckDB checkpoint settings explicit and record them. Report steady-state write latency separately from manual or forced checkpoint latency, and include WAL size, database size, checkpoint duration, and blocked-commit time in the result.

**[Inference]** A direct DuckDB result taken after an unmeasured automatic checkpoint and a journal result taken before its materializer drains do not represent the same freshness or durability point.

### Memory, threads, and temporary storage

- **[Source fact]** DuckDB exposes configuration through `SET` or `PRAGMA`, and current settings can be inspected with `current_setting()` or `duckdb_settings()`. [DuckDB configuration](https://duckdb.org/docs/current/configuration/overview.html)
- **[Source fact]** DuckDB documents `memory_limit` and `threads` settings, including examples such as `SET memory_limit = '10GB'` and `SET threads TO 1`. [DuckDB configuration](https://duckdb.org/docs/current/configuration/overview.html)
- **[Source fact]** DuckDB's environment guidance gives a rule of thumb of at least 125 MB of memory per thread and recommends roughly 1-4 GB per thread for ideal performance depending on workload. [DuckDB environment](https://duckdb.org/docs/current/guides/performance/environment)
- **[Source fact]** DuckDB's documented default memory limit is 80% of RAM, and its out-of-memory guidance recommends reducing threads and setting a lower memory limit when necessary. [DuckDB configuration](https://duckdb.org/docs/current/configuration/overview.html) [DuckDB out-of-memory guidance](https://duckdb.org/docs/current/guides/performance/oom)
- **[Source fact]** DuckDB can spill larger-than-memory workloads to a temporary directory; in persistent mode the default temporary directory is based on the database filename and can be changed with `temp_directory`. [DuckDB tuning workloads](https://duckdb.org/docs/current/guides/performance/how_to_tune_workloads)

**[Recommendation]** On a constrained VM, set `threads`, `memory_limit`, and `temp_directory` explicitly for every run. Keep `threads` at or below the CPU allocation for a CPU-bound comparison, leave headroom for the application and OS, and place temporary spill storage on the same local filesystem class as the database. Record peak RSS, cgroup memory pressure, spill bytes, CPU utilization, and disk usage.

**[Inference]** DuckDB's thread count is part of the workload definition: it changes CPU parallelism, memory demand, row-group parallelism, and the likelihood of spilling or OOM termination.

### Bulk ingestion

- **[Source fact]** DuckDB recommends scanner extensions where available, bulk export to Parquet or CSV followed by its loaders, or the appender API. [DuckDB data import](https://duckdb.org/docs/current/guides/performance/import)
- **[Source fact]** DuckDB says to avoid row-by-row loops where possible because row-by-row inserts are detrimental to load performance, and recommends avoiding insert loops unless the data is small. [DuckDB data import](https://duckdb.org/docs/current/guides/performance/import)

**[Recommendation]** Separate row-oriented durable acceptance from batch materialization. For the batch phase, use the same input rows, batch boundaries, transaction boundaries, and ordering for each candidate. Do not compare DuckDB's bulk loader against SQLite's per-row acceptance path and call the difference an engine result; report it as an ingestion-method result.

**[Inference]** An outbox/journal can improve front-door latency by deferring analytical ingestion, but its total result must include the time and resources required to drain the journal into the query store.

### Row groups and zonemaps

- **[Source fact]** DuckDB stores data in row groups, and its current documentation gives 122,880 rows as the default row-group size for the database format. [DuckDB storage](https://duckdb.org/docs/current/internals/storage) [DuckDB tuning workloads](https://duckdb.org/docs/current/guides/performance/how_to_tune_workloads)
- **[Source fact]** DuckDB parallelizes at row-group granularity; a query using `k` threads needs at least `k * 122,880` rows to expose that level of row-group parallelism under the documented default. [DuckDB tuning workloads](https://duckdb.org/docs/current/guides/performance/how_to_tune_workloads)
- **[Source fact]** DuckDB automatically creates zonemaps, also called min-max indexes, for columns of general-purpose data types. A filter can skip a row group whose min-max range cannot contain the filter value. [DuckDB indexing](https://duckdb.org/docs/current/guides/performance/indexing.html)
- **[Source fact]** DuckDB documents that more ordered data makes zonemaps more useful and recommends ordering data by columns used in selective filters when inserting it. [DuckDB indexing](https://duckdb.org/docs/current/guides/performance/indexing.html)
- **[Source fact]** DuckDB also supports ART indexes; maintaining them can reduce change performance, and the documentation recommends defining explicit indexes only for highly selective queries with enough memory and adding them after bulk loading. [DuckDB indexing](https://duckdb.org/docs/current/guides/performance/indexing.html)

**[Recommendation]** Fix and record insertion order, row-group size, data types, and any explicit ART indexes. Run an arrival-order profile and, if useful, a separately labeled ordered-data profile. Do not sort the DuckDB input while leaving the SQLite or journal input unsorted.

**[Inference]** A journal replay policy can affect DuckDB query speed even with identical rows because replay order changes row-group min/max ranges, compression, and the amount of data a zonemap can skip.

### Profiling and plans

- **[Source fact]** DuckDB's `EXPLAIN` prints the physical query plan without running the query, while `EXPLAIN ANALYZE` executes the query and reports runtime information for operators and cardinalities. [DuckDB profiling](https://duckdb.org/docs/current/dev/profiling) [DuckDB EXPLAIN ANALYZE](https://duckdb.org/docs/current/guides/meta/explain_analyze)
- **[Source fact]** DuckDB warns that with multiple threads, the sum of per-operator times can exceed total query time because the operators run in parallel. [DuckDB EXPLAIN ANALYZE](https://duckdb.org/docs/current/guides/meta/explain_analyze)
- **[Source fact]** DuckDB supports profiling output formats and output files, including JSON through its profiling configuration. [DuckDB profiling](https://duckdb.org/docs/current/dev/profiling)

**[Recommendation]** Capture `EXPLAIN` and profiling artifacts in a non-timed diagnostic pass, then run the timed pass with profiling disabled unless profiling overhead is itself the subject of the test. Compare wall time, CPU time, operator plans, cardinality estimates, and actual results; do not sum parallel operator times as query latency.

### Compaction, space reclamation, and storage compatibility

- **[Source fact]** DuckDB says checkpointing partially reclaims space from deleted rows by merging row groups with significant adjacent deletes. [DuckDB CHECKPOINT](https://duckdb.org/docs/current/sql/statements/checkpoint)
- **[Source fact]** DuckDB says `VACUUM` does not trigger delete vacuuming and does not reclaim that space. [DuckDB reclaiming space](https://duckdb.org/docs/current/operations_manual/footprint_of_duckdb/reclaiming_space) [DuckDB VACUUM](https://duckdb.org/docs/current/sql/statements/vacuum)
- **[Source fact]** DuckDB documents compaction by copying one database into a fresh database with `COPY FROM DATABASE`. [DuckDB reclaiming space](https://duckdb.org/docs/current/operations_manual/footprint_of_duckdb/reclaiming_space)
- **[Source fact]** DuckDB storage-format backward compatibility starts with v0.10 for newer versions reading older files, while forward compatibility is best effort and may be partially broken. [DuckDB storage format](https://duckdb.org/docs/current/internals/storage)
- **[Source fact]** DuckDB documents explicit storage versions and warns that a file written with a specified storage version cannot be opened by older DuckDB releases than that version. [DuckDB storage format](https://duckdb.org/docs/current/internals/storage)
- **[Source fact]** DuckDB documents `EXPORT DATABASE` and `IMPORT DATABASE` as a route for moving data between storage formats. [DuckDB storage format](https://duckdb.org/docs/current/internals/storage)

**[Recommendation]** Treat checkpoint, delete-space reclamation, and full compaction as separate phases. Record live database size, WAL size, temporary files, and post-checkpoint size. Pin the exact DuckDB version and either pin the storage compatibility version or record the default storage version used; never use a version-mismatched database file as a benchmark input without documenting conversion.

**[Inference]** A compaction result is not a steady-state storage result. Including `COPY FROM DATABASE` in one candidate's timed ingestion path but not another measures maintenance policy, not the same database operation.

## 4. Fair Benchmark Design on a Constrained Self-Hosted VM

The following is a proposed protocol derived from the source facts above and Cimi's acceptance-boundary ADR. It is not a claim that Daytona, SQLite, or DuckDB prescribe this exact benchmark.

### Environment controls

- **[Recommendation]** Use one fixed VM image, filesystem, storage device, mount path, CPU allocation, memory allocation, disk quota, kernel, runtime, and dependency lockfile for all candidates.
- **[Recommendation]** Keep the database, WAL/journal, and DuckDB temporary directory on the same local block-backed storage class. Do not use a network filesystem or FUSE volume for the live database path.
- **[Recommendation]** Disable swap for a latency comparison, or keep it enabled for every candidate and report swap activity. Record filesystem type, device, free space, mount options, and whether the storage is local or network-backed.
- **[Recommendation]** Pin and record the SQLite library and driver, DuckDB library and driver, Node or other runtime, Daytona CLI/SDK if used, and all relevant configuration values.
- **[Recommendation]** Start each timed candidate from a clean, known database state. Do not reuse a warmed page cache, DuckDB connection cache, WAL, spill directory, or materializer backlog across candidates unless the test explicitly measures warm restart behavior.

### Workload phases

1. **[Recommendation] Acceptance:** Feed identical normalized events to each candidate. Measure acknowledgment latency, throughput, errors, retries, bytes written, and the exact point at which the response is allowed to return.
2. **[Recommendation] Drain/materialization:** For journal or outbox variants, drain the same accepted input using fixed batch sizes and transaction boundaries. Measure drain throughput, backlog depth, CPU, memory, WAL/journal growth, and time until every accepted event is queryable.
3. **[Recommendation] Analytical queries:** Run the same result-checked query set against equivalent schemas. Record cold-cache and warm-cache latency separately, plus query plans and result checksums.
4. **[Recommendation] Mixed load:** Run fixed producer, materializer, and reader concurrency. Report writer tail latency, reader tail latency, checkpoint stalls, lock/busy errors, DuckDB transaction conflicts, and queue growth.
5. **[Recommendation] Restart and recovery:** Stop or kill the process at controlled points, restart it, verify accepted-event recovery and deduplication, and measure recovery time. Label application restart, sandbox stop/start, VM pause/resume, and power-loss simulation as distinct experiments.
6. **[Recommendation] Backup and compaction:** Run SQLite Online Backup API, DuckDB checkpoint, delete reclamation, and full-copy compaction as explicit operational tests. Report them separately from request and query latency.

### Candidate controls

- **[Recommendation] SQLite:** Set and record WAL mode, `synchronous`, busy timeout, page size, cache size, auto-checkpoint threshold, indexes, and statistics state. Capture WAL growth and checkpoint latency.
- **[Recommendation] DuckDB:** Set and record database path, `threads`, `memory_limit`, `temp_directory`, checkpoint threshold, row-group size, storage compatibility version, data order, and explicit indexes. Capture WAL, spill, checkpoint, and database sizes.
- **[Recommendation] Outbox/journal:** Define the durable record, commit or flush boundary, acknowledgment rule, replay order, deduplication rule, batch size, and query-visibility condition before timing. Include journal append, materializer, retries, conflicts, and backlog in end-to-end results.
- **[Inference]** Because Cimi's current contract acknowledges durable journal acceptance before asynchronous DuckDB materialization, a lower acceptance latency for a journal variant is expected to trade against a separate query-freshness interval. That is a useful architectural result only if both intervals are reported.

### Minimum result set

- **[Recommendation]** Report p50, p95, and p99 acceptance latency and query latency, not only averages.
- **[Recommendation]** Report accepted rows, queryable rows, rejected or retried operations, lock/busy errors, transaction conflicts, and recovery failures.
- **[Recommendation]** Report CPU time, wall time, peak RSS, cgroup memory pressure, thread count, disk bytes written if available, database size, WAL/journal size, temporary spill size, checkpoint time, and compaction time.
- **[Recommendation]** Report query freshness as the time from durable acceptance to query visibility for every asynchronous variant.
- **[Recommendation]** Repeat each profile enough times to show run-to-run variance, discard setup and warm-up only by a predeclared rule, and preserve raw measurements and plan/profiling artifacts.

## 5. Cimi Implementation Audit

The current database client skeleton now applies the following production-safe defaults:

- **SQLite:** WAL mode, `synchronous=FULL` for power-loss durability, foreign-key enforcement, a 5-second busy timeout, and the documented 1000-page automatic WAL checkpoint threshold.
- **DuckDB:** one writer thread by default, an explicit 512 MiB buffer-manager limit, a local temporary spill directory, a 1 GiB temporary-directory cap, and an explicit `CHECKPOINT` before close. Every setting is overridable through `CreateAnalyticsDbOptions`.
- **Storage location:** both database files and DuckDB spill files remain under the caller-provided local data path; no network or Daytona volume is selected by the clients.
- **Testing:** the SQLite test asserts the effective PRAGMA values, and the DuckDB test exercises explicit threads, memory, temporary-directory, and reopen/close configuration.
- **Benchmark parity:** the benchmark defaults now use the same settings and the selected 1,000-row production batch profile. Smaller batch sizes remain available only as explicit diagnostic overrides.

These settings harden the client boundary, but they do not mean the whole database lifecycle is complete. The following remain implementation work before production release:

- The `AnalyticsDb` interface currently exposes lifecycle/readiness only; ingestion, materialization, backup/restore orchestration, and recovery procedures are not yet product code.
- Control-plane migration is still a baseline `CREATE TABLE IF NOT EXISTS` script rather than a versioned migration history.
- The frontend app factory now exposes `close()` to checkpoint DuckDB and close SQLite; the Astro standalone runtime still needs to wire that method to its shutdown signals.
- The single-process DuckDB writer boundary must be enforced by the eventual materializer/ingestion architecture, not assumed merely from the client library.

## Official Sources

### Daytona

- [CLI](https://www.daytona.io/docs/en/tools/cli/)
- [Sandboxes](https://www.daytona.io/docs/en/sandboxes/)
- [Persistence](https://www.daytona.io/docs/en/persistence/)
- [Volumes](https://www.daytona.io/docs/en/volumes/)
- [Process and Code Execution](https://www.daytona.io/docs/en/process-code-execution/)
- [API Keys](https://www.daytona.io/docs/en/api-keys/)
- [Isolation](https://www.daytona.io/docs/en/isolation/)
- [TypeScript SDK](https://www.daytona.io/docs/en/typescript-sdk/)

### SQLite

- [Write-Ahead Logging](https://sqlite.org/wal.html)
- [Isolation](https://www.sqlite.org/isolation.html)
- [PRAGMA statements](https://www.sqlite.org/pragma.html)
- [Online Backup API](https://www.sqlite.org/backup.html)
- [Query Planning](https://sqlite.org/queryplanner.html)
- [Query Optimizer Overview](https://sqlite.org/optoverview.html)
- [Checkpoint API](https://www.sqlite.org/c3ref/wal_checkpoint_v2.html)

### DuckDB

- [Connect and persistence](https://duckdb.org/docs/current/connect/overview.html)
- [Concurrency](https://duckdb.org/docs/current/connect/concurrency)
- [Configuration](https://duckdb.org/docs/current/configuration/overview.html)
- [Data import](https://duckdb.org/docs/current/guides/performance/import)
- [Tuning workloads](https://duckdb.org/docs/current/guides/performance/how_to_tune_workloads)
- [Environment](https://duckdb.org/docs/current/guides/performance/environment)
- [Out-of-memory guidance](https://duckdb.org/docs/current/guides/performance/oom)
- [Storage versions and format](https://duckdb.org/docs/current/internals/storage)
- [Indexing and zonemaps](https://duckdb.org/docs/current/guides/performance/indexing.html)
- [Profiling](https://duckdb.org/docs/current/dev/profiling)
- [EXPLAIN ANALYZE](https://duckdb.org/docs/current/guides/meta/explain_analyze)
- [CHECKPOINT](https://duckdb.org/docs/current/sql/statements/checkpoint)
- [Reclaiming space](https://duckdb.org/docs/current/operations_manual/footprint_of_duckdb/reclaiming_space)
- [VACUUM](https://duckdb.org/docs/current/sql/statements/vacuum)

### Cimi context

- [Durable Event Acceptance Boundary](../../adr/0002-durable-event-acceptance-boundary.md)
