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

function timeseriesPath(siteId: string, kind: string, extra = ''): string {
  return `/event-report/getEventTimeseries?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&eventKind=${kind}&granularity=day${extra}`
}

describe('EventReportService.getTimeseries', () => {
  it('serves a zero-filled event timeseries with complete flags', async () => {
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

  it('applies an event property filter to bucket counts', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithKinds(
      'event-timeseries-filter@example.com',
    )
    await using _ = fixture
    const response = await apiTestRequest(
      fixture.app,
      timeseriesPath(
        siteId,
        'page_view',
        '&filters[0][scope]=event&filters[0][field]=property.plan&filters[0][operator]=equals&filters[0][values][0]=pro',
      ),
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body.buckets).toEqual([
      { at: '2026-09-05T00:00:00.000Z', count: 1, complete: true },
      { at: '2026-09-06T00:00:00.000Z', count: 0, complete: false },
    ])
  })

  it('rejects an hourly range after the authenticated bucket limit', async () => {
    await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    const { cookie, siteId } = await createOwnerSite(
      fixture.app,
      fixture.db,
      'event-timeseries-bucket-limit@example.com',
    )
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const path = (toDate: string) =>
      `/event-report/getEventTimeseries?siteId=${encodeURIComponent(siteId)}&fromDate=2026-08-01&toDate=${toDate}&eventKind=page_view&granularity=hour`
    const accepted = await apiTestRequest(fixture.app, path('2026-08-30'), cookie)
    expect(accepted.status, await accepted.clone().text()).toBe(200)

    const rejected = await apiTestRequest(fixture.app, path('2026-08-31'), cookie)
    expect(rejected.status).toBe(422)
    await expect(rejected.json()).resolves.toMatchObject({
      code: 'QUERY_LIMIT_EXCEEDED',
      status: 422,
    })
  }, 10_000)
})
