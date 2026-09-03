import { expect, test } from 'vitest'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'

test('deletes and recovers a site through 202 lifecycle routes', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'site-lifecycle-owner@example.com', 'Site Owner')

  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    owner.cookie,
    {
      name: 'Lifecycle Org',
    },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()

  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'lifecycle.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  const deleteResponse = await apiTestRequest(app, '/site/deleteSite', owner.cookie, {
    siteId: site.id,
  })
  expect(deleteResponse.status, await deleteResponse.clone().text()).toBe(202)
  const deletion = await deleteResponse.json()
  expect(deletion).toMatchObject({ accepted: true, status: 'deleting' })
  expect(typeof deletion.operationId).toBe('string')

  const recoverResponse = await apiTestRequest(app, '/site/recoverSite', owner.cookie, {
    siteId: site.id,
  })
  expect(recoverResponse.status, await recoverResponse.clone().text()).toBe(202)
  const recovery = await recoverResponse.json()
  expect(recovery).toMatchObject({ accepted: true, status: 'recovering' })
  expect(typeof recovery.operationId).toBe('string')

  const getResponse = await apiTestRequest(
    app,
    `/site/getSite?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(getResponse.status).toBe(404)
  await expect(getResponse.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })
})
