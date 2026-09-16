import { describe, expect, it, vi } from 'vitest'
import { ERROR_CATALOG } from '@cimi/contract'
import { apiTestRequest, createApiTestFixture } from '../../../testing/fixture.ts'
import {
  createOwnerSite,
  readyLifecycle,
  seedAcceptedEvents,
} from '../../../testing/reporting-fixture.ts'
import { createEventReport } from '../index.ts'

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

describe('EventReportService.admission', () => {
  it('returns NOT_FOUND for an unknown Site without disclosing accessibility', async () => {
    const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    await using _ = fixture
    const { cookie } = await createOwnerSite(fixture.app, fixture.db, 'event-missing@example.com')

    const response = await apiTestRequest(
      fixture.app,
      overviewPath('ste-does-not-exist', 'page_view'),
      cookie,
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('returns SERVICE_UNAVAILABLE before the handler when the analytics store is not ready', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-degraded@example.com')
    await using _ = fixture
    await fixture.analytics.close()

    const response = await apiTestRequest(fixture.app, overviewPath(siteId, 'page_view'), cookie)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      message: ERROR_CATALOG.SERVICE_UNAVAILABLE.message,
    })
  })

  it('rejects an unprojected Site with QUERY_LIMIT_EXCEEDED rather than reporting empty data', async () => {
    const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    await using _ = fixture
    const { cookie, siteId } = await createOwnerSite(
      fixture.app,
      fixture.db,
      'event-unprojected@example.com',
    )

    const response = await apiTestRequest(fixture.app, overviewPath(siteId, 'page_view'), cookie)

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'QUERY_LIMIT_EXCEEDED',
      status: 422,
    })
  })

  it('fails closed with NOT_FOUND for a Site marked deleting', async () => {
    const { fixture, cookie, siteId } = await projectedSiteWithKinds('event-deleting@example.com')
    await using _ = fixture
    fixture.db.$client.prepare('UPDATE site SET status = ? WHERE id = ?').run('deleting', siteId)

    const response = await apiTestRequest(fixture.app, overviewPath(siteId, 'page_view'), cookie)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('rejects a relevant Projection Gap with QUERY_LIMIT_EXCEEDED before execution', async () => {
    const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
    await using _ = fixture
    const { cookie, siteId } = await createOwnerSite(
      fixture.app,
      fixture.db,
      'event-gap@example.com',
    )
    fixture.db.$client
      .prepare(
        `INSERT INTO projection_gap (id, site_id, occurrence_from, occurrence_to, unbounded, status, observed_at)
       VALUES (?, ?, ?, ?, 0, 'open', ?)`,
      )
      .run(
        'gap-1',
        siteId,
        Date.parse('2026-09-05T00:00:00Z'),
        Date.parse('2026-09-06T00:00:00Z'),
        Date.now(),
      )
    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const response = await apiTestRequest(fixture.app, overviewPath(siteId, 'page_view'), cookie)

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'QUERY_LIMIT_EXCEEDED',
      status: 422,
    })
  })

  it('rejects an over-limit timeseries before calling the query port', async () => {
    const { fixture, siteId } = await projectedSiteWithKinds(
      'event-bucket-short-circuit@example.com',
    )
    await using _ = fixture
    const owner = fixture.db.$client
      .prepare('SELECT user_id AS userId FROM auth_member ORDER BY created_at LIMIT 1')
      .get() as { userId: string } | undefined
    if (owner === undefined) throw new Error('createOwnerSite did not seed an owner membership')

    const report = createEventReport({
      db: fixture.db,
      analytics: fixture.analytics,
      lifecycle: readyLifecycle(),
      dataDirectoryReady: true,
      profileFilterKeys: {
        async getProfileFilterKeys() {
          return []
        },
      },
    })
    const eventBuckets = vi.spyOn(report.query, 'eventBuckets')

    await expect(
      report.service.getTimeseries(
        {
          siteId,
          fromDate: '2026-08-01',
          toDate: '2026-08-31',
          eventKind: 'page_view',
          granularity: 'hour',
        },
        { id: owner.userId },
      ),
    ).rejects.toMatchObject({ code: 'QUERY_LIMIT_EXCEEDED' })
    expect(eventBuckets).not.toHaveBeenCalled()
  })
})
