import { expect, test } from 'vitest'
import { ERROR_CATALOG, SOrganizationCreateOutput, schema } from '@cimi/contract'
import { parse } from 'valibot'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'
import type { ApiApp } from '../index.ts'

async function createIngestionSite(app: ApiApp, email: string) {
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
    hostname: 'ingestion.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  return { owner, site: parse(schema.SSiteCreateOutput, await siteResponse.json()) }
}

test('health reports degraded and collection durably accepts while DuckDB is unavailable', async () => {
  await using fixture = await createApiTestFixture({ analyticsReady: () => false })
  const { app, db } = fixture
  const { site } = await createIngestionSite(app, 'admission-degraded@example.com')

  const health = await apiTestRequest(app, '/system/health', '')
  expect(health.status, await health.clone().text()).toBe(200)
  await expect(health.json()).resolves.toMatchObject({
    status: 'degraded',
    analyticsStore: 'unavailable',
    controlStore: 'ready',
  })

  const event = {
    eventId: 'event_degraded_1',
    ingestionIdentifier: site.ingestionIdentifier,
    kind: 'custom_event',
    name: 'checkout_completed',
  }
  const accepted = await apiTestRequest(app, '/event-ingestion/collectEvent', '', event)
  expect(accepted.status, await accepted.clone().text()).toBe(200)
  await expect(accepted.json()).resolves.toMatchObject({
    status: 'accepted',
    eventId: event.eventId,
  })

  const rows = db.$client.prepare('SELECT event_id FROM accepted_event').all() as Array<{
    event_id: string
  }>
  expect(rows.map((row) => row.event_id)).toContain(event.eventId)
})

test('analytics reads fail closed with generic SERVICE_UNAVAILABLE before execution while degraded', async () => {
  await using fixture = await createApiTestFixture({ analyticsReady: () => false })
  const { app } = fixture
  const { owner, site } = await createIngestionSite(app, 'admission-reads@example.com')

  const response = await apiTestRequest(
    app,
    `/identity-profile/listProfiles?siteId=${encodeURIComponent(site.id)}&limit=10&offset=0`,
    owner.cookie,
  )
  expect(response.status, await response.clone().text()).toBe(503)
  const body = await response.json()
  expect(body).toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
    message: ERROR_CATALOG.SERVICE_UNAVAILABLE.message,
  })

  const serialized = JSON.stringify(body)
  for (const leaked of [
    'DuckDB',
    'duckdb',
    '/tmp/cimi-test-data',
    'analyticsStore',
    'controlStore',
    site.ingestionIdentifier,
  ]) {
    expect(serialized, serialized).not.toContain(leaked)
  }
})

test('admission ordering runs before procedure execution', async () => {
  await using fixture = await createApiTestFixture({ analyticsReady: () => false })
  const { app } = fixture
  const { owner } = await createIngestionSite(app, 'admission-ordering@example.com')

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
