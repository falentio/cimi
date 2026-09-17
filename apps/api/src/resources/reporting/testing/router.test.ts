import { expect, test } from 'vitest'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

test('serves versioned Goal CRUD through the authenticated Site-scoped router', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'goal-router@example.com', 'Goal Owner')
  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    owner.cookie,
    { name: 'Goal Org' },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'goal-router.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  const createResponse = await apiTestRequest(app, '/goal/createGoal', owner.cookie, {
    siteId: site.id,
    name: 'Signups',
    action: { kind: 'custom_event', name: 'signup' },
    identityKind: 'visitor',
  })
  expect(createResponse.status, await createResponse.clone().text()).toBe(201)
  const created = await createResponse.json()
  expect(created).toMatchObject({
    siteId: site.id,
    name: 'Signups',
    action: { kind: 'custom_event', name: 'signup' },
    identityKind: 'visitor',
    status: 'active',
  })

  const listResponse = await apiTestRequest(
    app,
    `/goal/listGoals?siteId=${encodeURIComponent(site.id)}&offset=0&limit=20`,
    owner.cookie,
  )
  expect(listResponse.status, await listResponse.clone().text()).toBe(200)
  await expect(listResponse.json()).resolves.toMatchObject({
    items: [{ id: created.id }],
    nextOffset: null,
    hasMore: false,
    totalCount: 1,
  })

  const updateResponse = await apiTestRequest(app, '/goal/updateGoal', owner.cookie, {
    siteId: site.id,
    goalId: created.id,
    name: 'Completed signups',
    action: { kind: 'custom_event', name: 'completed_signup' },
    identityKind: 'identified_user',
  })
  expect(updateResponse.status, await updateResponse.clone().text()).toBe(200)
  await expect(updateResponse.json()).resolves.toMatchObject({
    name: 'Completed signups',
    identityKind: 'identified_user',
  })

  const archiveResponse = await apiTestRequest(app, '/goal/archiveGoal', owner.cookie, {
    siteId: site.id,
    goalId: created.id,
  })
  expect(archiveResponse.status, await archiveResponse.clone().text()).toBe(204)

  const getResponse = await apiTestRequest(
    app,
    `/goal/getGoal?siteId=${encodeURIComponent(site.id)}&goalId=${encodeURIComponent(created.id)}`,
    owner.cookie,
  )
  expect(getResponse.status, await getResponse.clone().text()).toBe(200)
  await expect(getResponse.json()).resolves.toMatchObject({
    id: created.id,
    status: 'archived',
    identityKind: 'identified_user',
  })
})
