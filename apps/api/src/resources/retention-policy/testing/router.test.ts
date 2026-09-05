import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { schema } from '@cimi/db'
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

test('retention policy routes enforce the HTTP authorization matrix', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'matrix-owner@example.com', 'Matrix Owner')
  const member = await signUpTestUser(app, 'matrix-member@example.com', 'Matrix Member')
  const siteAdmin = await signUpTestUser(app, 'matrix-admin@example.com', 'Matrix Admin')
  const outsider = await signUpTestUser(app, 'matrix-outsider@example.com', 'Matrix Outsider')

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
    { name: 'Matrix Org' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()

  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'matrix.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  async function inviteAndAccept(email: string, cookie: string, role: 'member' | 'admin') {
    const invitationResponse = await apiTestRequest(
      app,
      '/invitation/createInvitation',
      owner.cookie,
      { organizationId: organization.id, role },
    )
    expect(invitationResponse.status, await invitationResponse.clone().text()).toBe(201)
    const invitation = await invitationResponse.json()
    const acceptResponse = await apiTestRequest(app, '/invitation/acceptInvitation', cookie, {
      token: invitation.token,
    })
    expect(acceptResponse.status, await acceptResponse.clone().text()).toBe(200)
  }

  await inviteAndAccept('matrix-member@example.com', member.cookie, 'member')
  await inviteAndAccept('matrix-admin@example.com', siteAdmin.cookie, 'admin')

  const unauthenticatedPost = await app.fetch(
    new Request('http://localhost/api/retention-policy/updateRetentionPolicy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'installation',
        policy: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
      }),
    }),
  )
  expect(unauthenticatedPost.status).toBe(401)

  const memberInstallationGet = await apiTestRequest(
    app,
    '/retention-policy/getRetentionPolicy?scope=installation',
    member.cookie,
  )
  expect(memberInstallationGet.status).toBe(403)

  const memberInstallationUpdate = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    member.cookie,
    { scope: 'installation', policy: { eventMonths: 24, profileMonths: 18, replayMonths: 6 } },
  )
  expect(memberInstallationUpdate.status).toBe(403)

  const outsiderSiteGet = await apiTestRequest(
    app,
    `/retention-policy/getRetentionPolicy?scope=site&siteId=${encodeURIComponent(site.id)}`,
    outsider.cookie,
  )
  expect(outsiderSiteGet.status).toBe(404)

  const memberSiteGet = await apiTestRequest(
    app,
    `/retention-policy/getRetentionPolicy?scope=site&siteId=${encodeURIComponent(site.id)}`,
    member.cookie,
  )
  expect(memberSiteGet.status).toBe(403)

  const memberSiteUpdate = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    member.cookie,
    {
      scope: 'site',
      siteId: site.id,
      policy: { eventMonths: 6, profileMonths: 6, replayMonths: null },
    },
  )
  expect(memberSiteUpdate.status).toBe(403)

  const adminSiteGet = await apiTestRequest(
    app,
    `/retention-policy/getRetentionPolicy?scope=site&siteId=${encodeURIComponent(site.id)}`,
    siteAdmin.cookie,
  )
  expect(adminSiteGet.status, await adminSiteGet.clone().text()).toBe(200)
  await expect(adminSiteGet.json()).resolves.toMatchObject({
    scope: 'site',
    siteId: site.id,
    siteOverride: null,
  })

  const adminSiteUpdate = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    siteAdmin.cookie,
    {
      scope: 'site',
      siteId: site.id,
      policy: { eventMonths: 6, profileMonths: 6, replayMonths: null },
    },
  )
  expect(adminSiteUpdate.status, await adminSiteUpdate.clone().text()).toBe(200)
  await expect(adminSiteUpdate.json()).resolves.toMatchObject({
    scope: 'site',
    siteId: site.id,
    siteOverride: { eventMonths: 6, profileMonths: 6, replayMonths: null },
    effectivePolicy: { eventMonths: 6, profileMonths: 6, replayMonths: null },
  })
})

test('retention policy routes hide inactive sites and conflict on updates', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'inactive-owner@example.com', 'Inactive Owner')

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
    { name: 'Inactive Org' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()

  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'inactive.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  const deleteResponse = await apiTestRequest(app, '/site/deleteSite', owner.cookie, {
    siteId: site.id,
  })
  expect(deleteResponse.status, await deleteResponse.clone().text()).toBe(202)

  const inactiveGet = await apiTestRequest(
    app,
    `/retention-policy/getRetentionPolicy?scope=site&siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(inactiveGet.status).toBe(404)

  const inactiveSave = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    {
      scope: 'site',
      siteId: site.id,
      policy: { eventMonths: 6, profileMonths: 6, replayMonths: null },
    },
  )
  expect(inactiveSave.status).toBe(409)

  const inactiveClear = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    { scope: 'site', siteId: site.id, policy: null },
  )
  expect(inactiveClear.status).toBe(409)
})

test('retention policy routes conflict on persisted lifecycle operations but still serve reads', async () => {
  await using fixture = await createApiTestFixture()
  const { app, db } = fixture
  const owner = await signUpTestUser(app, 'lifecycle-owner@example.com', 'Lifecycle Owner')

  const initialized = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(initialized.status, await initialized.clone().text()).toBe(201)

  db.update(schema.TInstallation)
    .set({
      activeOperationId: 'bop_1',
      activeOperationKind: 'upgrade',
      activeOperationPhase: 'pre_upgrade_safety',
      activeOperationCheckpoint: 'none',
      activeOperationProgress: 0,
      activeOperationOwnerToken: 'own_1',
      activeOperationLastSafeSequence: null,
      activeOperationErrorCode: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.TInstallation.singletonKey, 'default'))
    .run()

  const blockedUpdate = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    { scope: 'installation', policy: { eventMonths: 24, profileMonths: 18, replayMonths: 6 } },
  )
  expect(blockedUpdate.status).toBe(409)

  const allowedGet = await apiTestRequest(
    app,
    '/retention-policy/getRetentionPolicy?scope=installation',
    owner.cookie,
  )
  expect(allowedGet.status, await allowedGet.clone().text()).toBe(200)
})

test('retention policy routes validate transport, boundaries, and exact responses without mutation on failure', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'transport-owner@example.com', 'Transport Owner')

  const initialized = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(initialized.status, await initialized.clone().text()).toBe(201)

  const initialGet = await apiTestRequest(
    app,
    '/retention-policy/getRetentionPolicy?scope=installation',
    owner.cookie,
  )
  expect(initialGet.status, await initialGet.clone().text()).toBe(200)
  const initialBody = await initialGet.json()
  expect(initialBody).toEqual({
    scope: 'installation',
    installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    siteOverride: null,
    effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    updatedAt: expect.any(String),
  })

  const minimumUpdate = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    { scope: 'installation', policy: { eventMonths: 1, profileMonths: 1, replayMonths: null } },
  )
  expect(minimumUpdate.status, await minimumUpdate.clone().text()).toBe(200)
  await expect(minimumUpdate.json()).resolves.toEqual({
    scope: 'installation',
    installationDefault: { eventMonths: 1, profileMonths: 1, replayMonths: null },
    siteOverride: null,
    effectivePolicy: { eventMonths: 1, profileMonths: 1, replayMonths: null },
    updatedAt: expect.any(String),
  })

  const maximumUpdate = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    { scope: 'installation', policy: { eventMonths: 120, profileMonths: 120, replayMonths: null } },
  )
  expect(maximumUpdate.status, await maximumUpdate.clone().text()).toBe(200)

  const replayUpdate = await apiTestRequest(
    app,
    '/retention-policy/updateRetentionPolicy',
    owner.cookie,
    { scope: 'installation', policy: { eventMonths: 24, profileMonths: 18, replayMonths: 6 } },
  )
  expect(replayUpdate.status, await replayUpdate.clone().text()).toBe(200)
  await expect(replayUpdate.json()).resolves.toMatchObject({
    installationDefault: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
    effectivePolicy: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
  })

  const invalidInputs: Array<{ name: string; body: unknown }> = [
    {
      name: 'zero event months',
      body: {
        scope: 'installation',
        policy: { eventMonths: 0, profileMonths: 12, replayMonths: null },
      },
    },
    {
      name: 'profile exceeds event',
      body: {
        scope: 'installation',
        policy: { eventMonths: 6, profileMonths: 12, replayMonths: null },
      },
    },
    {
      name: 'replay equals event',
      body: {
        scope: 'installation',
        policy: { eventMonths: 12, profileMonths: 12, replayMonths: 12 },
      },
    },
    {
      name: 'null installation policy',
      body: { scope: 'installation', policy: null },
    },
    {
      name: 'site scope without siteId',
      body: { scope: 'site', policy: { eventMonths: 6, profileMonths: 6, replayMonths: null } },
    },
  ]

  for (const invalid of invalidInputs) {
    const response = await apiTestRequest(
      app,
      '/retention-policy/updateRetentionPolicy',
      owner.cookie,
      invalid.body as Record<string, unknown>,
    )
    expect(response.status, invalid.name).toBe(400)
  }

  const missingSiteGet = await apiTestRequest(
    app,
    '/retention-policy/getRetentionPolicy?scope=site',
    owner.cookie,
  )
  expect(missingSiteGet.status).toBe(400)

  const afterInvalidGet = await apiTestRequest(
    app,
    '/retention-policy/getRetentionPolicy?scope=installation',
    owner.cookie,
  )
  expect(afterInvalidGet.status, await afterInvalidGet.clone().text()).toBe(200)
  await expect(afterInvalidGet.json()).resolves.toMatchObject({
    installationDefault: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
    effectivePolicy: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
  })
})
