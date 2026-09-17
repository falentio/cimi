import { describe, expect, it } from 'vitest'
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

describe('EventReportService.getOverview', () => {
  it('serves an event overview with counts and stale freshness', async () => {
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

  it('serves an event overview comparison period with separate freshness', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithKinds(
      'event-overview-cmp@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      overviewPath(
        siteId,
        'error',
        '&comparison[fromDate]=2026-09-03&comparison[toDate]=2026-09-04',
      ),
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ total: 2, uniqueVisitors: 2, uniqueSessions: 2 })
    expect(body.comparison).toMatchObject({ total: 0, uniqueVisitors: 0, uniqueSessions: 0 })
  })

  it('rejects an unsupported event filter as BAD_REQUEST', async () => {
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

  it('applies a typed event property filter to an event overview', async () => {
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

  it('applies a nested presence property filter to the matching Session', async () => {
    const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    await using _ = fixture
    const { cookie, siteId } = await createOwnerSite(
      fixture.app,
      fixture.db,
      'event-presence-filter@example.com',
    )
    seedAcceptedEvents(fixture.db, siteId, [
      {
        sessionId: 's1',
        visitorId: 'v1',
        kind: 'page_view',
        at: at(DAY_ONE, 10),
        pagePath: '/a',
      },
      {
        sessionId: 's1',
        visitorId: 'v1',
        kind: 'custom_event',
        at: at(DAY_ONE, 10, 1_000),
        name: 'purchase',
        properties: { label: 'premium' },
      },
      {
        sessionId: 's2',
        visitorId: 'v1',
        kind: 'page_view',
        at: at(DAY_ONE, 10, 2_000),
        pagePath: '/b',
      },
    ])
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const presenceFilter = (operator: 'has_done' | 'has_not_done') =>
      `&filters[0][scope]=session&filters[0][operator]=${operator}&filters[0][range]=same_range&filters[0][action][kind]=custom_event&filters[0][action][name]=purchase&filters[0][action][propertyFilters][0][field]=label&filters[0][action][propertyFilters][0][operator]=equals&filters[0][action][propertyFilters][0][values][0]=premium`
    const matching = await apiTestRequest(
      fixture.app,
      `${overviewPath(siteId, 'page_view')}${presenceFilter('has_done')}`,
      cookie,
    )
    expect(matching.status, await matching.clone().text()).toBe(200)
    await expect(matching.json()).resolves.toMatchObject({
      total: 1,
      uniqueVisitors: 1,
      uniqueSessions: 1,
    })

    const nonMatching = await apiTestRequest(
      fixture.app,
      `${overviewPath(siteId, 'page_view')}${presenceFilter('has_not_done')}`,
      cookie,
    )
    expect(nonMatching.status, await nonMatching.clone().text()).toBe(200)
    await expect(nonMatching.json()).resolves.toMatchObject({
      total: 1,
      uniqueVisitors: 1,
      uniqueSessions: 1,
    })
  })

  it('rejects a range that reaches past Effective Retention instead of clamping it', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-overbound@example.com')
    await using _ = fixture

    const response = await apiTestRequest(
      fixture.app,
      `/event-report/getEventOverview?siteId=${encodeURIComponent(siteId)}&fromDate=2020-01-01&toDate=2026-09-06&eventKind=page_view`,
      cookie,
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'QUERY_LIMIT_EXCEEDED',
      status: 422,
    })
  })
})
