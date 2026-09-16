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

function overviewPath(siteId: string, extra = ''): string {
  return `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=2026-09-05&toDate=2026-09-06&granularity=day${extra}`
}

async function projectedSiteWithEvents(email: string) {
  const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { cookie, siteId } = await createOwnerSite(fixture.app, fixture.db, email)
  seedAcceptedEvents(fixture.db, siteId, [
    { sessionId: 's1', visitorId: 'v1', kind: 'page_view', at: at(DAY_ONE, 10), pagePath: '/' },
    { sessionId: 's1', visitorId: 'v1', kind: 'page_view', at: at(DAY_ONE, 10, 5_000) },
    {
      sessionId: 's4',
      visitorId: 'v4',
      kind: 'page_view',
      at: at(DAY_ONE, 10, 1_000),
      pagePath: '/a',
    },
    { sessionId: 's4', visitorId: 'v4', kind: 'page_view', at: at(DAY_ONE, 10, 12_000) },
    { sessionId: 's5', visitorId: 'v5', kind: 'page_view', at: at(DAY_ONE, 11), pagePath: '/' },
    { sessionId: 's5', visitorId: 'v5', kind: 'outbound', at: at(DAY_ONE, 11, 1_000) },
    { sessionId: 's6', visitorId: 'v6', kind: 'page_view', at: at(DAY_ONE, 12), pagePath: '/' },
    { sessionId: 's6', visitorId: 'v6', kind: 'performance', at: at(DAY_ONE, 12, 11_000) },
    {
      sessionId: 's2',
      visitorId: 'v2',
      kind: 'page_view',
      at: at(DAY_TWO, 10, 1_000),
      pagePath: '/',
    },
    { sessionId: 's3', visitorId: 'v3', kind: 'page_view', at: at(DAY_TWO, 11), pagePath: '/' },
    {
      sessionId: 's3',
      visitorId: 'v3',
      kind: 'custom_event',
      at: at(DAY_TWO, 11, 1_000),
      name: 'checkout',
    },
  ])
  await fixture.analytics.rebuild({ controlDb: fixture.db })
  return { fixture, cookie, siteId }
}

describe('TrafficReportService.getOverview', () => {
  it('serves an admitted overview with stale freshness on a projected Site with no events', async () => {
    await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    const { app } = fixture
    const { cookie, siteId } = await createOwnerSite(app, fixture.db, 'report-ok@example.com')
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const response = await apiTestRequest(app, overviewPath(siteId), cookie)

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      fromDate: '2026-09-05',
      toDate: '2026-09-06',
      visitors: 0,
      sessions: 0,
      pageviews: 0,
      status: 'stale',
    })
    expect(body).not.toHaveProperty('unavailable')
    expect(body.trend).toHaveLength(2)
    expect(body.trend[0]).toMatchObject({ value: 0, complete: false })
  })

  it('returns BAD_REQUEST for an invalid range instead of clamping it', async () => {
    await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    const { app } = fixture
    const { cookie, siteId } = await createOwnerSite(app, fixture.db, 'report-invalid@example.com')

    const response = await apiTestRequest(
      app,
      `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=2026-09-06&toDate=2026-09-05&granularity=day`,
      cookie,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
  })

  it('rejects a range that reaches past Effective Retention instead of clamping it', async () => {
    await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    const { app } = fixture
    const { cookie, siteId } = await createOwnerSite(
      app,
      fixture.db,
      'report-overbound@example.com',
    )
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const response = await apiTestRequest(
      app,
      `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=2020-01-01&toDate=2026-09-06&granularity=year`,
      cookie,
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'QUERY_LIMIT_EXCEEDED',
      status: 422,
    })
  })

  it('serves real overview metrics with denominators and a partially complete trend', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithEvents('report-metrics@example.com')
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&granularity=day`,
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      visitors: 6,
      sessions: 6,
      pageviews: 8,
      eligibleSessions: 6,
      sessionsWithValidDuration: 5,
    })
    expect(body.bounceRate).toBeCloseTo(1 / 6)
    expect(body.pagesPerSession).toBeCloseTo(8 / 6)
    expect(body.averageSessionDurationSeconds).toBeCloseTo(29_000 / 1000 / 5)
    expect(body.trend).toEqual([
      expect.objectContaining({
        value: 4,
        complete: true,
        metric: 'visitors',
        grain: 'visitor',
        unit: 'count',
        denominator: null,
      }),
      expect.objectContaining({
        value: 2,
        complete: false,
        metric: 'visitors',
        grain: 'visitor',
        unit: 'count',
        denominator: null,
      }),
    ])
  })

  it('applies an event filter to the aggregate and every trend bucket', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithEvents(
      'report-trend-filter@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      overviewPath(
        siteId,
        '&filters[0][scope]=event&filters[0][field]=pagePath&filters[0][operator]=equals&filters[0][values][0]=/a',
      ),
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ visitors: 1, sessions: 1, pageviews: 1 })
    expect(body.trend).toEqual([
      expect.objectContaining({ value: 1, metric: 'visitors' }),
      expect.objectContaining({ value: 0, metric: 'visitors' }),
    ])
  })

  it('applies a visitor presence filter to the aggregate and trend', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithEvents(
      'report-presence-filter@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      overviewPath(
        siteId,
        '&filters[0][scope]=visitor&filters[0][operator]=has_done&filters[0][action][kind]=custom_event&filters[0][action][name]=checkout',
      ),
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ visitors: 1, sessions: 1, pageviews: 1 })
    expect(body.trend).toEqual([
      expect.objectContaining({ value: 0, metric: 'visitors' }),
      expect.objectContaining({ value: 1, metric: 'visitors' }),
    ])
  })

  it('applies a negated visitor presence filter to the aggregate and trend', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithEvents(
      'report-negated-presence-filter@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      overviewPath(
        siteId,
        '&filters[0][scope]=visitor&filters[0][operator]=has_not_done&filters[0][action][kind]=custom_event&filters[0][action][name]=checkout',
      ),
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ visitors: 5, sessions: 5, pageviews: 7 })
    expect(body.trend).toEqual([
      expect.objectContaining({ value: 4, metric: 'visitors' }),
      expect.objectContaining({ value: 1, metric: 'visitors' }),
    ])
  })

  it('rejects an hourly range after the authenticated bucket limit', async () => {
    await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    const { cookie, siteId } = await createOwnerSite(
      fixture.app,
      fixture.db,
      'traffic-overview-bucket-limit@example.com',
    )
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const path = (toDate: string) =>
      `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=2026-08-01&toDate=${toDate}&granularity=hour`
    const accepted = await apiTestRequest(fixture.app, path('2026-08-30'), cookie)
    expect(accepted.status, await accepted.clone().text()).toBe(200)

    const rejected = await apiTestRequest(fixture.app, path('2026-08-31'), cookie)
    expect(rejected.status).toBe(422)
    await expect(rejected.json()).resolves.toMatchObject({
      code: 'QUERY_LIMIT_EXCEEDED',
      status: 422,
    })
  })
})
