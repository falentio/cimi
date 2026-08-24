import { describe, expect, it } from 'vitest'
import { SEvent, SEventReportFilter, isWithinAuthenticatedEventBucketLimit } from './schema.ts'
import { SEventBreakdownsInput } from './query/get-breakdowns.ts'
import { SEventListInput } from './query/list.ts'

const pagination = { offset: 0, limit: 10 }

describe('event report contract', () => {
  it('accepts typed property filters and rejects incompatible operators', () => {
    expect({
      scope: 'event',
      field: 'property.orderTotal',
      operator: 'greater_than',
      values: [42],
    }).toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'event',
      field: 'property.isTrial',
      operator: 'equals',
      values: [false],
    }).toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'event',
      field: 'property.orderTotal',
      operator: 'greater_than',
      values: ['42'],
    }).not.toEqual(expect.schemaMatching(SEventReportFilter))
  })

  it('represents authenticated same-range has_done and has_not_done filters', () => {
    expect({
      scope: 'session',
      operator: 'has_done',
      action: { kind: 'custom_event', name: 'checkout' },
      range: 'same_range',
    }).toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'session',
      operator: 'has_not_done',
      action: { kind: 'page_view' },
      range: 'same_range',
    }).toEqual(expect.schemaMatching(SEventReportFilter))
  })

  it('uses occurrence time only for Event list sorting', () => {
    const base = {
      siteId: 'site-1',
      eventKind: 'page_view',
      fromDate: '2026-08-24',
      toDate: '2026-08-24',
      ...pagination,
    }
    expect({ ...base, sort: 'occurredAt' }).toEqual(expect.schemaMatching(SEventListInput))
    expect({ ...base, sort: 'createdAt' }).not.toEqual(expect.schemaMatching(SEventListInput))
    expect({ ...base, sort: 'count', direction: 'desc' }).toEqual(
      expect.schemaMatching(SEventBreakdownsInput),
    )
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
    expect(event).toEqual(expect.schemaMatching(SEvent))
    expect({ ...event, occurredAt: '2026-08-24T12:00:00' }).not.toEqual(
      expect.schemaMatching(SEvent),
    )
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
