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

function breakdownPath(siteId: string, kind: string, extra = ''): string {
  return `/event-report/getEventBreakdowns?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&eventKind=${kind}${extra}`
}

describe('EventReportService.getBreakdowns', () => {
  it('serves an event breakdown for the kind dimension with paging', async () => {
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

  it('paginates an event breakdown page with a value tie-break', async () => {
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

  it('serves an event breakdown comparison period', async () => {
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
})
