import { expect, test } from 'vitest'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

test('retention policy routes serve installation defaults through the registered router', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'retention-owner@example.com', 'Retention Owner')

  const initialized = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(initialized.status, await initialized.clone().text()).toBe(201)

  const unauthenticated = await app.fetch(
    new Request('http://localhost/api/retention-policy/getRetentionPolicy?scope=installation', {
      method: 'GET',
    }),
  )
  expect(unauthenticated.status).toBe(401)

  const getResponse = await apiTestRequest(
    app,
    '/retention-policy/getRetentionPolicy?scope=installation',
    owner.cookie,
  )
  expect(getResponse.status, await getResponse.clone().text()).toBe(200)
  await expect(getResponse.json()).resolves.toMatchObject({
    scope: 'installation',
    installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    siteOverride: null,
  })

  const updateResponse = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    {
      scope: 'installation',
      policy: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
    },
  )
  expect(updateResponse.status, await updateResponse.clone().text()).toBe(200)
  await expect(updateResponse.json()).resolves.toMatchObject({
    scope: 'installation',
    installationDefault: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
  })

  const reread = await apiTestRequest(
    app,
    '/retention-policy/getRetentionPolicy?scope=installation',
    owner.cookie,
  )
  expect(reread.status).toBe(200)
  await expect(reread.json()).resolves.toMatchObject({
    installationDefault: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
  })
})

test('retention policy routes serve site overrides and clear through the registered router', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'retention-site-owner@example.com', 'Site Owner')

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
    { name: 'Retention Org' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()

  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'retention.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  const siteGet = await apiTestRequest(
    app,
    `/retention-policy/getRetentionPolicy?scope=site&siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(siteGet.status, await siteGet.clone().text()).toBe(200)
  await expect(siteGet.json()).resolves.toMatchObject({
    scope: 'site',
    siteId: site.id,
    siteOverride: null,
  })

  const siteSave = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    {
      scope: 'site',
      siteId: site.id,
      policy: { eventMonths: 6, profileMonths: 6, replayMonths: null },
    },
  )
  expect(siteSave.status, await siteSave.clone().text()).toBe(200)
  await expect(siteSave.json()).resolves.toMatchObject({
    scope: 'site',
    siteId: site.id,
    siteOverride: { eventMonths: 6, profileMonths: 6, replayMonths: null },
  })

  const siteClear = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    { scope: 'site', siteId: site.id, policy: null },
  )
  expect(siteClear.status, await siteClear.clone().text()).toBe(200)
  await expect(siteClear.json()).resolves.toMatchObject({
    scope: 'site',
    siteId: site.id,
    siteOverride: null,
  })

  const siteResave = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    {
      scope: 'site',
      siteId: site.id,
      policy: { eventMonths: 3, profileMonths: 3, replayMonths: null },
    },
  )
  expect(siteResave.status, await siteResave.clone().text()).toBe(200)
  await expect(siteResave.json()).resolves.toMatchObject({
    siteOverride: { eventMonths: 3, profileMonths: 3, replayMonths: null },
  })
})
