import { describe, expect, it } from 'vitest'
import {
  SMetricPoint,
  STrafficAbsoluteDateTime,
  isWithinAuthenticatedReportBucketLimit,
} from './schema.ts'

describe('traffic report contract', () => {
  it('requires named trend metrics and their denominator semantics', () => {
    expect({
      metric: 'bounce_rate',
      grain: 'session',
      unit: 'rate',
      denominator: 12,
      at: '2026-08-24T12:00:00Z',
      value: 0.25,
      complete: true,
    }).toEqual(expect.schemaMatching(SMetricPoint))
    expect({
      at: '2026-08-24T12:00:00Z',
      value: 1,
      complete: true,
    }).not.toEqual(expect.schemaMatching(SMetricPoint))
  })

  it('requires absolute trend timestamps', () => {
    expect('2026-08-24T12:00:00').not.toEqual(expect.schemaMatching(STrafficAbsoluteDateTime))
    expect('2026-08-24T12:00:00+02:00').toEqual(expect.schemaMatching(STrafficAbsoluteDateTime))
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
