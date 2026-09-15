import { describe, expect, it } from 'vitest'
import { ERROR_CATALOG } from '@cimi/contract'
import { apiTestRequest, createApiTestFixture } from '../../../testing/fixture.ts'
import { createOwnerSite, readyLifecycle } from '../../../testing/reporting-fixture.ts'

function overviewPath(siteId: string, extra = ''): string {
  return `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=2026-09-05&toDate=2026-09-06&granularity=day${extra}`
}

describe('TrafficReportService.admission', () => {
  it('rejects an unprojected Site with QUERY_LIMIT_EXCEEDED rather than reporting empty data', async () => {
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

  it('returns SERVICE_UNAVAILABLE before the handler when the analytics store is not ready', async () => {
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

  it('returns NOT_FOUND for an unknown Site without disclosing accessibility', async () => {
    await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    const { app } = fixture
    const { cookie } = await createOwnerSite(app, fixture.db, 'report-missing@example.com')

    const response = await apiTestRequest(app, overviewPath('ste-does-not-exist'), cookie)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })
})
