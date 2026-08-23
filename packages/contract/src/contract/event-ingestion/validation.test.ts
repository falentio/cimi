import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SCollectEventInput } from './command/collect-event.ts'
import { SCollectEventsInput } from './command/collect-events.ts'
import { SEvent } from './schema.ts'
import { SDate, SDateTime, isWithinSerializedByteLimit } from '../../schema/index.ts'

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

  it('enforces the singular serialized payload limit', () => {
    const event = {
      ...common,
      kind: 'custom_event',
      name: 'completed',
      properties: Object.fromEntries(
        Array.from({ length: 64 }, (_, index) => [`property-${index}`, 'x'.repeat(512)]),
      ),
    }
    expect(v.safeParse(SCollectEventInput, event).success).toBe(true)
    expect(isWithinSerializedByteLimit({ payload: '\u{1F600}'.repeat(20_000) }, 64 * 1024)).toBe(
      false,
    )
  })
})
