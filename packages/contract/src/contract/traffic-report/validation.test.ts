import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  SMetricPoint,
  STrafficAbsoluteDateTime,
  isWithinAuthenticatedReportBucketLimit,
} from './schema.ts'

describe('traffic report contract', () => {
  it('requires named trend metrics and their denominator semantics', () => {
    expect(
      v.safeParse(SMetricPoint, {
        metric: 'bounce_rate',
        grain: 'session',
        unit: 'rate',
        denominator: 12,
        at: '2026-08-24T12:00:00Z',
        value: 0.25,
        complete: true,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SMetricPoint, {
        at: '2026-08-24T12:00:00Z',
        value: 1,
        complete: true,
      }).success,
    ).toBe(false)
  })

  it('requires absolute trend timestamps', () => {
    expect(v.safeParse(STrafficAbsoluteDateTime, '2026-08-24T12:00:00').success).toBe(false)
    expect(v.safeParse(STrafficAbsoluteDateTime, '2026-08-24T12:00:00+02:00').success).toBe(true)
  })

  it('uses separate bucket bounds for each authenticated granularity', () => {
    expect(
      isWithinAuthenticatedReportBucketLimit({
        fromDate: '2026-08-24',
        toDate: '2026-08-24',
        granularity: 'minute',
      }),
    ).toBe(true)
    expect(
      isWithinAuthenticatedReportBucketLimit({
        fromDate: '2026-08-24',
        toDate: '2026-08-25',
        granularity: 'minute',
      }),
    ).toBe(false)
    expect(
      isWithinAuthenticatedReportBucketLimit({
        fromDate: '2026-08-01',
        toDate: '2026-08-30',
        granularity: 'hour',
      }),
    ).toBe(true)
    expect(
      isWithinAuthenticatedReportBucketLimit({
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        granularity: 'hour',
      }),
    ).toBe(false)
  })
})
