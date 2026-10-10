import { EVENT_KINDS, type EventKind } from '@cimi/utils'
import type { ScalarValue } from '../collection-policy/evaluator.ts'
import type { DemoSeedEvent } from './ports.ts'

const MS_PER_DAY = 86_400_000

const MIN_EVENTS_PER_KIND_PER_DAY = 20

const MAX_EVENTS_PER_KIND_PER_DAY = 100

/** One page view in five opens a session that never navigates again, which is the shape the bounce rate reads. */
const SINGLE_PAGE_VIEW_DENOMINATOR = 5

const SECOND_PAGE_VIEW_CHANCE = 0.2

const MIN_SESSION_MS = 30_000

const MAX_SESSION_MS = 900_000

const VISITORS_PER_DAY = 25

const MIN_VISITOR_POOL = 50

const PAGE_PATHS = [
  '/',
  '/pricing',
  '/features',
  '/docs',
  '/docs/quickstart',
  '/blog',
  '/blog/analytics-guide',
  '/changelog',
  '/integrations',
  '/customers',
  '/signup',
  '/login',
]

const REFERRERS: readonly (string | null)[] = [
  null,
  'https://www.google.com/',
  'https://www.google.com/',
  'https://news.ycombinator.com/',
  'https://www.reddit.com/',
  'https://t.co/',
  'https://www.linkedin.com/',
  'https://github.com/acme',
]

const OUTBOUND_DESTINATIONS = [
  'https://github.com/acme/analytics',
  'https://status.acme.io',
  'https://cal.com/acme/demo',
  'https://x.com/acmehq',
  'https://acme.io/download',
]

const OUTBOUND_NAMES: readonly (string | null)[] = [
  'repository_link',
  'status_page_link',
  'book_demo_link',
  'social_link',
  null,
]

const CUSTOM_EVENT_NAMES = [
  'signup',
  'pricing_cta_click',
  'docs_search',
  'checkout_start',
  'plan_upgrade',
  'invite_sent',
  'feedback_submitted',
]

const CUSTOM_EVENT_PROPERTIES: readonly Readonly<Record<string, ScalarValue>>[] = [
  {},
  {},
  { plan: 'pro' },
  { plan: 'team' },
  { price: 49 },
  { source: 'docs-sidebar' },
]

const PERFORMANCE_METRICS: readonly { readonly name: string; readonly unit: string | null }[] = [
  { name: 'largest_contentful_paint', unit: 'ms' },
  { name: 'first_input_delay', unit: 'ms' },
  { name: 'time_to_first_byte', unit: 'ms' },
  { name: 'cumulative_layout_shift', unit: null },
  { name: 'connection_queue_time', unit: 'ms' },
]

const ERROR_NAMES = [
  'TypeError',
  'ReferenceError',
  'NetworkError',
  'ChunkLoadError',
  'AbortError',
  'SyntaxError',
]

const ERROR_CODES: readonly (string | null)[] = ['E_UNHANDLED', 'E_TIMEOUT', 'E_NETWORK', null]

const ERROR_MESSAGES: readonly (string | null)[] = [
  'Cannot read properties of undefined',
  'Failed to fetch',
  'Loading chunk failed',
  null,
]

export interface EventFabricInput {
  readonly siteId: string
  /** Earliest instant an event may occupy, derived from the retention horizon. */
  readonly from: Date
  /** Instant the site was created, and the latest instant an event may occupy. */
  readonly to: Date
}

interface DayWindow {
  readonly start: number
  readonly end: number
}

interface PlannedSession {
  pageViews: number
  readonly extras: EventKind[]
}

export function generateEventFabric(input: EventFabricInput): readonly DemoSeedEvent[] {
  const from = input.from.getTime()
  const to = input.to.getTime()

  if (!(to > from)) return []

  const random = createRandom(input.siteId)
  const days = enumerateDays(from, to)
  const visitorPool = Math.max(MIN_VISITOR_POOL, days.length * VISITORS_PER_DAY)
  const events: DemoSeedEvent[] = []
  let sessionCount = 0

  for (const day of days) {
    for (const session of planSessions(dayCounts(random), random)) {
      const visitorId = `${input.siteId}-v${pickVisitor(random, visitorPool)}`
      const analyticsSessionId = `${input.siteId}-s${sessionCount}`
      sessionCount += 1

      const span = day.end - day.start
      const duration = Math.min(randomDuration(random), span)
      const startedAt = day.start + Math.floor(random() * Math.max(1, span - duration))
      const kinds = [...repeat('page_view', session.pageViews), ...session.extras]
      const size = kinds.length

      kinds.forEach((kind, index) => {
        const offset = size === 1 ? 0 : Math.floor((index / (size - 1)) * duration)

        events.push(
          createEvent({
            kind,
            siteId: input.siteId,
            sequence: events.length,
            occurredAt: startedAt + offset,
            visitorId,
            analyticsSessionId,
            random,
          }),
        )
      })
    }
  }

  return events
}

function enumerateDays(from: number, to: number): readonly DayWindow[] {
  const days: DayWindow[] = []
  let start = Math.floor(from / MS_PER_DAY) * MS_PER_DAY

  while (start < to) {
    days.push({ start: Math.max(start, from), end: Math.min(start + MS_PER_DAY, to) })
    start += MS_PER_DAY
  }

  return days
}

function randomDuration(random: () => number): number {
  return MIN_SESSION_MS + Math.floor(random() * (MAX_SESSION_MS - MIN_SESSION_MS))
}

function dayCounts(random: () => number): Readonly<Record<EventKind, number>> {
  return {
    page_view: eventsPerKind(random),
    custom_event: eventsPerKind(random),
    outbound: eventsPerKind(random),
    performance: eventsPerKind(random),
    error: eventsPerKind(random),
  }
}

function eventsPerKind(random: () => number): number {
  return integerInRange(random, MIN_EVENTS_PER_KIND_PER_DAY, MAX_EVENTS_PER_KIND_PER_DAY)
}

/**
 * Page views anchor the sessions, so the page view count pins the session count and the other
 * kinds fill those sessions. Every session except the single-pageview ones therefore holds at
 * least two events, which is what the session duration metric needs.
 */
function planSessions(
  counts: Readonly<Record<EventKind, number>>,
  random: () => number,
): readonly PlannedSession[] {
  const sessions: PlannedSession[] = []

  const extras = EVENT_KINDS.filter((kind) => kind !== 'page_view').reduce(
    (total, kind) => total + counts[kind],
    0,
  )

  for (
    let index = 0;
    index < Math.floor(counts.page_view / SINGLE_PAGE_VIEW_DENOMINATOR);
    index += 1
  ) {
    sessions.push({ pageViews: 1, extras: [] })
  }

  const multi: PlannedSession[] = []
  let pageViewsLeft = counts.page_view - Math.floor(counts.page_view / SINGLE_PAGE_VIEW_DENOMINATOR)

  while (pageViewsLeft > 0) {
    const session: PlannedSession = {
      pageViews: pageViewsLeft > 1 && random() < SECOND_PAGE_VIEW_CHANCE ? 2 : 1,
      extras: [],
    }

    multi.push(session)
    sessions.push(session)
    pageViewsLeft -= session.pageViews
  }

  const kinds = shuffle(expandKinds(extras, random), random)

  kinds.forEach((kind, index) => {
    multi[index % multi.length]?.extras.push(kind)
  })

  return sessions
}

function expandKinds(total: number, random: () => number): EventKind[] {
  const kinds: EventKind[] = []

  for (let index = 0; index < total; index += 1) {
    kinds.push(EVENT_KINDS[integerInRange(random, 1, EVENT_KINDS.length - 1)]!)
  }

  return kinds
}

function createEvent(input: {
  readonly kind: EventKind
  readonly siteId: string
  readonly sequence: number
  readonly occurredAt: number
  readonly visitorId: string
  readonly analyticsSessionId: string
  readonly random: () => number
}): DemoSeedEvent {
  const common = {
    eventId: `${input.siteId}-e${input.sequence}`,
    kind: input.kind,
    occurrenceTime: new Date(input.occurredAt).toISOString(),
    visitorId: input.visitorId,
    analyticsSessionId: input.analyticsSessionId,
  }

  switch (input.kind) {
    case 'page_view':
      return {
        ...common,
        kind: 'page_view',
        pageViewId: `${input.siteId}-pv${input.sequence}`,
        pagePath: pick(input.random, PAGE_PATHS),
        referrer: pick(input.random, REFERRERS),
        properties: {},
      }
    case 'custom_event':
      return {
        ...common,
        kind: 'custom_event',
        name: pick(input.random, CUSTOM_EVENT_NAMES),
        properties: pick(input.random, CUSTOM_EVENT_PROPERTIES),
      }
    case 'outbound':
      return {
        ...common,
        kind: 'outbound',
        destination: pick(input.random, OUTBOUND_DESTINATIONS),
        name: pick(input.random, OUTBOUND_NAMES),
        properties: {},
      }
    case 'performance': {
      const metric = pick(input.random, PERFORMANCE_METRICS)

      return {
        ...common,
        kind: 'performance',
        name: metric.name,
        value: integerInRange(input.random, 40, 2_400),
        unit: metric.unit,
        properties: {},
      }
    }

    case 'error':
      return {
        ...common,
        kind: 'error',
        name: pick(input.random, ERROR_NAMES),
        code: pick(input.random, ERROR_CODES),
        message: pick(input.random, ERROR_MESSAGES),
        properties: {},
      }
  }
}

function repeat(kind: EventKind, count: number): EventKind[] {
  return Array.from({ length: count }, () => kind)
}

function shuffle(values: readonly EventKind[], random: () => number): EventKind[] {
  const shuffled = [...values]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = integerInRange(random, 0, index)
    const current = shuffled[index]!
    shuffled[index] = shuffled[target]!
    shuffled[target] = current
  }

  return shuffled
}

function pickVisitor(random: () => number, poolSize: number): number {
  return Math.min(poolSize - 1, Math.floor(random() ** 2 * poolSize))
}

function integerInRange(random: () => number, min: number, maxInclusive: number): number {
  return min + Math.floor(random() * (maxInclusive - min + 1))
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[integerInRange(random, 0, values.length - 1)]!
}

function createRandom(seed: string): () => number {
  let state = hashSeed(seed)

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}
