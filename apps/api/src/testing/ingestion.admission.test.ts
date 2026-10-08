import { expect, test } from 'vitest'
import { ERROR_CATALOG, SOrganizationCreateOutput, schema } from '@cimi/contract'
import { parse } from 'valibot'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'
import type { ApiApp } from '../index.ts'

const LEAK_MARKERS = [
  'DuckDB',
  'duckdb',
  '/tmp/cimi-test-data',
  'analyticsStore',
  'controlStore',
] as const

async function createIngestionSite(app: ApiApp, email: string, hostname: string) {
  const owner = await signUpTestUser(app, email, 'Ingestion Owner')

  const initialized = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )

  expect(initialized.status, await initialized.clone().text()).toBe(201)

  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    owner.cookie,
    { name: 'Ingestion Org' },
  )

  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())

  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname,
  })

  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)

  return { owner, site: parse(schema.SSiteCreateOutput, await siteResponse.json()) }
}

function eventFor(ingestionIdentifier: string, eventId: string) {
  return { eventId, ingestionIdentifier, kind: 'custom_event', name: 'checkout_completed' }
}

function publicDashboardQueryPath(identifier: string): string {
  const url = new URL('http://localhost/api/public-dashboard/queryPublicDashboard')
  url.search = new URLSearchParams({
    publicDashboardIdentifier: identifier,
    fromDate: '2026-09-05',
    toDate: '2026-09-05',
    granularity: 'hour',
    metric: 'pageviews',
    dimension: 'page',
  }).toString()

  return url.toString()
}

test('health reports degraded and collection durably accepts while DuckDB is unavailable', async () => {
  await using fixture = await createApiTestFixture({ analyticsReady: () => false })
  const { app, db } = fixture

  const { site } = await createIngestionSite(
    app,
    'admission-degraded@example.com',
    'admission-degraded.example.com',
  )

  const health = await apiTestRequest(app, '/system/health', '')
  expect(health.status, await health.clone().text()).toBe(200)
  await expect(health.json()).resolves.toMatchObject({
    status: 'degraded',
    analyticsStore: 'unavailable',
    controlStore: 'ready',
  })

  const event = eventFor(site.ingestionIdentifier, 'event_degraded_1')
  const accepted = await apiTestRequest(app, '/event-ingestion/collectEvent', '', event)
  expect(accepted.status, await accepted.clone().text()).toBe(200)
  await expect(accepted.json()).resolves.toMatchObject({
    status: 'accepted',
    eventId: event.eventId,
  })

  // SAFETY: better-sqlite3 returns any; single event_id column selected below.
  const rows = db.$client.prepare('SELECT event_id FROM accepted_event').all() as Array<{
    event_id: string
  }>

  expect(rows.map((row) => row.event_id)).toContain(event.eventId)
})

test('analytics reads fail closed with generic SERVICE_UNAVAILABLE before execution while degraded', async () => {
  await using fixture = await createApiTestFixture({ analyticsReady: () => false })
  const { app } = fixture

  const { owner, site } = await createIngestionSite(
    app,
    'admission-reads@example.com',
    'admission-reads.example.com',
  )

  const paths = [
    `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(site.id)}&fromDate=2026-09-05&toDate=2026-09-06&granularity=day`,
    `/identity-profile/listProfiles?siteId=${encodeURIComponent(site.id)}&limit=10&offset=0`,
  ]

  for (const path of paths) {
    const response = await apiTestRequest(app, path, owner.cookie)
    expect(response.status, await response.clone().text()).toBe(503)
    const body = await response.json()
    expect(body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      message: ERROR_CATALOG.SERVICE_UNAVAILABLE.message,
    })

    const serialized = JSON.stringify(body)

    for (const leaked of [...LEAK_MARKERS, site.ingestionIdentifier]) {
      expect(serialized, serialized).not.toContain(leaked)
    }
  }
})

test('the public dashboard read fails closed on the same admission gate', async () => {
  await using fixture = await createApiTestFixture({ analyticsReady: () => false })
  const { app } = fixture

  const { owner, site } = await createIngestionSite(
    app,
    'admission-public@example.com',
    'admission-public.example.com',
  )

  const enabled = await apiTestRequest(
    app,
    '/public-dashboard/enablePublicDashboard',
    owner.cookie,
    { siteId: site.id },
  )

  expect(enabled.status, await enabled.clone().text()).toBe(200)

  const { publicDashboardIdentifier } = await enabled.json()

  const response = await app.fetch(
    new Request(publicDashboardQueryPath(publicDashboardIdentifier)),
    {
      transportPeerIp: '203.0.113.10',
    },
  )

  expect(response.status, await response.clone().text()).toBe(503)
  await expect(response.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
    message: ERROR_CATALOG.SERVICE_UNAVAILABLE.message,
  })
})

test('admission ordering runs before procedure execution', async () => {
  await using fixture = await createApiTestFixture({ analyticsReady: () => false })
  const { app } = fixture

  const { owner } = await createIngestionSite(
    app,
    'admission-ordering@example.com',
    'admission-ordering.example.com',
  )

  const missingInput = await apiTestRequest(app, '/identity-profile/listProfiles', owner.cookie)
  expect(missingInput.status, await missingInput.clone().text()).toBe(503)
  await expect(missingInput.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  const unauthenticated = await apiTestRequest(app, '/hello/create', '', {
    name: 'ordering',
  })

  expect(unauthenticated.status, await unauthenticated.clone().text()).toBe(401)
  await expect(unauthenticated.json()).resolves.toMatchObject({
    code: 'UNAUTHORIZED',
    status: 401,
  })
})
