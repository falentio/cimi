import * as v from 'valibot'
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
    expect(
      v.safeParse(SEvent, { ...common, kind: 'page_view', pagePath: '/checkout' }).success,
    ).toBe(true)
    expect(v.safeParse(SEvent, { ...common, kind: 'page_view' }).success).toBe(false)
  })

  it('requires kind-specific custom-event fields', () => {
    expect(
      v.safeParse(SEvent, { ...common, kind: 'custom_event', name: 'completed' }).success,
    ).toBe(true)
    expect(v.safeParse(SEvent, { ...common, kind: 'custom_event' }).success).toBe(false)
  })

  it('accepts a bounded non-atomic batch shape', () => {
    expect(
      v.safeParse(SCollectEventsInput, {
        ingestionIdentifier: 'site-ingestion-1',
        events: [{ ...common, kind: 'page_view', pagePath: '/' }],
      }).success,
    ).toBe(true)
  })

  it('accepts privacy context on singular requests', () => {
    expect(
      v.safeParse(SCollectEventInput, {
        ...common,
        kind: 'page_view',
        pagePath: '/',
        collectionContext: { consent: 'granted', gpc: false, dnt: false },
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SCollectEventInput, {
        ...common,
        kind: 'page_view',
        pagePath: '/',
        collectionContext: { consent: 'yes' },
      }).success,
    ).toBe(false)
  })

  it('scopes privacy context to the batch envelope', () => {
    expect(
      v.safeParse(SCollectEventsInput, {
        ingestionIdentifier: common.ingestionIdentifier,
        collectionContext: { consent: 'denied', gpc: true },
        events: [{ ...common, kind: 'page_view', pagePath: '/' }],
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SCollectEventsInput, {
        ingestionIdentifier: common.ingestionIdentifier,
        events: [{ ...common, kind: 'page_view', pagePath: '/', collectionContext: {} }],
      }).success,
    ).toBe(false)
  })

  it('keeps malformed items eligible for per-item errors', () => {
    expect(
      v.safeParse(SCollectEventsInput, {
        ingestionIdentifier: 'site-ingestion-1',
        events: [{ eventId: 'event-1', kind: 'unknown' }],
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SCollectEventsInput, {
        ingestionIdentifier: 'site-ingestion-1',
        events: [null],
      }).success,
    ).toBe(true)
  })

  it('rejects a batch whose items use another Ingestion Identifier', () => {
    expect(
      v.safeParse(SCollectEventsInput, {
        ingestionIdentifier: 'site-ingestion-1',
        events: [
          { ...common, ingestionIdentifier: 'site-ingestion-2', kind: 'page_view', pagePath: '/' },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects server-controlled receipt time as an Event property', () => {
    expect(
      v.safeParse(SEvent, {
        ...common,
        kind: 'custom_event',
        name: 'completed',
        properties: { receiptTime: '2026-08-23T00:00:00Z' },
      }).success,
    ).toBe(false)
  })

  it('rejects impossible calendar dates and timestamps', () => {
    expect(v.safeParse(SDate, '2026-02-29').success).toBe(false)
    expect(v.safeParse(SDateTime, '2026-02-29T00:00:00Z').success).toBe(false)
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
    expect(
      v.safeParse(SBatchEventResult, {
        status: 'itemError',
        eventId: 'event-1',
        code: 'SERVICE_UNAVAILABLE',
      }).success,
    ).toBe(false)
  })

  it('requires a non-empty batch response and permits the 100-item boundary', () => {
    expect(v.safeParse(SBatchEventResponse, { results: [] }).success).toBe(false)
    expect(
      v.safeParse(SBatchEventResponse, {
        results: Array.from({ length: 100 }, (_, index) => ({
          status: 'accepted',
          eventId: `event-${index}`,
          receiptTime: '2026-08-23T00:00:00Z',
        })),
      }).success,
    ).toBe(true)
  })
})
