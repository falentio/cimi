import { expect, test } from 'vitest'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'

test('privileged site matrix enforces auth boundaries and correlates delete operation', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'matrix-owner@example.com', 'Matrix Owner')
  const member = await signUpTestUser(app, 'matrix-member@example.com', 'Matrix Member')
  const outsider = await signUpTestUser(app, 'matrix-outsider@example.com', 'Matrix Outsider')

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

  const invitationResponse = await apiTestRequest(
    app,
    '/invitation/createInvitation',
    owner.cookie,
    { organizationId: organization.id, role: 'member' },
  )
  expect(invitationResponse.status, await invitationResponse.clone().text()).toBe(201)
  const invitation = await invitationResponse.json()

  const acceptResponse = await apiTestRequest(app, '/invitation/acceptInvitation', member.cookie, {
    token: invitation.token,
  })
  expect(acceptResponse.status, await acceptResponse.clone().text()).toBe(200)

  const unauthenticatedStatus = await app.fetch(
    new Request(
      `http://localhost/api/site/getSiteDeletionStatus?siteId=${encodeURIComponent(site.id)}`,
      { method: 'GET' },
    ),
  )
  expect(unauthenticatedStatus.status).toBe(401)
  await expect(unauthenticatedStatus.json()).resolves.toMatchObject({
    code: 'UNAUTHORIZED',
    status: 401,
  })

  const rotateResponse = await apiTestRequest(
    app,
    '/site/rotateIngestionIdentifier',
    member.cookie,
    { siteId: site.id },
  )
  expect(rotateResponse.status).toBe(403)
  await expect(rotateResponse.json()).resolves.toMatchObject({
    code: 'FORBIDDEN',
    status: 403,
  })

  const outsiderGet = await apiTestRequest(
    app,
    `/site/getSite?siteId=${encodeURIComponent(site.id)}`,
    outsider.cookie,
  )
  expect(outsiderGet.status).toBe(404)
  await expect(outsiderGet.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  const outsiderList = await apiTestRequest(
    app,
    `/site/listSites?organizationId=${encodeURIComponent(organization.id)}`,
    outsider.cookie,
  )
  expect(outsiderList.status).toBe(200)
  await expect(outsiderList.json()).resolves.toMatchObject({ items: [] })

  const deleteResponse = await apiTestRequest(app, '/site/deleteSite', owner.cookie, {
    siteId: site.id,
  })
  expect(deleteResponse.status, await deleteResponse.clone().text()).toBe(202)
  const deletion = await deleteResponse.json()
  expect(deletion).toMatchObject({ accepted: true, status: 'deleting' })
  expect(typeof deletion.operationId).toBe('string')

  const statusResponse = await apiTestRequest(
    app,
    `/site/getSiteDeletionStatus?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(statusResponse.status).toBe(200)
  const status = await statusResponse.json()
  expect(status.operationId).toBe(deletion.operationId)
  expect(status).toMatchObject({ siteId: site.id, status: 'deleting' })
})

test('retention over HTTP preserves identifiers across delete and recover', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'retention-owner@example.com', 'Retention Owner')

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
  const hostname = site.hostname as string
  const ingestionIdentifier = site.ingestionIdentifier as string

  const deleteResponse = await apiTestRequest(app, '/site/deleteSite', owner.cookie, {
    siteId: site.id,
  })
  expect(deleteResponse.status, await deleteResponse.clone().text()).toBe(202)

  const recoverResponse = await apiTestRequest(app, '/site/recoverSite', owner.cookie, {
    siteId: site.id,
  })
  expect(recoverResponse.status, await recoverResponse.clone().text()).toBe(202)
  const recovery = await recoverResponse.json()
  expect(recovery).toMatchObject({ accepted: true, status: 'recovering' })

  const deadline = Date.now() + 5000
  for (;;) {
    const getResponse = await apiTestRequest(
      app,
      `/site/getSite?siteId=${encodeURIComponent(site.id)}`,
      owner.cookie,
    )
    if (getResponse.status === 200) {
      await expect(getResponse.json()).resolves.toMatchObject({ hostname, ingestionIdentifier })
      return
    }
    expect(getResponse.status).toBe(404)
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const statusResponse = await apiTestRequest(
    app,
    `/site/getSiteDeletionStatus?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(statusResponse.status).toBe(200)
  await expect(statusResponse.json()).resolves.toMatchObject({
    siteId: site.id,
    status: 'recovering',
    operationId: recovery.operationId,
  })

  const getResponse = await apiTestRequest(
    app,
    `/site/getSite?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(getResponse.status).toBe(404)
}, 15000)
