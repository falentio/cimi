import { expect, test } from 'vitest'
import { ERROR_CATALOG } from '@cimi/contract'
import type { Db } from '@cimi/db'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

/**
 * A fixture whose installation reports ready, so the HTTP admission gate admits analytics reads
 * and the request reaches the reporting handler. The default fixture reports `recovering`.
 */
function readyLifecycle() {
  return {
    async getSnapshot() {
      return {
        installationStatus: 'ready' as const,
        controlStore: 'ready' as const,
        analyticsStore: 'ready' as const,
        cleanupPending: false,
      }
    },
  }
}

async function createOwnerSite(
  app: Parameters<typeof apiTestRequest>[0],
  db: Db,
  email: string,
): Promise<{ readonly cookie: string; readonly siteId: string }> {
  const owner = await signUpTestUser(app, email, 'Report Owner')
  const localPart = email.slice(0, email.indexOf('@'))
  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    owner.cookie,
    { name: `Report Org ${localPart}` },
  )
  expect(organizationResponse.status).toBe(201)
  const organization = await organizationResponse.json()
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: `${localPart}.example.com`,
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()
  await seedRetentionCutoff(db, site.id)
  return { cookie: owner.cookie, siteId: site.id }
}

/**
 * Gives the Site an Effective Retention horizon. Nothing populates the cutoff row for a Site that
 * has never had its retention policy resolved, and admission fails closed on an unknown horizon,
 * so a report test needs one.
 */
function seedRetentionCutoff(db: Db, siteId: string): void {
  const now = Date.now()
  const installationId = 'ins_report_test'
  db.$client
    .prepare(
      `INSERT INTO installation (id, singleton_key, status, data_directory_ready, created_at, updated_at)
       VALUES (?, 'default', 'ready', 1, ?, ?)
       ON CONFLICT (singleton_key) DO NOTHING`,
    )
    .run(installationId, now, now)
  const existingInstallation = db.$client
    .prepare('SELECT id FROM installation ORDER BY created_at LIMIT 1')
    .get() as { id: string } | undefined
  const policyId = `rtn_${siteId}`
  db.$client
    .prepare(
      `INSERT INTO retention_policy (
         id, installation_id, scope, event_months, profile_months, version, status,
         effective_from, created_at, updated_at
       ) VALUES (?, ?, 'installation', 12, 12, 1, 'active', ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(policyId, existingInstallation?.id ?? installationId, now, now, now)
  db.$client
    .prepare(
      `INSERT INTO retention_effective_cutoff (
         site_id, installation_id, policy_id, reporting_timezone, local_day,
         event_occurrence_cutoff_at, raw_receipt_cutoff_at, profile_activity_cutoff_at,
         effective_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET
         event_occurrence_cutoff_at = excluded.event_occurrence_cutoff_at,
         raw_receipt_cutoff_at = excluded.raw_receipt_cutoff_at,
         profile_activity_cutoff_at = excluded.profile_activity_cutoff_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      siteId,
      existingInstallation?.id ?? installationId,
      policyId,
      'UTC',
      '2026-09-05',
      Date.parse('2026-01-01T00:00:00.000Z'),
      Date.parse('2026-01-01T00:00:00.000Z'),
      Date.parse('2026-01-01T00:00:00.000Z'),
      now,
      now,
    )
}

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
