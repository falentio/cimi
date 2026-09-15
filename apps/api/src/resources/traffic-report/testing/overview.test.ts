import { expect, test } from 'vitest'
import { ERROR_CATALOG } from '@cimi/contract'
import { apiTestRequest, createApiTestFixture } from '../../../testing/fixture.ts'
import { createOwnerSite, readyLifecycle } from '../../../testing/reporting-fixture.ts'

function overviewPath(siteId: string, extra = ''): string {
  return `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=2026-09-05&toDate=2026-09-06&granularity=day${extra}`
}

test('serves an admitted overview with stale freshness on a projected Site with no events', async () => {
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

test('rejects an unprojected Site with QUERY_LIMIT_EXCEEDED rather than reporting empty data', async () => {
  await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { app } = fixture
  const { cookie, siteId } = await createOwnerSite(
    app,
    fixture.db,
    'report-unprojected@example.com',
  )

  const response = await apiTestRequest(app, overviewPath(siteId), cookie)

  expect(response.status).toBe(422)
  await expect(response.json()).resolves.toMatchObject({
    code: 'QUERY_LIMIT_EXCEEDED',
    status: 422,
  })
})

test('returns SERVICE_UNAVAILABLE before the handler when the analytics store is not ready', async () => {
  await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { app } = fixture
  const { cookie, siteId } = await createOwnerSite(app, fixture.db, 'report-degraded@example.com')
  await fixture.analytics.close()

  const response = await apiTestRequest(app, overviewPath(siteId), cookie)

  expect(response.status).toBe(503)
  await expect(response.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
    message: ERROR_CATALOG.SERVICE_UNAVAILABLE.message,
  })
})

test('returns NOT_FOUND for an unknown Site without disclosing accessibility', async () => {
  await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { app } = fixture
  const { cookie } = await createOwnerSite(app, fixture.db, 'report-missing@example.com')

  const response = await apiTestRequest(app, overviewPath('ste-does-not-exist'), cookie)

  expect(response.status).toBe(404)
  await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })
})

test('returns BAD_REQUEST for an invalid range instead of clamping it', async () => {
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

test('rejects a range that reaches past Effective Retention instead of clamping it', async () => {
  await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { app } = fixture
  const { cookie, siteId } = await createOwnerSite(app, fixture.db, 'report-overbound@example.com')
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

test('serves an admitted breakdown page with pagination metadata', async () => {
  await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { app } = fixture
  const { cookie, siteId } = await createOwnerSite(app, fixture.db, 'report-breakdown@example.com')
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
