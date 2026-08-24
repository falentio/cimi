import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SEvent, SEventReportFilter, isWithinAuthenticatedEventBucketLimit } from './schema.ts'
import { SEventBreakdownsInput } from './query/get-breakdowns.ts'
import { SEventListInput } from './query/list.ts'

const pagination = { offset: 0, limit: 10 }

describe('event report contract', () => {
  it('accepts typed property filters and rejects incompatible operators', () => {
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'event',
        field: 'property.orderTotal',
        operator: 'greater_than',
        values: [42],
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'event',
        field: 'property.isTrial',
        operator: 'equals',
        values: [false],
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'event',
        field: 'property.orderTotal',
        operator: 'greater_than',
        values: ['42'],
      }).success,
    ).toBe(false)
  })

  it('represents authenticated same-range has_done and has_not_done filters', () => {
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'session',
        operator: 'has_done',
        action: { kind: 'custom_event', name: 'checkout' },
        range: 'same_range',
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'session',
        operator: 'has_not_done',
        action: { kind: 'page_view' },
        range: 'same_range',
      }).success,
    ).toBe(true)
  })

  it('uses occurrence time only for Event list sorting', () => {
    const base = {
      siteId: 'site-1',
      eventKind: 'page_view',
      fromDate: '2026-08-24',
      toDate: '2026-08-24',
      ...pagination,
    }
    expect(v.safeParse(SEventListInput, { ...base, sort: 'occurredAt' }).success).toBe(true)
    expect(v.safeParse(SEventListInput, { ...base, sort: 'createdAt' }).success).toBe(false)
    expect(
      v.safeParse(SEventBreakdownsInput, { ...base, sort: 'count', direction: 'desc' }).success,
    ).toBe(true)
  })

  it('requires absolute occurrence and receipt timestamps', () => {
    const event = {
      eventId: 'event-1',
      occurredAt: '2026-08-24T12:00:00Z',
      createdAt: '2026-08-24T12:00:01+00:00',
      referrer: null,
      properties: null,
      kind: 'page_view',
      pagePath: '/',
    }
    expect(v.safeParse(SEvent, event).success).toBe(true)
    expect(v.safeParse(SEvent, { ...event, occurredAt: '2026-08-24T12:00:00' }).success).toBe(false)
  })

  it('uses per-granularity timeseries bounds', () => {
    expect(
      isWithinAuthenticatedEventBucketLimit({
        fromDate: '2026-08-01',
        toDate: '2026-08-30',
        granularity: 'hour',
      }),
    ).toBe(true)
    expect(
      isWithinAuthenticatedEventBucketLimit({
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        granularity: 'hour',
      }),
    ).toBe(false)
  })
})
