import { describe, expect, it } from 'vitest'
import { EVENT_KINDS, type EventKind } from '@cimi/utils'
import type { DemoSeedEvent } from '../ports.ts'
import { generateEventFabric } from '../fabric.ts'

const siteId = 'ste_demo'

const from = new Date('2026-01-01T00:00:00.000Z')

const to = new Date('2026-02-01T00:00:00.000Z')

function fabric() {
  return generateEventFabric({ siteId, from, to })
}

function countByDayAndKind(events: readonly DemoSeedEvent[]) {
  const counts = new Map<string, number>()

  for (const event of events) {
    const key = `${event.occurrenceTime.slice(0, 10)}|${event.kind}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}

function sessionsOf(events: readonly DemoSeedEvent[]) {
  const sessions = new Map<string, DemoSeedEvent[]>()

  for (const event of events) {
    const session = sessions.get(event.analyticsSessionId)

    if (session === undefined) sessions.set(event.analyticsSessionId, [event])
    else session.push(event)
  }

  return [...sessions.values()]
}

function kindEvents<K extends EventKind>(events: readonly DemoSeedEvent[], kind: K) {
  return events.filter((event): event is Extract<DemoSeedEvent, { kind: K }> => event.kind === kind)
}

describe('generateEventFabric', () => {
  it('is deterministic for a seed and a window', () => {
    expect(fabric()).toEqual(fabric())
    expect(generateEventFabric({ siteId: 'ste_other', from, to })).not.toEqual(fabric())
  })

  it('emits unique event ids and page view ids', () => {
    const events = fabric()
    const pageViewIds = kindEvents(events, 'page_view').map((event) => event.pageViewId)

    expect(new Set(events.map((event) => event.eventId)).size).toBe(events.length)
    expect(new Set(pageViewIds).size).toBe(pageViewIds.length)
    expect(pageViewIds.every((pageViewId) => pageViewId.length > 0)).toBe(true)
  })

  it('fills between twenty and a hundred events of every kind each day', () => {
    const counts = countByDayAndKind(fabric())

    expect(counts.size).toBe(31 * EVENT_KINDS.length)

    for (const [key, count] of counts) {
      expect(count, `${key} holds ${count} events`).toBeGreaterThanOrEqual(20)
      expect(count, `${key} holds ${count} events`).toBeLessThanOrEqual(100)
    }
  })

  it('means about twenty-seven thousand events across ninety days', () => {
    const events = generateEventFabric({
      siteId,
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-04-01T00:00:00.000Z'),
    })

    expect(events.length).toBeGreaterThan(27_000 * 0.85)
    expect(events.length).toBeLessThan(27_000 * 1.15)
  })

  it('spreads ninety days across believable sessions and returning visitors', () => {
    const events = generateEventFabric({
      siteId,
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-04-01T00:00:00.000Z'),
    })

    const sessions = sessionsOf(events)
    const visitors = new Set(events.map((event) => event.visitorId))
    const meanSessionLength = events.length / sessions.length

    expect(meanSessionLength).toBeGreaterThan(3)
    expect(meanSessionLength).toBeLessThan(9)
    expect(visitors.size).toBeLessThan(sessions.length)
    expect(sessions.some((session) => session.length === 1)).toBe(true)
    expect(sessions.some((session) => session.length > 3)).toBe(true)
  })

  it('keeps every occurrence time inside the window', () => {
    for (const event of fabric()) {
      expect(new Date(event.occurrenceTime).getTime()).toBeGreaterThanOrEqual(from.getTime())
      expect(new Date(event.occurrenceTime).getTime()).toBeLessThanOrEqual(to.getTime())
    }
  })

  it('orders each session by occurrence time and starts it on a page view', () => {
    for (const session of sessionsOf(fabric())) {
      const times = session.map((event) => new Date(event.occurrenceTime).getTime())

      expect([...times].sort((left, right) => left - right)).toEqual(times)
      expect(session[0]?.kind).toBe('page_view')
    }
  })

  it('holds at least two events in a session and keeps some single-pageview sessions', () => {
    const sessions = sessionsOf(fabric())
    const single = sessions.filter((session) => session.length === 1)
    const multi = sessions.filter((session) => session.length > 1)

    expect(multi.length).toBeGreaterThan(0)
    expect(single.length).toBeGreaterThan(0)
    expect(single.every((session) => session[0]?.kind === 'page_view')).toBe(true)
  })

  it('correlates visitors so returning visitors exist', () => {
    const visitors = new Map<string, Set<string>>()

    for (const event of fabric()) {
      const sessions = visitors.get(event.visitorId) ?? new Set<string>()
      sessions.add(event.analyticsSessionId)
      visitors.set(event.visitorId, sessions)
    }

    expect(visitors.size).toBeGreaterThan(100)
    expect([...visitors.values()].some((sessions) => sessions.size > 1)).toBe(true)
  })

  it('carries the kind-specific payloads the projection folds', () => {
    const events = fabric()

    for (const kind of EVENT_KINDS) {
      expect(kindEvents(events, kind).length, `${kind} events exist`).toBeGreaterThan(0)
    }

    const pageViews = kindEvents(events, 'page_view')
    expect(pageViews.every((event) => event.pagePath.length > 0)).toBe(true)
    expect(pageViews.some((event) => event.referrer === null)).toBe(true)
    expect(pageViews.some((event) => event.referrer !== null)).toBe(true)

    const outbound = kindEvents(events, 'outbound')
    expect(outbound.every((event) => event.destination.length > 0)).toBe(true)
    expect(outbound.some((event) => event.name === null)).toBe(true)

    const performance = kindEvents(events, 'performance')
    expect(performance.every((event) => event.value > 0 && event.name.length > 0)).toBe(true)
    expect(performance.some((event) => event.unit === null)).toBe(true)
    expect(performance.some((event) => event.unit !== null)).toBe(true)

    const errors = kindEvents(events, 'error')
    expect(errors.every((event) => event.name.length > 0)).toBe(true)
    expect(errors.some((event) => event.code === null)).toBe(true)
    expect(errors.some((event) => event.message === null)).toBe(true)
    expect(errors.some((event) => event.code !== null && event.message !== null)).toBe(true)

    const custom = kindEvents(events, 'custom_event')
    expect(custom.every((event) => event.name.length > 0)).toBe(true)
    expect(custom.some((event) => Object.keys(event.properties).length > 0)).toBe(true)
  })

  it('returns an empty fabric for an empty window', () => {
    expect(generateEventFabric({ siteId, from: to, to: from })).toEqual([])
  })
})
