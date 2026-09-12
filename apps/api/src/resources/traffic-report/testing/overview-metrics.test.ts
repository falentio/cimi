import { expect, test } from 'vitest'
import { apiTestRequest, createApiTestFixture } from '../../../testing/fixture.ts'
import { createOwnerSite, readyLifecycle, seedAcceptedEvents } from './reporting-fixture.ts'

const DAY_ONE = '2026-09-05'
const DAY_TWO = '2026-09-06'

function at(date: string, hour: number, offsetMs = 0): number {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`) + offsetMs
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
    { sessionId: 's3', visitorId: 'v3', kind: 'custom_event', at: at(DAY_TWO, 11, 1_000) },
  ])
  await fixture.analytics.rebuild({ controlDb: fixture.db })
  return { fixture, cookie, siteId }
}

test('serves real overview metrics with denominators and a partially complete trend', async () => {
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
  expect(body.trend).toHaveLength(2)
  expect(body.trend[0]).toMatchObject({ value: 4, complete: true, denominator: null })
  expect(body.trend[1]).toMatchObject({ value: 2, complete: false })
})
