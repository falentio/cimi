import { expect, test } from 'vitest'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import { parse } from 'valibot'
import { SOrganizationCreateOutput, schema } from '@cimi/contract'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'
import type { ApiApp } from '../index.ts'

const DAY_ONE = '2026-09-05'
const DAY_TWO = '2026-09-06'

async function createOwnedSite(app: ApiApp, email: string, hostname: string) {
  const owner = await signUpTestUser(app, email, 'Coexistence Owner')
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
    { name: 'Coexistence Org' },
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

function collectBody(ingestionIdentifier: string, eventId: string) {
  return { eventId, ingestionIdentifier, kind: 'custom_event', name: 'checkout_completed' }
}

function overviewPath(siteId: string): string {
  return `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&granularity=day`
}

/**
 * The lifecycle lock is exclusive between ingestion and analytics reads: a collection holds an
 * ingestion lease for the whole coalescer window, and a report holds a shared read lease for the
 * whole read. Both directions fail closed with SERVICE_UNAVAILABLE and recover once the other
 * releases. This pins the seam so a future lock change cannot silently reverse it.
 */
test('ingestion and analytics reads are mutually exclusive and both recover', async () => {
  const lock = new InMemoryLifecycleLock()
  await using fixture = await createApiTestFixture({ lock })
  const { app } = fixture
  const { owner, site } = await createOwnedSite(
    app,
    'coexistence@example.com',
    'coexistence.example.com',
  )

  const baseline = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    collectBody(site.ingestionIdentifier, 'coexistence_1'),
  )
  expect(baseline.status, await baseline.clone().text()).toBe(200)

  const inFlight = apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    collectBody(site.ingestionIdentifier, 'coexistence_2'),
  )
  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(lock.heldKind(), 'the in-flight collect holds the ingestion lease').toBe('ingestion')

  const reportDuringIngestion = await apiTestRequest(app, overviewPath(site.id), owner.cookie)
  expect(reportDuringIngestion.status, await reportDuringIngestion.clone().text()).toBe(503)
  await expect(reportDuringIngestion.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })
  expect((await inFlight).status).toBe(200)

  // The lease is free again, so the read reaches admission. The freshly accepted Event is not yet
  // projected, so admission may legitimately answer QUERY_LIMIT_EXCEEDED; what must not happen is a
  // lease refusal.
  const reportAfterIngestion = await apiTestRequest(app, overviewPath(site.id), owner.cookie)
  expect(
    reportAfterIngestion.status,
    'the read must not be refused by the lease once ingestion settles',
  ).not.toBe(503)

  const readLease = lock.acquire('analytics-read')
  expect(readLease, 'a read lease is acquirable while no ingestion is in flight').toBeDefined()

  const collectDuringRead = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    collectBody(site.ingestionIdentifier, 'coexistence_3'),
  )
  expect(collectDuringRead.status, await collectDuringRead.clone().text()).toBe(503)
  await expect(collectDuringRead.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  await readLease?.release()

  const collectAfterRelease = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    collectBody(site.ingestionIdentifier, 'coexistence_4'),
  )
  expect(collectAfterRelease.status, await collectAfterRelease.clone().text()).toBe(200)
})
