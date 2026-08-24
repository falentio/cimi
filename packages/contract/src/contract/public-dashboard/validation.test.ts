import { describe, expect, it } from 'vitest'
import {
  MAX_PUBLIC_DASHBOARD_DIMENSION_ROWS,
  MAX_PUBLIC_DASHBOARD_INTERVAL_STARTS,
  SPublicDashboardDimensionBucket,
  SPublicDashboardFilter,
  SPublicDashboardTimeBucket,
  SPublicRateLimitAdapterResponse,
  SPublicUtcDateTime,
} from './schema.ts'

describe('public dashboard contract', () => {
  it('keeps interval and dimension row budgets separate', () => {
    expect(MAX_PUBLIC_DASHBOARD_INTERVAL_STARTS).toBe(2_161)
    expect(MAX_PUBLIC_DASHBOARD_DIMENSION_ROWS).toBe(100)
  })

  it('requires UTC instants for time buckets and reserves null for dimensions', () => {
    expect({
      key: '2026-11-01T01:00:00-04:00',
      at: '2026-11-01T05:00:00Z',
      value: 1,
    }).toEqual(expect.schemaMatching(SPublicDashboardTimeBucket))
    expect({
      key: '2026-11-01T01:00:00-04:00',
      at: '2026-11-01T01:00:00-04:00',
      value: 1,
    }).not.toEqual(expect.schemaMatching(SPublicDashboardTimeBucket))
    expect({
      key: '2026-11-01T01:00:00',
      at: '2026-11-01T05:00:00Z',
      value: 1,
    }).not.toEqual(expect.schemaMatching(SPublicDashboardTimeBucket))
    expect({
      key: '2026-11-01T01:00:00-04:00',
      at: '2026-11-01T05:00:00Z',
      value: 1,
    }).toEqual(expect.schemaMatching(SPublicDashboardTimeBucket))
    expect({
      key: '2026-11-01T01:00:00-05:00',
      at: '2026-11-01T06:00:00Z',
      value: 1,
    }).toEqual(expect.schemaMatching(SPublicDashboardTimeBucket))
    expect({
      key: 'x'.repeat(2048),
      at: null,
      value: null,
    }).toEqual(expect.schemaMatching(SPublicDashboardDimensionBucket))
    expect('2026-11-01T01:00:00').not.toEqual(expect.schemaMatching(SPublicUtcDateTime))
  })

  it('keeps Public Query filter scope narrower than authenticated filters', () => {
    expect({
      scope: 'visitor',
      field: 'identityKind',
      operator: 'equals',
      values: ['anonymous'],
    }).toEqual(expect.schemaMatching(SPublicDashboardFilter))
    expect({
      scope: 'visitor',
      field: 'identityKind',
      operator: 'not_equals',
      values: ['anonymous'],
    }).not.toEqual(expect.schemaMatching(SPublicDashboardFilter))
  })

  it('models both rate-limit metadata and adapter headers', () => {
    expect({
      status: 429,
      headers: {
        'retry-after': '60',
        'x-ratelimit-limit': '360',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1787572860',
        'x-ratelimit-scope': 'site',
      },
    }).toEqual(expect.schemaMatching(SPublicRateLimitAdapterResponse))
  })
})
