import { expect, test } from 'vitest'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'
import { InMemoryIngestionProtection } from '../../event-ingestion/protection.ts'

test('identity routes expose profiles and hide them after deletion is requested', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'identity-owner@example.com', 'Identity Owner')

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
    { name: 'Identity Org' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Identity Site',
    hostname: 'identity.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  const identified = await apiTestRequest(app, '/identity-profile/identify', '', {
    ingestionIdentifier: site.ingestionIdentifier,
    identifiedUserId: 'app-user-1',
    traits: { plan: 'pro' },
    anonymousIdentityId: 'anonymous-1',
    collectionContext: { consent: 'granted' },
  })
  expect(identified.status, await identified.clone().text()).toBe(200)
  await expect(identified.json()).resolves.toMatchObject({
    identifiedUserId: 'app-user-1',
    status: 'active',
  })

  const list = await apiTestRequest(
    app,
    `/identity-profile/listProfiles?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(list.status, await list.clone().text()).toBe(200)
  await expect(list.json()).resolves.toMatchObject({
    items: [{ identifiedUserId: 'app-user-1', traits: { plan: 'pro' }, aliases: ['anonymous-1'] }],
    totalCount: 1,
    hasMore: false,
    nextOffset: null,
  })

  const deletion = await apiTestRequest(
    app,
    '/identity-profile/requestProfileDeletion',
    owner.cookie,
    { siteId: site.id, identifiedUserId: 'app-user-1' },
  )
  expect(deletion.status, await deletion.clone().text()).toBe(202)
  await expect(deletion.json()).resolves.toEqual({
    accepted: true,
    status: 'deletion-requested',
  })

  const profile = await apiTestRequest(
    app,
    `/identity-profile/getProfile?siteId=${encodeURIComponent(site.id)}&identifiedUserId=app-user-1`,
    owner.cookie,
  )
  expect(profile.status, await profile.clone().text()).toBe(200)
  await expect(profile.json()).resolves.toEqual({ status: 'deletion-requested' })

  const status = await apiTestRequest(
    app,
    `/identity-profile/getDeletionStatus?siteId=${encodeURIComponent(site.id)}&identifiedUserId=app-user-1`,
    owner.cookie,
  )
  expect(status.status, await status.clone().text()).toBe(200)
  await expect(status.json()).resolves.toMatchObject({
    status: 'deletion-requested',
    derivedCleanup: { status: 'pending' },
    backupCleanup: { status: 'pending' },
  })
})

test('identity payloads over the trait limit return PAYLOAD_TOO_LARGE', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'identity-size-owner@example.com', 'Identity Size Owner')

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
    { name: 'Identity Size Org' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Identity Size Site',
    hostname: 'identity-size.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  const response = await apiTestRequest(app, '/identity-profile/identify', '', {
    ingestionIdentifier: site.ingestionIdentifier,
    identifiedUserId: 'app-user-large',
    traits: Object.fromEntries(
      Array.from({ length: 32 }, (_, index) => [`trait-${index}`, 'x'.repeat(512)]),
    ),
    collectionContext: { consent: 'granted' },
  })

  expect(response.status, await response.clone().text()).toBe(413)
  await expect(response.json()).resolves.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' })
})

test('identity requests use the trusted source IP protection bucket', async () => {
  const protection = new InMemoryIngestionProtection({
    siteBurst: 10,
    sourceIpBurst: 1,
    sourceIpRatePerSecond: 1,
  })
  await using fixture = await createApiTestFixture({
    eventIngestionProtection: protection,
    eventIngestionTrustProxyHeaders: true,
  })
  const { app } = fixture
  const owner = await signUpTestUser(app, 'identity-rate-owner@example.com', 'Identity Rate Owner')

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
    { name: 'Identity Rate Org' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Identity Rate Site',
    hostname: 'identity-rate.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()
  const request = (identifiedUserId: string) =>
    app.fetch(
      new Request('http://localhost/api/identity-profile/identify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.10',
        },
        body: JSON.stringify({
          ingestionIdentifier: site.ingestionIdentifier,
          identifiedUserId,
          collectionContext: { consent: 'granted' },
        }),
      }),
    )

  await expect(request('app-user-rate-1')).resolves.toMatchObject({ status: 200 })
  await expect(request('app-user-rate-2')).resolves.toMatchObject({ status: 429 })
})
