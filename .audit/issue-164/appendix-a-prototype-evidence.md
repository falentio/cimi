# Appendix A. Prototype evidence

## Question the prototype answered

Which insert strategy takes the SQLite journal into the DuckDB projection fast
enough that a 27,000-event demo site does not need a rebuild, and how much does a
report read behind the append chain observe?

## Artifacts

- Measured file: `.audit/issue-164/append-throughput-proof.json`, measured at
  2026-10-10T13:54Z, `@duckdb/node-api 1.5.5-r.4`, threads 1, one DuckDB file per
  strategy, a 3,000-event control database seeded through
  `AcceptanceRepositoryDrizzle.append`.
- Transaction probe, run separately: the DuckDB appender participates in the
  surrounding transaction. `createAppender('t')` plus rows plus `ROLLBACK` leaves
  the table empty, and the following `COMMIT` then persists 5 rows. This is what
  makes the per-chunk rollback sound, which is the property the whole idempotency
  argument rests on.

## Results

| Strategy | Rows | Rows/s | Against the rebuild baseline |
| --- | --- | --- | --- |
| Rebuild, one `await connection.run` per row | 3,000 | 84.8 | 1x |
| Multi-row `INSERT ... VALUES`, 250 rows per statement | 3,000 | 1,545 | 18.2x |
| DuckDB appender, one vector write per row | 3,000 | 25,759 | 303.8x |
| Set-based derivation of visitors and sessions | 3,000 | 46 ms total | not the bottleneck |
| Append with interleaved reads | 3,000 | 1,631 | 19.2x |

Read latency while the append ran: p50 6.9 ms, p95 1,190 ms, max 1,190 ms. Idle
read p50 was 5.9 ms, so a read that lands between chunks pays nothing measurable.

## One fidelity trap the prototype caught

The appender wrote `occurrence_time` at microseconds precision
(1780833600000000) where the rebuild produced milliseconds
(1780833600000). `DuckDBAppender.appendTimestamp` takes a `DuckDBTimestampValue`,
which is `{ micros: bigint }`, not a `Date` and not epoch milliseconds. Passing
epoch milliseconds is coerced as microseconds, a silent 1000x skew. The append
multiplies by 1000n. `appendVarchar(null)` also throws, so every nullable column
needs an explicit `appendNull()`.

## What was not measured

A real `rebuild()` at 51,172 events on the branch. The issue's own measurement at
230 rows/s is used instead, since the rebuild's per-row loop is unchanged in shape.
