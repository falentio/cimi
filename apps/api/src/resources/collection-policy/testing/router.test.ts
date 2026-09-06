import { expect, test } from 'vitest'
import { schema } from '@cimi/contract'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

test('collection policy routes expose installation and Site mutations without raw revision data', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'collection-owner@example.com', 'Collection Owner')
  const policy = schema.DEFAULT_COLLECTION_POLICY

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
    { name: 'Collection Org' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'collection.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  const getResponse = await apiTestRequest(
    app,
    `/collection-policy/getCollectionPolicy?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(getResponse.status, await getResponse.clone().text()).toBe(200)
  await expect(getResponse.json()).resolves.toEqual({
    installationDefault: { scope: 'installation', ...policy },
    siteOverride: null,
    effective: { scope: 'site', siteId: site.id, ...policy },
    source: {
      anonymousCollection: 'installation',
      honorGpcDnt: 'installation',
      consentMode: 'installation',
      botPolicy: 'installation',
      captureQueryStrings: 'installation',
      urlPolicy: 'installation',
      propertyPolicy: 'installation',
      profileFilterKeys: 'installation',
      exclusions: 'installation',
    },
  })

  const installationUpdate = await apiTestRequest(
    app,
    '/collection-policy/updateCollectionPolicy',
    owner.cookie,
    {
      scope: 'installation',
      policy: {
        ...policy,
        captureQueryStrings: true,
        urlPolicy: { ...policy.urlPolicy, stripQueryStrings: false },
      },
    },
  )
  expect(installationUpdate.status, await installationUpdate.clone().text()).toBe(200)
  const installationBody = await installationUpdate.json()
  expect(installationBody).toMatchObject({ scope: 'installation', captureQueryStrings: true })
  expect(installationBody).not.toHaveProperty('siteId')

  const siteUpdate = await apiTestRequest(
    app,
    '/collection-policy/updateCollectionPolicy',
    owner.cookie,
    {
      scope: 'site',
      policy: { ...policy, siteId: site.id, consentMode: 'required_for_all' },
    },
  )
  expect(siteUpdate.status, await siteUpdate.clone().text()).toBe(200)
  await expect(siteUpdate.json()).resolves.toMatchObject({
    scope: 'site',
    siteId: site.id,
    consentMode: 'required_for_all',
  })
})
