import { describe, expect, it } from 'vitest'
import { SCollectEventInput } from './command/collect-event.ts'
import {
  COLLECT_EVENTS_MAX_RAW_REQUEST_BYTES,
  SCollectEventsInput,
} from './command/collect-events.ts'
import { COLLECT_EVENT_MAX_RAW_REQUEST_BYTES } from './command/collect-event.ts'
import { SBatchEventResponse, SBatchEventResult, SEvent } from './schema.ts'
import {
  EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS,
  EVENT_ACCEPTANCE_PENDING_MAX_EVENTS,
  EVENT_ACCEPTANCE_WINDOW_MS,
} from './acceptance.ts'
import { SDate, SDateTime } from '../../schema/index.ts'

const common = {
  eventId: 'event-1',
  ingestionIdentifier: 'site-ingestion-1',
}

describe('event ingestion schemas', () => {
  it('requires kind-specific page-view fields', () => {
    expect({ ...common, kind: 'page_view', pagePath: '/checkout' }).toEqual(
      expect.schemaMatching(SEvent),
    )
    expect({ ...common, kind: 'page_view' }).not.toEqual(expect.schemaMatching(SEvent))
  })

  it('requires kind-specific custom-event fields', () => {
    expect({ ...common, kind: 'custom_event', name: 'completed' }).toEqual(
      expect.schemaMatching(SEvent),
    )
    expect({ ...common, kind: 'custom_event' }).not.toEqual(expect.schemaMatching(SEvent))
  })

  it('accepts a bounded non-atomic batch shape', () => {
    expect({
      ingestionIdentifier: 'site-ingestion-1',
      events: [{ ...common, kind: 'page_view', pagePath: '/' }],
    }).toEqual(expect.schemaMatching(SCollectEventsInput))
  })

  it('accepts privacy context on singular requests', () => {
    expect({
      ...common,
      kind: 'page_view',
      pagePath: '/',
      collectionContext: { consent: 'granted', gpc: false, dnt: false },
    }).toEqual(expect.schemaMatching(SCollectEventInput))
    expect({
      ...common,
      kind: 'page_view',
      pagePath: '/',
      collectionContext: { consent: 'yes' },
    }).not.toEqual(expect.schemaMatching(SCollectEventInput))
  })

  it('scopes privacy context to the batch envelope', () => {
    expect({
      ingestionIdentifier: common.ingestionIdentifier,
      collectionContext: { consent: 'denied', gpc: true },
      events: [{ ...common, kind: 'page_view', pagePath: '/' }],
    }).toEqual(expect.schemaMatching(SCollectEventsInput))
    expect({
      ingestionIdentifier: common.ingestionIdentifier,
      events: [{ ...common, kind: 'page_view', pagePath: '/', collectionContext: {} }],
    }).not.toEqual(expect.schemaMatching(SCollectEventsInput))
  })

  it('keeps malformed items eligible for per-item errors', () => {
    expect({
      ingestionIdentifier: 'site-ingestion-1',
      events: [{ eventId: 'event-1', kind: 'unknown' }],
    }).toEqual(expect.schemaMatching(SCollectEventsInput))
    expect({
      ingestionIdentifier: 'site-ingestion-1',
      events: [null],
    }).toEqual(expect.schemaMatching(SCollectEventsInput))
  })

  it('rejects a batch whose items use another Ingestion Identifier', () => {
    expect({
      ingestionIdentifier: 'site-ingestion-1',
      events: [
        { ...common, ingestionIdentifier: 'site-ingestion-2', kind: 'page_view', pagePath: '/' },
      ],
    }).not.toEqual(expect.schemaMatching(SCollectEventsInput))
  })

  it('rejects server-controlled receipt time as an Event property', () => {
    expect({
      ...common,
      kind: 'custom_event',
      name: 'completed',
      properties: { receiptTime: '2026-08-23T00:00:00Z' },
    }).not.toEqual(expect.schemaMatching(SEvent))
  })

  it('rejects impossible calendar dates and timestamps', () => {
    expect('2026-02-29').not.toEqual(expect.schemaMatching(SDate))
    expect('2026-02-29T00:00:00Z').not.toEqual(expect.schemaMatching(SDateTime))
  })

  it('publishes raw request byte limits for the transport adapter', () => {
    expect(COLLECT_EVENT_MAX_RAW_REQUEST_BYTES).toBe(64 * 1024)
    expect(COLLECT_EVENTS_MAX_RAW_REQUEST_BYTES).toBe(256 * 1024)
  })

  it('publishes synchronous acceptance coalescing limits', () => {
    expect(EVENT_ACCEPTANCE_WINDOW_MS).toBe(1_000)
    expect(EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS).toBe(500)
    expect(EVENT_ACCEPTANCE_PENDING_MAX_EVENTS).toBe(1_500)
  })

  it('keeps acceptance-boundary failures out of per-item results', () => {
    expect({
      status: 'itemError',
      eventId: 'event-1',
      code: 'SERVICE_UNAVAILABLE',
    }).not.toEqual(expect.schemaMatching(SBatchEventResult))
  })

  it('requires a non-empty batch response and permits the 100-item boundary', () => {
    expect({ results: [] }).not.toEqual(expect.schemaMatching(SBatchEventResponse))
    expect({
      results: Array.from({ length: 100 }, (_, index) => ({
        status: 'accepted',
        eventId: `event-${index}`,
        receiptTime: '2026-08-23T00:00:00Z',
      })),
    }).toEqual(expect.schemaMatching(SBatchEventResponse))
  })
})
