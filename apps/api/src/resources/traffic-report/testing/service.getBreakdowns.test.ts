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

function breakdownPath(siteId: string, dimension: string, extra = ''): string {
  return `/traffic-report/getTrafficBreakdowns?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&granularity=day&dimension=${dimension}${extra}`
}

async function projectedSiteWithAttributedEvents(email: string) {
  const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { cookie, siteId } = await createOwnerSite(fixture.app, fixture.db, email)
  seedAcceptedEvents(fixture.db, siteId, [
    {
      sessionId: 's1',
      visitorId: 'v1',
      kind: 'page_view',
      at: at(DAY_ONE, 10),
      pagePath: '/a',
      device: 'desktop',
      browser: 'chrome',
      os: 'macos',
      country: 'US',
      referrer: 'https://search.example',
      utmSource: 'newsletter',
      utmMedium: 'email',
    },
    {
      sessionId: 's2',
      visitorId: 'v2',
      kind: 'page_view',
      at: at(DAY_ONE, 10, 1_000),
      pagePath: '/a',
      device: 'desktop',
      browser: 'firefox',
      os: 'linux',
      country: 'US',
    },
    {
      sessionId: 's3',
      visitorId: 'v3',
      kind: 'page_view',
      at: at(DAY_ONE, 11),
      pagePath: '/a',
      device: 'mobile',
      browser: 'safari',
      os: 'ios',
      country: 'CA',
    },
    {
      sessionId: 's3',
      visitorId: 'v3',
      kind: 'page_view',
      at: at(DAY_ONE, 11, 1_000),
      pagePath: '/b',
    },
    {
      sessionId: 's4',
      visitorId: 'v4',
      kind: 'page_view',
      at: at(DAY_TWO, 10),
      pagePath: '/b',
      device: 'desktop',
      browser: 'chrome',
      os: 'windows',
      country: 'US',
    },
    {
      sessionId: 's5',
      visitorId: 'v5',
      kind: 'page_view',
      at: at(DAY_TWO, 11),
      pagePath: '/b',
      device: 'desktop',
      browser: 'chrome',
      os: 'windows',
      country: 'US',
    },
    { sessionId: 's6', visitorId: 'v6', kind: 'page_view', at: at(DAY_TWO, 12), pagePath: '/a' },
  ])
  await fixture.analytics.rebuild({ controlDb: fixture.db })
  return { fixture, cookie, siteId }
}

describe('TrafficReportService.getBreakdowns', () => {
  it('serves an admitted breakdown page with pagination metadata', async () => {
    await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    const { app } = fixture
    const { cookie, siteId } = await createOwnerSite(
      app,
      fixture.db,
      'report-breakdown@example.com',
    )
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const response = await apiTestRequest(
      app,
      `/traffic-report/getTrafficBreakdowns?siteId=${encodeURIComponent(siteId)}&fromDate=2026-09-05&toDate=2026-09-06&granularity=day&dimension=page`,
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 0,
      status: 'stale',
    })
  })

  it('serves real page breakdown rows with counts, percentage, and the session denominator', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithAttributedEvents(
      'report-breakdown-page@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(fixture.app, breakdownPath(siteId, 'page'), cookie)

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body.items).toEqual([
      {
        value: '/a',
        metric: 'sessions',
        grain: 'session',
        count: 4,
        denominator: 6,
        percentage: 4 / 6,
      },
      {
        value: '/b',
        metric: 'sessions',
        grain: 'session',
        count: 3,
        denominator: 6,
        percentage: 3 / 6,
      },
    ])
    expect(body.totalCount).toBe(2)
    expect(body.hasMore).toBe(false)
    expect(body.nextOffset).toBeNull()
    expect(body.status).toBe('stale')
  })

  it('uses the filtered session population for breakdown counts and percentages', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithAttributedEvents(
      'report-breakdown-filter@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      breakdownPath(
        siteId,
        'page',
        '&filters[0][scope]=event&filters[0][field]=pagePath&filters[0][operator]=equals&filters[0][values][0]=/a',
      ),
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          value: '/a',
          metric: 'sessions',
          grain: 'session',
          count: 4,
          denominator: 4,
          percentage: 1,
        },
      ],
      totalCount: 1,
      hasMore: false,
      nextOffset: null,
    })
  })

  it('serves device breakdown rows excluding the NULL device while keeping the denominator', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithAttributedEvents(
      'report-breakdown-device@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      breakdownPath(siteId, 'device', '&sort=count&direction=desc'),
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body.items).toEqual([
      {
        value: 'desktop',
        metric: 'sessions',
        grain: 'session',
        count: 4,
        denominator: 6,
        percentage: 4 / 6,
      },
      {
        value: 'mobile',
        metric: 'sessions',
        grain: 'session',
        count: 1,
        denominator: 6,
        percentage: 1 / 6,
      },
    ])
    expect(body.totalCount).toBe(2)
  })

  it('sorts percentage breakdowns by count because the denominator is shared', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithAttributedEvents(
      'report-breakdown-percentage@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      breakdownPath(siteId, 'page', '&sort=percentage&direction=asc'),
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body.items.map((item: { value: string }) => item.value)).toEqual(['/b', '/a'])
  })

  it('paginates breakdown rows deterministically with a value tie-break', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithAttributedEvents(
      'report-breakdown-page2@example.com',
    )
    await using _ = fixture
    const first = await apiTestRequest(
      fixture.app,
      breakdownPath(siteId, 'page', '&sort=count&direction=desc&limit=1'),
      cookie,
    )

    expect(first.status, await first.clone().text()).toBe(200)
    const firstBody = await first.json()
    expect(firstBody.items).toEqual([
      {
        value: '/a',
        metric: 'sessions',
        grain: 'session',
        count: 4,
        denominator: 6,
        percentage: 4 / 6,
      },
    ])
    expect(firstBody.totalCount).toBe(2)
    expect(firstBody.hasMore).toBe(true)
    expect(firstBody.nextOffset).toBe(1)

    const second = await apiTestRequest(
      fixture.app,
      breakdownPath(siteId, 'page', '&sort=count&direction=desc&limit=1&offset=1'),
      cookie,
    )
    expect(second.status, await second.clone().text()).toBe(200)
    const secondBody = await second.json()
    expect(secondBody.items).toEqual([
      {
        value: '/b',
        metric: 'sessions',
        grain: 'session',
        count: 3,
        denominator: 6,
        percentage: 3 / 6,
      },
    ])
    expect(secondBody.hasMore).toBe(false)
    expect(secondBody.nextOffset).toBeNull()
  })

  it('rejects an hourly range after the authenticated bucket limit', async () => {
    await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    const { cookie, siteId } = await createOwnerSite(
      fixture.app,
      fixture.db,
      'traffic-breakdown-bucket-limit@example.com',
    )
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const path = (toDate: string) =>
      `/traffic-report/getTrafficBreakdowns?siteId=${encodeURIComponent(siteId)}&fromDate=2026-08-01&toDate=${toDate}&granularity=hour&dimension=page`
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
