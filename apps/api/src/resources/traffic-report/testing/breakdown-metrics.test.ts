import { expect, test } from 'vitest'
import { apiTestRequest, createApiTestFixture } from '../../../testing/fixture.ts'
import { createOwnerSite, readyLifecycle, seedAcceptedEvents } from './reporting-fixture.ts'

const DAY_ONE = '2026-09-05'
const DAY_TWO = '2026-09-06'

function at(date: string, hour: number, offsetMs = 0): number {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`) + offsetMs
}

/**
 * Six attributed Sessions: four on /a (three desktop, one mobile) and two on /b (one desktop, one
 * with no device). Session s3 sees both /a and /b. One Session has no device so the NULL device
 * row must be excluded while the denominator still counts it.
 */
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

function breakdownPath(siteId: string, dimension: string, extra = ''): string {
  return `/traffic-report/getTrafficBreakdowns?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&granularity=day&dimension=${dimension}${extra}`
}

test('serves real page breakdown rows with counts, percentage, and the session denominator', async () => {
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

test('serves device breakdown rows excluding the NULL device while keeping the denominator', async () => {
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

test('paginates breakdown rows deterministically with a value tie-break', async () => {
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
