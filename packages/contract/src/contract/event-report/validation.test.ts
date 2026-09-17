import { describe, expect, it } from 'vitest'
import { SEvent, SEventReportFilter, isWithinAuthenticatedEventBucketLimit } from './schema.ts'
import { SEventBreakdownsInput } from './query/get-breakdowns.ts'
import { SEventOverviewInput } from './query/get-overview.ts'
import { SEventListInput } from './query/list.ts'
import { SEventTimeseriesInput } from './query/get-timeseries.ts'

const pagination = { offset: 0, limit: 10 }
const reportInput = {
  siteId: 'ste-1',
  fromDate: '2026-08-24',
  toDate: '2026-08-24',
  eventKind: 'page_view' as const,
}

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
    expect({
      scope: 'event',
      field: 'property.anything',
      operator: 'equals',
      values: [false, 42, null, 'value'],
    }).toEqual(expect.schemaMatching(SEventReportFilter))
  })

  it('accepts null only for equality against an Event field', () => {
    expect({
      scope: 'event',
      field: 'referrer',
      operator: 'equals',
      values: [null],
    }).toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'event',
      field: 'referrer',
      operator: 'not_equals',
      values: [null],
    }).not.toEqual(expect.schemaMatching(SEventReportFilter))
  })

  it('checks direct Event filters against the outer Event Kind', () => {
    const inputs = [
      { schema: SEventOverviewInput, value: reportInput },
      { schema: SEventTimeseriesInput, value: { ...reportInput, granularity: 'day' } },
      { schema: SEventListInput, value: { ...reportInput, ...pagination } },
      { schema: SEventBreakdownsInput, value: { ...reportInput, ...pagination } },
    ] as const

    for (const { schema, value } of inputs) {
      expect({
        ...value,
        filters: [{ scope: 'event', field: 'pagePath', operator: 'equals', values: [null] }],
      }).not.toEqual(expect.schemaMatching(schema))
      expect({
        ...value,
        filters: [{ scope: 'event', field: 'name', operator: 'equals', values: ['home'] }],
      }).not.toEqual(expect.schemaMatching(schema))
    }

    expect({
      ...reportInput,
      eventKind: 'custom_event',
      filters: [{ scope: 'event', field: 'pagePath', operator: 'equals', values: [null] }],
    }).toEqual(expect.schemaMatching(SEventOverviewInput))
    expect({
      ...reportInput,
      eventKind: 'outbound',
      filters: [{ scope: 'event', field: 'name', operator: 'equals', values: [null] }],
    }).toEqual(expect.schemaMatching(SEventOverviewInput))
    expect({
      ...reportInput,
      eventKind: 'performance',
      filters: [{ scope: 'event', field: 'unit', operator: 'equals', values: [null] }],
    }).toEqual(expect.schemaMatching(SEventOverviewInput))
    expect({
      ...reportInput,
      eventKind: 'error',
      filters: [{ scope: 'event', field: 'code', operator: 'equals', values: [null] }],
    }).toEqual(expect.schemaMatching(SEventOverviewInput))
  })

  it('rejects invalid direct operators and values', () => {
    expect({
      scope: 'event',
      field: 'kind',
      operator: 'greater_than',
      values: ['page_view'],
    }).not.toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'event',
      field: 'pagePath',
      operator: 'greater_than',
      values: ['42'],
    }).not.toEqual(expect.schemaMatching(SEventReportFilter))
  })

  it('validates Event action property filters with property compatibility', () => {
    expect({
      scope: 'session',
      operator: 'has_done',
      action: {
        kind: 'custom_event',
        name: 'checkout',
        propertyFilters: [
          { field: 'total', operator: 'equals', values: [42, false, null] },
          { field: 'label', operator: 'contains', values: ['paid'] },
        ],
      },
      range: 'same_range',
    }).toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'session',
      operator: 'has_done',
      action: {
        kind: 'custom_event',
        name: 'checkout',
        propertyFilters: [{ field: 'total', operator: 'greater_than', values: ['42'] }],
      },
      range: 'same_range',
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
      siteId: 'ste-1',
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
