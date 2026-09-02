import { afterEach, expect, test, vi } from 'vitest'
import { createAuth } from '@cimi/auth/server'
import {
  SMembershipListOutput,
  SOrganizationCreateOutput,
  SOrganizationEnsurePersonalOutput,
  SOrganizationListOutput,
} from '@cimi/contract'
import { eq } from 'drizzle-orm'
import { parse } from 'valibot'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb, createTestAnalyticsDb } from '@cimi/db/testing'
import { createApiApp } from '../index.ts'

const fixtures: Array<{
  db: Db
  analytics: Awaited<ReturnType<typeof createTestAnalyticsDb>>
}> = []

const jsonHeaders = { 'content-type': 'application/json' }

afterEach(async () => {
  for (const { analytics, db } of fixtures) {
    await analytics.close()
    closeDb(db)
  }
  fixtures.length = 0
})

async function createFixture() {
  const db = createMigratedTestDb()
  try {
    const analytics = await createTestAnalyticsDb()
    try {
      const auth = createAuth({
        db,
        schema: schema.betterAuthSchema,
        secret: 'test-secret-1234567890',
        baseURL: 'http://localhost',
      })
      const app = createApiApp({ db, auth, analytics, baseUrl: 'http://localhost' })
      fixtures.push({ db, analytics })
      return { app, auth, db }
    } catch (error) {
      await analytics.close()
      throw error
    }
  } catch (error) {
    closeDb(db)
    throw error
  }
}

async function signUp(
  app: ReturnType<typeof createApiApp>,
  email: string,
  name: string,
): Promise<{ cookie: string; userId: string }> {
  const response = await app.fetch(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name, email, password: 'password123' }),
    }),
  )
  expect(response.status).toBe(200)
  const body = (await response.json()) as { user: { id: string } }
  const setCookie = response.headers.get('set-cookie')
  expect(setCookie).toBeTruthy()
  return { cookie: setCookie!.split(';', 1)[0]!, userId: body.user.id }
}

async function request(
  app: ReturnType<typeof createApiApp>,
  path: string,
  cookie: string,
  body?: object,
): Promise<Response> {
  const headers = body === undefined ? { cookie } : { ...jsonHeaders, cookie }
  return app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}

test('serves organization and membership governance through the Cimi API', async () => {
  const { app, auth, db } = await createFixture()
  const owner = await signUp(app, 'owner@example.com', 'Owner')
  const member = await signUp(app, 'member@example.com', 'Member')

  const personalResponse = await request(
    app,
    '/organization/ensurePersonalOrganization',
    owner.cookie,
    {},
  )
  expect(personalResponse.status).toBe(200)
  const personal = await personalResponse.json()
  expect(personal).toEqual(expect.schemaMatching(SOrganizationEnsurePersonalOutput))

  const createResponse = await request(app, '/organization/createOrganization', owner.cookie, {
    name: 'Analytics',
  })
  const createBody = await createResponse.json()
  expect(createResponse.status, JSON.stringify(createBody)).toBe(201)
  const organization = createBody
  expect(organization).toEqual(expect.schemaMatching(SOrganizationCreateOutput))

  const authorityOrganization = (
    await db
      .select({ authorityOrganizationId: schema.TOrganization.authorityOrganizationId })
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, organization.id))
  )[0]
  expect(authorityOrganization?.authorityOrganizationId).toBeTruthy()

  await auth.api.addMember({
    headers: new Headers({ cookie: owner.cookie }),
    body: {
      organizationId: authorityOrganization!.authorityOrganizationId!,
      userId: member.userId,
      role: 'member',
    },
  })

  const listResponse = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(listResponse.status).toBe(200)
  const listedMembers = await listResponse.json()
  expect(listedMembers).toEqual(expect.schemaMatching(SMembershipListOutput))
  expect(listedMembers.items).toHaveLength(2)

  const roleResponse = await request(app, '/membership/changeMemberRole', owner.cookie, {
    organizationId: organization.id,
    userId: member.userId,
    role: 'admin',
  })
  expect(roleResponse.status).toBe(200)
  expect(await roleResponse.json()).toMatchObject({ userId: member.userId, role: 'admin' })

  const transferResponse = await request(
    app,
    '/membership/transferOrganizationOwnership',
    owner.cookie,
    { organizationId: organization.id, userId: member.userId },
  )
  expect(transferResponse.status).toBe(200)
  expect(await transferResponse.json()).toMatchObject({ userId: member.userId, role: 'owner' })

  const siteResponse = await request(app, '/site/createSite', member.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'example.com',
  })
  expect(siteResponse.status).toBe(201)
  const site = await siteResponse.json()

  const removeResponse = await request(app, '/membership/removeMember', member.cookie, {
    organizationId: organization.id,
    userId: owner.userId,
  })
  expect(removeResponse.status).toBe(204)

  const staleOrganizationResponse = await request(
    app,
    `/organization/getOrganization?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(staleOrganizationResponse.status).toBe(404)

  const staleSiteResponse = await request(
    app,
    `/site/getSite?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(staleSiteResponse.status).toBe(404)

  const replayResponse = await request(
    app,
    '/membership/transferOrganizationOwnership',
    owner.cookie,
    { organizationId: organization.id, userId: member.userId },
  )
  expect(replayResponse.status).toBe(403)
  expect(await replayResponse.json()).toMatchObject({ code: 'FORBIDDEN', status: 403 })
})

test('converges concurrent Personal Organization provisioning requests', async () => {
  const { app, db } = await createFixture()
  const owner = await signUp(app, 'personal-concurrent@example.com', 'Concurrent Owner')

  const [first, second] = await Promise.all([
    request(app, '/organization/ensurePersonalOrganization', owner.cookie, {}),
    request(app, '/organization/ensurePersonalOrganization', owner.cookie, {}),
  ])
  expect(first.status).toBe(200)
  expect(second.status).toBe(200)
  const firstOrganization = await first.json()
  const secondOrganization = await second.json()
  expect(firstOrganization.id).toBe(secondOrganization.id)

  const organizations = await db
    .select()
    .from(schema.TOrganization)
    .where(eq(schema.TOrganization.ownerUserId, owner.userId))
  expect(organizations).toHaveLength(1)
  expect(organizations[0]).toMatchObject({
    id: firstOrganization.id,
    ownerUserId: owner.userId,
    isPersonal: true,
  })
  await expect(
    db
      .select()
      .from(schema.TMembership)
      .where(eq(schema.TMembership.organizationId, firstOrganization.id)),
  ).resolves.toMatchObject([expect.objectContaining({ userId: owner.userId, role: 'owner' })])
})

test('deletes an empty Personal Organization and its membership', async () => {
  const { app, db } = await createFixture()
  const owner = await signUp(app, 'personal-delete@example.com', 'Personal Owner')

  const ensureResponse = await request(
    app,
    '/organization/ensurePersonalOrganization',
    owner.cookie,
    {},
  )
  expect(ensureResponse.status).toBe(200)
  const organization = await ensureResponse.json()

  const deleteResponse = await request(app, '/organization/deleteOrganization', owner.cookie, {
    organizationId: organization.id,
  })
  expect(deleteResponse.status).toBe(204)
  await expect(
    db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, organization.id)),
  ).resolves.toHaveLength(0)
  await expect(
    db
      .select()
      .from(schema.TMembership)
      .where(eq(schema.TMembership.organizationId, organization.id)),
  ).resolves.toHaveLength(0)
})

test('prioritizes Personal Organization protection when a Site exists', async () => {
  const { app, db } = await createFixture()
  const owner = await signUp(app, 'personal-site-delete@example.com', 'Personal Site Owner')

  const ensureResponse = await request(
    app,
    '/organization/ensurePersonalOrganization',
    owner.cookie,
    {},
  )
  expect(ensureResponse.status).toBe(200)
  const organization = await ensureResponse.json()
  const siteResponse = await request(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Personal Site',
    hostname: 'personal.example.com',
  })
  expect(siteResponse.status).toBe(201)
  const site = await siteResponse.json()
  const beforeOrganization = await db
    .select()
    .from(schema.TOrganization)
    .where(eq(schema.TOrganization.id, organization.id))
  const beforeMembership = await db
    .select()
    .from(schema.TMembership)
    .where(eq(schema.TMembership.organizationId, organization.id))

  const deleteResponse = await request(app, '/organization/deleteOrganization', owner.cookie, {
    organizationId: organization.id,
  })
  expect(deleteResponse.status).toBe(409)
  await expect(deleteResponse.json()).resolves.toMatchObject({
    code: 'PERSONAL_ORGANIZATION_PROTECTED',
    status: 409,
  })
  await expect(
    db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, organization.id)),
  ).resolves.toEqual(beforeOrganization)
  await expect(
    db
      .select()
      .from(schema.TMembership)
      .where(eq(schema.TMembership.organizationId, organization.id)),
  ).resolves.toEqual(beforeMembership)
  await expect(
    db.select().from(schema.TSite).where(eq(schema.TSite.id, site.id)),
  ).resolves.toHaveLength(1)
})

test('rejects deletion of a non-personal Organization that owns a Site', async () => {
  const { app, db } = await createFixture()
  const owner = await signUp(app, 'non-personal-site-delete@example.com', 'Organization Owner')

  const createResponse = await request(app, '/organization/createOrganization', owner.cookie, {
    name: 'Site Organization',
  })
  expect(createResponse.status).toBe(201)
  const organization = await createResponse.json()
  const siteResponse = await request(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'production.example.com',
  })
  expect(siteResponse.status).toBe(201)
  const site = await siteResponse.json()
  const beforeOrganization = await db
    .select()
    .from(schema.TOrganization)
    .where(eq(schema.TOrganization.id, organization.id))
  const beforeMembership = await db
    .select()
    .from(schema.TMembership)
    .where(eq(schema.TMembership.organizationId, organization.id))

  const deleteResponse = await request(app, '/organization/deleteOrganization', owner.cookie, {
    organizationId: organization.id,
  })
  expect(deleteResponse.status).toBe(409)
  await expect(deleteResponse.json()).resolves.toMatchObject({
    code: 'ORGANIZATION_NOT_EMPTY',
    status: 409,
  })
  await expect(
    db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, organization.id)),
  ).resolves.toEqual(beforeOrganization)
  await expect(
    db
      .select()
      .from(schema.TMembership)
      .where(eq(schema.TMembership.organizationId, organization.id)),
  ).resolves.toEqual(beforeMembership)
  await expect(
    db.select().from(schema.TSite).where(eq(schema.TSite.id, site.id)),
  ).resolves.toHaveLength(1)
})

test('authorizes Organization updates and persists the new name', async () => {
  const { app, auth, db } = await createFixture()
  const owner = await signUp(app, 'organization-update-owner@example.com', 'Update Owner')
  const member = await signUp(app, 'organization-update-member@example.com', 'Update Member')

  const createResponse = await request(app, '/organization/createOrganization', owner.cookie, {
    name: 'Before Update',
  })
  expect(createResponse.status).toBe(201)
  const organization = await createResponse.json()
  const persistedOrganization = (
    await db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, organization.id))
  )[0]
  expect(persistedOrganization).toBeDefined()
  await auth.api.addMember({
    headers: new Headers({ cookie: owner.cookie }),
    body: {
      organizationId: persistedOrganization!.authorityOrganizationId!,
      userId: member.userId,
      role: 'member',
    },
  })
  const membersResponse = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(membersResponse.status).toBe(200)

  const memberUpdate = await request(app, '/organization/updateOrganization', member.cookie, {
    organizationId: organization.id,
    name: 'Unauthorized Update',
  })
  expect(memberUpdate.status).toBe(403)

  const promoteResponse = await request(app, '/membership/changeMemberRole', owner.cookie, {
    organizationId: organization.id,
    userId: member.userId,
    role: 'admin',
  })
  expect(promoteResponse.status).toBe(200)
  const updateResponse = await request(app, '/organization/updateOrganization', member.cookie, {
    organizationId: organization.id,
    name: 'Updated by Administrator',
  })
  expect(updateResponse.status).toBe(200)
  await expect(updateResponse.json()).resolves.toMatchObject({
    id: organization.id,
    name: 'Updated by Administrator',
    ownerUserId: owner.userId,
    isPersonal: false,
  })

  const getResponse = await request(
    app,
    `/organization/getOrganization?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(getResponse.status).toBe(200)
  await expect(getResponse.json()).resolves.toMatchObject({ name: 'Updated by Administrator' })
  await expect(
    db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, organization.id)),
  ).resolves.toMatchObject([
    expect.objectContaining({
      name: 'Updated by Administrator',
      ownerUserId: owner.userId,
      isPersonal: false,
    }),
  ])
  await expect(
    auth.api.getOrganization({
      headers: new Headers({ cookie: owner.cookie }),
      query: { organizationId: persistedOrganization!.authorityOrganizationId! },
    }),
  ).resolves.toMatchObject({ name: 'Updated by Administrator' })
})

test('isolates Organization lists and returns live offset pagination', async () => {
  const { app } = await createFixture()
  const owner = await signUp(app, 'organization-list-owner@example.com', 'List Owner')
  const outsider = await signUp(app, 'organization-list-outsider@example.com', 'List Outsider')
  const names = ['First Organization', 'Second Organization', 'Third Organization']
  for (const name of names) {
    const response = await request(app, '/organization/createOrganization', owner.cookie, { name })
    expect(response.status).toBe(201)
  }
  const outsiderCreate = await request(app, '/organization/createOrganization', outsider.cookie, {
    name: 'Outsider Organization',
  })
  expect(outsiderCreate.status).toBe(201)

  const pageOneResponse = await request(
    app,
    '/organization/listOrganizations?offset=0&limit=1',
    owner.cookie,
  )
  const pageTwoResponse = await request(
    app,
    '/organization/listOrganizations?offset=1&limit=1',
    owner.cookie,
  )
  const pageThreeResponse = await request(
    app,
    '/organization/listOrganizations?offset=2&limit=1',
    owner.cookie,
  )
  expect(pageOneResponse.status).toBe(200)
  expect(pageTwoResponse.status).toBe(200)
  expect(pageThreeResponse.status).toBe(200)
  const pageOne = parse(SOrganizationListOutput, await pageOneResponse.json())
  const pageTwo = parse(SOrganizationListOutput, await pageTwoResponse.json())
  const pageThree = parse(SOrganizationListOutput, await pageThreeResponse.json())
  expect(pageOne).toMatchObject({ nextOffset: 1, hasMore: true, totalCount: 3 })
  expect(pageTwo).toMatchObject({ nextOffset: 2, hasMore: true, totalCount: 3 })
  expect(pageThree).toMatchObject({ nextOffset: null, hasMore: false, totalCount: 3 })
  expect(
    [pageOne, pageTwo, pageThree].flatMap((page) => page.items.map((item) => item.name)),
  ).toEqual(expect.arrayContaining(names))
  expect(
    [pageOne, pageTwo, pageThree].flatMap((page) => page.items.map((item) => item.name)),
  ).not.toContain('Outsider Organization')

  const outsiderList = await request(app, '/organization/listOrganizations', outsider.cookie)
  expect(outsiderList.status).toBe(200)
  await expect(outsiderList.json()).resolves.toMatchObject({
    totalCount: 1,
    items: [expect.objectContaining({ name: 'Outsider Organization' })],
  })
})

test('returns not found when Better Auth independently removes a projected member', async () => {
  const { app, auth, db } = await createFixture()
  const owner = await signUp(app, 'authority-owner@example.com', 'Owner')
  const member = await signUp(app, 'authority-member@example.com', 'Member')

  const createResponse = await request(app, '/organization/createOrganization', owner.cookie, {
    name: 'Authority Drift',
  })
  expect(createResponse.status).toBe(201)
  const organization = await createResponse.json()
  const persistedOrganization = (
    await db
      .select({ authorityOrganizationId: schema.TOrganization.authorityOrganizationId })
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, organization.id))
  )[0]
  expect(persistedOrganization?.authorityOrganizationId).toBeTruthy()

  const addedMember = await auth.api.addMember({
    headers: new Headers({ cookie: owner.cookie }),
    body: {
      organizationId: persistedOrganization!.authorityOrganizationId!,
      userId: member.userId,
      role: 'member',
    },
  })

  const initialList = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(initialList.status).toBe(200)

  await auth.api.removeMember({
    headers: new Headers({ cookie: owner.cookie }),
    body: {
      organizationId: persistedOrganization!.authorityOrganizationId!,
      memberIdOrEmail: addedMember.id,
    },
  })

  const staleMemberResponse = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    member.cookie,
  )
  expect(staleMemberResponse.status).toBe(404)
  expect(await staleMemberResponse.json()).toMatchObject({ code: 'NOT_FOUND', status: 404 })
})

test('does not let an outsider recover a pending member removal', async () => {
  const { app, auth, db } = await createFixture()
  const owner = await signUp(app, 'removal-owner@example.com', 'Owner')
  const target = await signUp(app, 'removal-target@example.com', 'Target')
  const outsider = await signUp(app, 'removal-outsider@example.com', 'Outsider')

  const createResponse = await request(app, '/organization/createOrganization', owner.cookie, {
    name: 'Removal Recovery',
  })
  expect(createResponse.status).toBe(201)
  const organization = await createResponse.json()
  const persistedOrganization = (
    await db
      .select({ authorityOrganizationId: schema.TOrganization.authorityOrganizationId })
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, organization.id))
  )[0]
  const authorityOrganizationId = persistedOrganization?.authorityOrganizationId
  expect(authorityOrganizationId).toBeTruthy()

  await auth.api.addMember({
    headers: new Headers({ cookie: owner.cookie }),
    body: { organizationId: authorityOrganizationId!, userId: target.userId, role: 'member' },
  })
  const initialList = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(initialList.status).toBe(200)

  const removeMember = vi
    .spyOn(auth.api, 'removeMember')
    .mockRejectedValueOnce(new Error('authority unavailable'))
  const firstRemoval = await request(app, '/membership/removeMember', owner.cookie, {
    organizationId: organization.id,
    userId: target.userId,
  })
  expect(firstRemoval.status).toBe(409)

  const pendingOperation = (
    await db
      .select()
      .from(schema.TOrganizationGovernanceOperation)
      .where(eq(schema.TOrganizationGovernanceOperation.organizationId, organization.id))
  )[0]
  expect(pendingOperation).toMatchObject({
    operationType: 'remove-member',
    status: 'pending',
    attemptCount: 1,
    failureCode: 'CONFLICT',
    failureMessage: 'authority unavailable',
  })
  await expect(
    db.select().from(schema.TMembership).where(eq(schema.TMembership.userId, target.userId)),
  ).resolves.toHaveLength(0)

  const outsiderList = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    outsider.cookie,
  )
  expect(outsiderList.status).toBe(404)
  expect(
    (
      await db
        .select({
          status: schema.TOrganizationGovernanceOperation.status,
          attemptCount: schema.TOrganizationGovernanceOperation.attemptCount,
        })
        .from(schema.TOrganizationGovernanceOperation)
        .where(eq(schema.TOrganizationGovernanceOperation.id, pendingOperation!.id))
    )[0],
  ).toMatchObject({ status: 'pending', attemptCount: 1 })

  const ownerRecovery = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(ownerRecovery.status).toBe(200)
  expect(removeMember).toHaveBeenCalledTimes(2)
  const completedOperation = (
    await db
      .select({
        status: schema.TOrganizationGovernanceOperation.status,
        failureCode: schema.TOrganizationGovernanceOperation.failureCode,
        failureMessage: schema.TOrganizationGovernanceOperation.failureMessage,
      })
      .from(schema.TOrganizationGovernanceOperation)
      .where(eq(schema.TOrganizationGovernanceOperation.id, pendingOperation!.id))
  )[0]
  expect(completedOperation).toMatchObject({
    status: 'completed',
    failureCode: null,
    failureMessage: null,
  })
  await expect(
    auth.api.listMembers({
      headers: new Headers({ cookie: owner.cookie }),
      query: { organizationId: authorityOrganizationId!, offset: 0, limit: 100 },
    }),
  ).resolves.toMatchObject({
    members: expect.not.arrayContaining([expect.objectContaining({ userId: target.userId })]),
  })
})

test('recovers a pending member leave through another administrator', async () => {
  const { app, auth, db } = await createFixture()
  const owner = await signUp(app, 'leave-owner@example.com', 'Owner')
  const administrator = await signUp(app, 'leave-administrator@example.com', 'Administrator')
  const target = await signUp(app, 'leave-target@example.com', 'Target')

  const createResponse = await request(app, '/organization/createOrganization', owner.cookie, {
    name: 'Leave Recovery',
  })
  expect(createResponse.status).toBe(201)
  const organization = await createResponse.json()
  const persistedOrganization = (
    await db
      .select({ authorityOrganizationId: schema.TOrganization.authorityOrganizationId })
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, organization.id))
  )[0]
  const authorityOrganizationId = persistedOrganization?.authorityOrganizationId
  expect(authorityOrganizationId).toBeTruthy()

  for (const member of [
    { userId: administrator.userId, role: 'admin' as const },
    { userId: target.userId, role: 'member' as const },
  ]) {
    await auth.api.addMember({
      headers: new Headers({ cookie: owner.cookie }),
      body: { organizationId: authorityOrganizationId!, ...member },
    })
  }
  const initialList = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(initialList.status).toBe(200)

  const leaveOrganization = vi
    .spyOn(auth.api, 'leaveOrganization')
    .mockRejectedValueOnce(new Error('authority unavailable'))
  const firstLeave = await request(app, '/membership/leaveOrganization', target.cookie, {
    organizationId: organization.id,
  })
  expect(firstLeave.status).toBe(409)
  expect(leaveOrganization).toHaveBeenCalledTimes(1)

  const pendingOperation = (
    await db
      .select()
      .from(schema.TOrganizationGovernanceOperation)
      .where(eq(schema.TOrganizationGovernanceOperation.organizationId, organization.id))
  )[0]
  expect(pendingOperation).toMatchObject({
    operationType: 'leave-organization',
    status: 'pending',
    attemptCount: 1,
    failureCode: 'CONFLICT',
    failureMessage: 'authority unavailable',
  })
  await expect(
    db.select().from(schema.TMembership).where(eq(schema.TMembership.userId, target.userId)),
  ).resolves.toHaveLength(0)

  const recovery = await request(
    app,
    `/membership/listMembers?organizationId=${encodeURIComponent(organization.id)}`,
    owner.cookie,
  )
  expect(recovery.status).toBe(200)
  const completedOperation = (
    await db
      .select({
        status: schema.TOrganizationGovernanceOperation.status,
        failureCode: schema.TOrganizationGovernanceOperation.failureCode,
        failureMessage: schema.TOrganizationGovernanceOperation.failureMessage,
      })
      .from(schema.TOrganizationGovernanceOperation)
      .where(eq(schema.TOrganizationGovernanceOperation.id, pendingOperation!.id))
  )[0]
  expect(completedOperation).toMatchObject({
    status: 'completed',
    failureCode: null,
    failureMessage: null,
  })
  await expect(
    auth.api.listMembers({
      headers: new Headers({ cookie: owner.cookie }),
      query: { organizationId: authorityOrganizationId!, offset: 0, limit: 100 },
    }),
  ).resolves.toMatchObject({
    members: expect.not.arrayContaining([expect.objectContaining({ userId: target.userId })]),
  })
})

test('hides pending Organization state from an inaccessible caller', async () => {
  const { app, db } = await createFixture()
  const owner = await signUp(app, 'pending-owner@example.com', 'Owner')
  const outsider = await signUp(app, 'pending-outsider@example.com', 'Outsider')

  const createResponse = await request(app, '/organization/createOrganization', owner.cookie, {
    name: 'Pending Organization',
  })
  expect(createResponse.status).toBe(201)
  const organization = await createResponse.json()

  const organizationPath = `/organization/getOrganization?organizationId=${encodeURIComponent(organization.id)}`
  const deletePath = '/organization/deleteOrganization'
  const updatePath = '/organization/updateOrganization'
  const initialGet = await request(app, organizationPath, outsider.cookie)
  const initialUpdate = await request(app, updatePath, outsider.cookie, {
    organizationId: organization.id,
    name: 'Unauthorized update',
  })
  const initialDelete = await request(app, deletePath, outsider.cookie, {
    organizationId: organization.id,
  })
  expect(initialGet.status).toBe(404)
  expect(initialUpdate.status).toBe(404)
  expect(initialDelete.status).toBe(404)

  const now = new Date()
  db.insert(schema.TOrganizationGovernanceOperation)
    .values({
      id: 'pending-enumeration-operation',
      organizationId: organization.id,
      operationType: 'delete-organization',
      previousOwnerUserId: owner.userId,
      targetUserId: owner.userId,
      targetRole: null,
      status: 'pending',
      attemptCount: 0,
      requestedAt: now,
      lastAttemptAt: null,
      completedAt: null,
      failureCode: null,
      failureMessage: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const pendingGet = await request(app, organizationPath, outsider.cookie)
  const pendingUpdate = await request(app, updatePath, outsider.cookie, {
    organizationId: organization.id,
    name: 'Unauthorized pending update',
  })
  const pendingDelete = await request(app, deletePath, outsider.cookie, {
    organizationId: organization.id,
  })
  expect(pendingGet.status).toBe(404)
  expect(pendingUpdate.status).toBe(404)
  expect(pendingDelete.status).toBe(404)

  const pendingOwnerGet = await request(app, organizationPath, owner.cookie)
  expect(pendingOwnerGet.status).toBe(409)
  expect(await pendingOwnerGet.json()).toMatchObject({
    defined: true,
    code: 'CONFLICT',
    status: 409,
  })
})
