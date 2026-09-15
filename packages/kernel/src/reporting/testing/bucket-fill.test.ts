import { describe, expect, it } from 'vitest'

import { createInstantMs, type BucketStart, type HalfOpenInterval } from '../types.ts'
import { fillBuckets, type BucketCount, type FilledBucket } from '../query/index.ts'

function instant(value: string): ReturnType<typeof createInstantMs> {
  return createInstantMs(Date.parse(value))
}

function starts(...values: readonly string[]): readonly BucketStart[] {
  return values.map((value) => ({ at: instant(value), localLabel: value, offsetMinutes: 0 }))
}

const interval: HalfOpenInterval = {
  start: instant('2026-09-05T00:00:00.000Z'),
  endExclusive: instant('2026-09-05T03:00:00.000Z'),
}

const spine = starts(
  '2026-09-05T00:00:00.000Z',
  '2026-09-05T01:00:00.000Z',
  '2026-09-05T02:00:00.000Z',
)

const countValue = (row: BucketCount): number => row.count

function fill(input: {
  readonly bucketStarts: readonly BucketStart[]
  readonly interval: HalfOpenInterval
  readonly completeThrough: ReturnType<typeof createInstantMs> | null
  readonly rows: readonly BucketCount[]
}): readonly FilledBucket<number>[] {
  return fillBuckets({
    ...input,
    toValue: countValue,
  })
}

describe('fillBuckets zero-filling and ordering', () => {
  it('zero-fills the gap a store row does not cover', () => {
    const filled = fill({
      bucketStarts: spine,
      interval,
      completeThrough: null,
      rows: [
        { at: instant('2026-09-05T00:00:00.000Z'), count: 7 },
        { at: instant('2026-09-05T02:00:00.000Z'), count: 9 },
      ],
    })

    expect(filled.map((bucket) => bucket.value)).toEqual([7, 0, 9])
  })

  it('returns exactly one bucket per bucketStart in the spine order', () => {
    const filled = fill({
      bucketStarts: spine,
      interval,
      completeThrough: null,
      rows: [{ at: instant('2026-09-05T02:00:00.000Z'), count: 4 }],
    })

    expect(filled).toHaveLength(spine.length)
    expect(filled.map((bucket) => bucket.at)).toEqual(spine.map((bucket) => bucket.at))
  })

  it('passes the zero-count row through toValue for a missing bucket', () => {
    const seen: BucketCount[] = []
    const filled = fillBuckets({
      bucketStarts: spine,
      interval,
      completeThrough: null,
      rows: [{ at: instant('2026-09-05T00:00:00.000Z'), count: 5 }],
      toValue: (row) => {
        seen.push(row)
        return row.count
      },
    })

    expect(filled[1]?.value).toBe(0)
    expect(seen).toContainEqual({ at: instant('2026-09-05T01:00:00.000Z'), count: 0 })
  })

  it('returns an empty result for an empty bucket spine', () => {
    expect(
      fill({
        bucketStarts: [],
        interval,
        completeThrough: null,
        rows: [{ at: instant('2026-09-05T00:00:00.000Z'), count: 3 }],
      }),
    ).toEqual([])
  })

  it('ignores a store row whose start is not in the spine', () => {
    const filled = fill({
      bucketStarts: spine,
      interval,
      completeThrough: null,
      rows: [
        { at: instant('2026-09-05T00:00:00.000Z'), count: 1 },
        { at: instant('2026-09-05T09:00:00.000Z'), count: 99 },
      ],
    })

    expect(filled.map((bucket) => bucket.value)).toEqual([1, 0, 0])
  })
})

describe('fillBuckets completeness', () => {
  it('marks every bucket incomplete when completeThrough is null', () => {
    const filled = fill({ bucketStarts: spine, interval, completeThrough: null, rows: [] })

    expect(filled.map((bucket) => bucket.complete)).toEqual([false, false, false])
  })

  it('marks every bucket complete when completeThrough covers the last bucket end', () => {
    const filled = fill({
      bucketStarts: spine,
      interval,
      completeThrough: instant('2026-09-05T03:00:00.000Z'),
      rows: [],
    })

    expect(filled.map((bucket) => bucket.complete)).toEqual([true, true, true])
  })

  it('marks buckets before the frontier complete and the partial bucket incomplete', () => {
    const filled = fill({
      bucketStarts: spine,
      interval,
      completeThrough: instant('2026-09-05T01:30:00.000Z'),
      rows: [],
    })

    expect(filled.map((bucket) => bucket.complete)).toEqual([true, false, false])
  })

  it('marks a bucket complete when its end equals completeThrough exactly', () => {
    const filled = fill({
      bucketStarts: spine,
      interval,
      completeThrough: instant('2026-09-05T01:00:00.000Z'),
      rows: [],
    })

    expect(filled.map((bucket) => bucket.complete)).toEqual([true, false, false])
  })

  it('treats the last bucket end as interval.endExclusive', () => {
    const filled = fill({
      bucketStarts: spine,
      interval: {
        start: instant('2026-09-05T00:00:00.000Z'),
        endExclusive: instant('2026-09-05T02:30:00.000Z'),
      },
      completeThrough: instant('2026-09-05T02:30:00.000Z'),
      rows: [],
    })

    expect(filled.map((bucket) => bucket.complete)).toEqual([true, true, true])
  })

  it('uses the next start as a nonzero-gap bucket end', () => {
    const gapped = starts('2026-09-05T00:00:00.000Z', '2026-09-05T05:00:00.000Z')

    expect(
      fill({
        bucketStarts: gapped,
        interval: {
          start: instant('2026-09-05T00:00:00.000Z'),
          endExclusive: instant('2026-09-05T06:00:00.000Z'),
        },
        completeThrough: instant('2026-09-05T05:00:00.000Z'),
        rows: [],
      }).map((bucket) => bucket.complete),
    ).toEqual([true, false])
  })
})
