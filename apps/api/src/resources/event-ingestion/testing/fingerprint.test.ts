import { describe, expect, it } from 'vitest'
import { canonicalEventJson, fingerprintEvent } from '../fingerprint.ts'
import type { EventInput } from '../repository.ts'

function event(overrides: Partial<EventInput> = {}): EventInput {
  return {
    eventId: 'event-1',
    ingestionIdentifier: 'ing-1',
    kind: 'custom_event',
    name: 'checkout',
    properties: {},
    ...overrides,
  } as EventInput
}

describe('event payload fingerprint', () => {
  it('orders object keys by code unit, not locale collation', () => {
    expect(canonicalEventJson({ a: 1, B: 2 })).toBe('{"B":2,"a":1}')
  })

  it('is independent of key insertion order and nested records', () => {
    const left = canonicalEventJson({ outer: { b: 1, a: 2 }, list: [{ y: 1, x: 2 }] })
    const right = canonicalEventJson({ list: [{ x: 2, y: 1 }], outer: { a: 2, b: 1 } })
    expect(left).toBe(right)
  })

  it('excludes the Ingestion Identifier from the fingerprint', () => {
    expect(fingerprintEvent(event({ ingestionIdentifier: 'ing-1' }))).toBe(
      fingerprintEvent(event({ ingestionIdentifier: 'ing-2' })),
    )
  })

  it('changes when the Event payload changes', () => {
    expect(fingerprintEvent(event())).not.toBe(fingerprintEvent(event({ name: 'other' })))
  })
})
