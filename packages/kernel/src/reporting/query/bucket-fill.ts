import type { BucketStart, HalfOpenInterval, InstantMs } from '../types.ts'

/** One bucket row as the store returns it: sparse, keyed by bucket start. */
export interface BucketCount {
  readonly at: InstantMs
  readonly count: number
}

export interface FilledBucket<T> {
  readonly at: InstantMs
  readonly value: T
  readonly complete: boolean
}

/**
 * Merge the store's sparse per-bucket rows into the period's authoritative bucket spine.
 *
 * - Presence and order come ONLY from `bucketStarts`; the store cannot invent or drop a bucket.
 * - A bucket with no row is zero-filled.
 * - A bucket is complete when its end instant is <= `completeThrough`. The bucket that contains
 *   the frontier is the current partial bucket and is `complete: false`. When `completeThrough` is
 *   null nothing is provably covered, so every bucket is `complete: false`.
 * - The end instant of bucket i is bucketStarts[i+1].at; the last bucket ends at `interval.endExclusive`.
 */
export function fillBuckets<T>(input: {
  readonly bucketStarts: readonly BucketStart[]
  readonly interval: HalfOpenInterval
  readonly completeThrough: InstantMs | null
  readonly rows: readonly BucketCount[]
  readonly toValue: (row: BucketCount) => T
}): readonly FilledBucket<T>[] {
  if (input.bucketStarts.length === 0) return []

  const rowsByStart = new Map<InstantMs, BucketCount>()
  for (const row of input.rows) {
    rowsByStart.set(row.at, row)
  }

  return input.bucketStarts.map((bucket, index) => {
    const next = input.bucketStarts[index + 1]
    const end = next === undefined ? input.interval.endExclusive : next.at
    const row = rowsByStart.get(bucket.at) ?? { at: bucket.at, count: 0 }
    const complete = input.completeThrough !== null && end <= input.completeThrough
    return { at: bucket.at, value: input.toValue(row), complete }
  })
}
