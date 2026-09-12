import { expect, test } from 'vitest'
import { apiTestRequest, createApiTestFixture } from '../../../testing/fixture.ts'
import {
  createOwnerSite,
  readyLifecycle,
  seedAcceptedEvents,
} from '../../../testing/reporting-fixture.ts'

const DAY_ONE = '2026-09-05'
const DAY_TWO = '2026-09-06'

function at(date: string, hour: number, offsetMs = 0): number {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`) + offsetMs
}

/**
 * A projected Site with page views, custom events, an outbound click, a performance sample, and two
 * errors across two days. One page view carries a mixed-type property bag.
 */
async function projectedSiteWithKinds(email: string) {
  const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { cookie, siteId } = await createOwnerSite(fixture.app, fixture.db, email)
  seedAcceptedEvents(fixture.db, siteId, [
    {
      sessionId: 's1',
      visitorId: 'v1',
      kind: 'page_view',
      at: at(DAY_ONE, 10),
      pagePath: '/a',
      referrer: 'https://ref.example',
      properties: { plan: 'pro', score: 5, active: true },
    },
    {
      sessionId: 's1',
      visitorId: 'v1',
      kind: 'page_view',
      at: at(DAY_ONE, 10, 1_000),
      pagePath: '/b',
    },
    {
      sessionId: 's2',
      visitorId: 'v2',
      kind: 'custom_event',
      at: at(DAY_ONE, 11),
      pagePath: '/b',
      name: 'checkout',
    },
    {
      sessionId: 's3',
      visitorId: 'v3',
      kind: 'outbound',
      at: at(DAY_TWO, 10),
      pagePath: '/b',
      name: 'click',
      destination: 'https://out.example',
    },
    {
      sessionId: 's4',
      visitorId: 'v4',
      kind: 'performance',
      at: at(DAY_TWO, 11),
      pagePath: '/c',
      name: 'lcp',
      value: 1.5,
      unit: 's',
    },
    {
      sessionId: 's5',
      visitorId: 'v5',
      kind: 'error',
      at: at(DAY_TWO, 12),
      pagePath: '/c',
      name: 'TypeError',
      code: 'E1',
      message: 'boom',
    },
    {
      sessionId: 's6',
      visitorId: 'v6',
      kind: 'error',
      at: at(DAY_TWO, 13),
      pagePath: '/c',
      name: 'RangeError',
      code: 'E2',
      message: 'second',
    },
  ])
  await fixture.analytics.rebuild({ controlDb: fixture.db })
  return { fixture, cookie, siteId }
}

function overviewPath(siteId: string, kind: string, extra = ''): string {
  return `/event-report/getEventOverview?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&eventKind=${kind}${extra}`
}

function timeseriesPath(siteId: string, kind: string, extra = ''): string {
  return `/event-report/getEventTimeseries?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&eventKind=${kind}&granularity=day${extra}`
}

function listPath(siteId: string, kind: string, extra = ''): string {
  return `/event-report/listEvents?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&eventKind=${kind}${extra}`
}

function breakdownPath(siteId: string, kind: string, extra = ''): string {
  return `/event-report/getEventBreakdowns?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&eventKind=${kind}${extra}`
}

test('serves an event overview with counts and stale freshness', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-overview@example.com')
  await using _ = fixture
  const response = await apiTestRequest(fixture.app, overviewPath(siteId, 'page_view'), cookie)

  expect(response.status, await response.clone().text()).toBe(200)
  await expect(response.json()).resolves.toMatchObject({
    fromDate: DAY_ONE,
    toDate: DAY_TWO,
    eventKind: 'page_view',
    total: 2,
    uniqueVisitors: 1,
    uniqueSessions: 1,
    status: 'stale',
  })
})

test('serves an event overview comparison period with separate freshness', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-overview-cmp@example.com')
  await using _ = fixture
  const response = await apiTestRequest(
    fixture.app,
    overviewPath(siteId, 'error', '&comparison[fromDate]=2026-09-03&comparison[toDate]=2026-09-04'),
    cookie,
  )

  expect(response.status, await response.clone().text()).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({ total: 2, uniqueVisitors: 2, uniqueSessions: 2 })
  expect(body.comparison).toMatchObject({ total: 0, uniqueVisitors: 0, uniqueSessions: 0 })
})

test('serves a zero-filled event timeseries with complete flags', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-timeseries@example.com')
  await using _ = fixture
  const response = await apiTestRequest(fixture.app, timeseriesPath(siteId, 'page_view'), cookie)

  expect(response.status, await response.clone().text()).toBe(200)
  const body = await response.json()
  expect(body.buckets).toEqual([
    { at: '2026-09-05T00:00:00.000Z', count: 2, complete: true },
    { at: '2026-09-06T00:00:00.000Z', count: 0, complete: false },
  ])
  expect(body.status).toBe('stale')
})

test('lists events ordered by occurrence time with a stable eventId tie-break', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-list@example.com')
  await using _ = fixture
  const response = await apiTestRequest(
    fixture.app,
    listPath(siteId, 'page_view', '&direction=asc'),
    cookie,
  )

  expect(response.status, await response.clone().text()).toBe(200)
  const body = await response.json()
  expect(body.totalCount).toBe(2)
  expect(body.hasMore).toBe(false)
  expect(body.nextOffset).toBeNull()
  expect(body.items).toHaveLength(2)
  expect(body.items[0]).toMatchObject({
    kind: 'page_view',
    pagePath: '/a',
    referrer: 'https://ref.example',
    properties: { plan: 'pro', score: 5, active: true },
  })
  expect(body.items[0].occurredAt).toBe('2026-09-05T10:00:00.000Z')
  expect(body.items[0].createdAt).toBe('2026-09-05T10:00:00.000Z')
  expect(body.items[1]).toMatchObject({ kind: 'page_view', pagePath: '/b', properties: null })
})

test('lists kind-specific event fields and pages deterministically', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-list-kinds@example.com')
  await using _ = fixture

  const errors = await apiTestRequest(
    fixture.app,
    listPath(siteId, 'error', '&direction=asc'),
    cookie,
  )
  expect(errors.status, await errors.clone().text()).toBe(200)
  const errorBody = await errors.json()
  expect(errorBody.items.map((item: { code: string }) => item.code)).toEqual(['E1', 'E2'])
  expect(errorBody.items[0]).toMatchObject({
    kind: 'error',
    name: 'TypeError',
    code: 'E1',
    message: 'boom',
    pagePath: '/c',
  })

  const outbound = await apiTestRequest(fixture.app, listPath(siteId, 'outbound'), cookie)
  expect(outbound.status, await outbound.clone().text()).toBe(200)
  const outboundBody = await outbound.json()
  expect(outboundBody.items[0]).toMatchObject({
    kind: 'outbound',
    name: 'click',
    destination: 'https://out.example',
    pagePath: '/b',
  })

  const performance = await apiTestRequest(fixture.app, listPath(siteId, 'performance'), cookie)
  expect(performance.status, await performance.clone().text()).toBe(200)
  const performanceBody = await performance.json()
  expect(performanceBody.items[0]).toMatchObject({
    kind: 'performance',
    name: 'lcp',
    value: 1.5,
    unit: 's',
    pagePath: '/c',
  })
})

test('paginates an event list page with nextOffset and hasMore', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-list-page@example.com')
  await using _ = fixture

  const first = await apiTestRequest(
    fixture.app,
    listPath(siteId, 'error', '&direction=asc&limit=1'),
    cookie,
  )
  expect(first.status, await first.clone().text()).toBe(200)
  const firstBody = await first.json()
  expect(firstBody.items.map((item: { code: string }) => item.code)).toEqual(['E1'])
  expect(firstBody.totalCount).toBe(2)
  expect(firstBody.hasMore).toBe(true)
  expect(firstBody.nextOffset).toBe(1)

  const second = await apiTestRequest(
    fixture.app,
    listPath(siteId, 'error', '&direction=asc&limit=1&offset=1'),
    cookie,
  )
  expect(second.status, await second.clone().text()).toBe(200)
  const secondBody = await second.json()
  expect(secondBody.items.map((item: { code: string }) => item.code)).toEqual(['E2'])
  expect(secondBody.hasMore).toBe(false)
  expect(secondBody.nextOffset).toBeNull()
})

test('serves an event breakdown for the kind dimension with paging', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-breakdown@example.com')
  await using _ = fixture

  const response = await apiTestRequest(
    fixture.app,
    breakdownPath(siteId, 'page_view', '&sort=value&direction=asc'),
    cookie,
  )
  expect(response.status, await response.clone().text()).toBe(200)
  const body = await response.json()
  expect(body.items).toEqual([
    { field: 'pagePath', value: '/a', count: 1 },
    { field: 'pagePath', value: '/b', count: 1 },
  ])
  expect(body.totalCount).toBe(2)
  expect(body.hasMore).toBe(false)
  expect(body.nextOffset).toBeNull()
})

test('paginates an event breakdown page with a value tie-break', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds(
    'event-breakdown-page@example.com',
  )
  await using _ = fixture

  const first = await apiTestRequest(
    fixture.app,
    breakdownPath(siteId, 'error', '&sort=count&direction=desc&limit=1'),
    cookie,
  )
  expect(first.status, await first.clone().text()).toBe(200)
  const firstBody = await first.json()
  expect(firstBody.items).toEqual([{ field: 'code', value: 'E1', count: 1 }])
  expect(firstBody.totalCount).toBe(2)
  expect(firstBody.hasMore).toBe(true)
  expect(firstBody.nextOffset).toBe(1)

  const second = await apiTestRequest(
    fixture.app,
    breakdownPath(siteId, 'error', '&sort=count&direction=desc&limit=1&offset=1'),
    cookie,
  )
  expect(second.status, await second.clone().text()).toBe(200)
  const secondBody = await second.json()
  expect(secondBody.items).toEqual([{ field: 'code', value: 'E2', count: 1 }])
  expect(secondBody.hasMore).toBe(false)
})

test('serves an event breakdown comparison period', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds(
    'event-breakdown-cmp@example.com',
  )
  await using _ = fixture
  const response = await apiTestRequest(
    fixture.app,
    breakdownPath(
      siteId,
      'page_view',
      '&comparison[fromDate]=2026-09-03&comparison[toDate]=2026-09-04',
    ),
    cookie,
  )

  expect(response.status, await response.clone().text()).toBe(200)
  const body = await response.json()
  expect(body.items).toHaveLength(2)
  expect(body.comparison).toMatchObject({ items: [], totalCount: 0, hasMore: false })
})

test('rejects an unsupported event filter as BAD_REQUEST', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-badfilter@example.com')
  await using _ = fixture
  const response = await apiTestRequest(
    fixture.app,
    `${overviewPath(siteId, 'page_view')}&filters[0][scope]=event&filters[0][field]=nope&filters[0][operator]=equals&filters[0][values][0]=x`,
    cookie,
  )

  expect(response.status).toBe(400)
  await expect(response.json()).resolves.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
})

test('applies a typed event property filter to an event overview', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-filter@example.com')
  await using _ = fixture
  const response = await apiTestRequest(
    fixture.app,
    `${overviewPath(siteId, 'page_view')}&filters[0][scope]=event&filters[0][field]=property.plan&filters[0][operator]=equals&filters[0][values][0]=pro`,
    cookie,
  )

  expect(response.status, await response.clone().text()).toBe(200)
  await expect(response.json()).resolves.toMatchObject({ total: 1, uniqueVisitors: 1 })

  const miss = await apiTestRequest(
    fixture.app,
    `${overviewPath(siteId, 'page_view')}&filters[0][scope]=event&filters[0][field]=property.plan&filters[0][operator]=equals&filters[0][values][0]=free`,
    cookie,
  )
  expect(miss.status, await miss.clone().text()).toBe(200)
  await expect(miss.json()).resolves.toMatchObject({ total: 0, uniqueVisitors: 0 })
})
