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

function listPath(siteId: string, kind: string, extra = ''): string {
  return `/event-report/listEvents?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&eventKind=${kind}${extra}`
}

describe('EventReportService.listEvents', () => {
  it('lists events ordered by occurrence time with a stable eventId tie-break', async () => {
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

  it('lists kind-specific event fields and pages deterministically', async () => {
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

  it('paginates an event list page with nextOffset and hasMore', async () => {
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

  it('redacts a stack trace and URL query from a listed error message', async () => {
    const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    await using _ = fixture
    const { cookie, siteId } = await createOwnerSite(
      fixture.app,
      fixture.db,
      'event-redact@example.com',
    )
    seedAcceptedEvents(fixture.db, siteId, [
      {
        sessionId: 's1',
        visitorId: 'v1',
        kind: 'error',
        at: at(DAY_TWO, 12),
        pagePath: '/c',
        name: 'TypeError',
        code: 'E1',
        message: 'GET /cb?token=secret\n    at handler (/app/src/a.ts:1:2)',
      },
    ])
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const response = await apiTestRequest(fixture.app, listPath(siteId, 'error'), cookie)
    expect(response.status, await response.clone().text()).toBe(200)
    const body = await response.json()
    expect(body.items[0].message).toBe('GET /cb')
  })
})
