import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '@cimi/db'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

test('Site administrators can manage public dashboard configuration without installation admin access', async () => {
  await using fixture = await createApiTestFixture()
  const { app, auth, db } = fixture
  const owner = await signUpTestUser(app, 'public-owner@example.com', 'Public Owner')
  const administrator = await signUpTestUser(
    app,
    'public-administrator@example.com',
    'Public Administrator',
  )

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
    { name: 'Public Dashboard Organization' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Public Dashboard Site',
    hostname: 'public-dashboard.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()
  const authorityOrganization = (
    await db
      .select({ authorityOrganizationId: schema.TOrganization.authorityOrganizationId })
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, organization.id))
  )[0]

  await auth.api.addMember({
    headers: new Headers({ cookie: owner.cookie }),
    body: {
      organizationId: authorityOrganization!.authorityOrganizationId!,
      userId: administrator.userId,
      role: 'admin',
    },
  })
  const reconciled = await apiTestRequest(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(reconciled.status, await reconciled.clone().text()).toBe(200)

  const response = await apiTestRequest(
    app,
    '/public-dashboard/enablePublicDashboard',
    administrator.cookie,
    {
      siteId: site.id,
    },
  )

  expect(response.status, await response.clone().text()).toBe(200)

  const enabledConfig = (await response.clone().json()) as {
    publicDashboardIdentifier: string
  }
  const queryUrl = new URL('http://localhost/api/public-dashboard/queryPublicDashboard')
  queryUrl.search = new URLSearchParams({
    publicDashboardIdentifier: enabledConfig.publicDashboardIdentifier,
    fromDate: '2026-09-01',
    toDate: '2026-09-01',
    granularity: 'hour',
    metric: 'visitors',
    dimension: 'time',
  }).toString()

  const missingPeer = await app.fetch(new Request(queryUrl))
  expect(missingPeer.status, await missingPeer.clone().text()).toBe(503)

  const withPeer = await app.fetch(new Request(queryUrl), { transportPeerIp: '203.0.113.10' })
  expect(withPeer.status, await withPeer.clone().text()).not.toBe(503)
})
