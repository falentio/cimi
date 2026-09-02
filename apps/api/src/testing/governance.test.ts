import { afterEach, expect, test, vi } from 'vitest'
import { createAuth } from '@cimi/auth/server'
import {
  SMembershipListOutput,
  SOrganizationCreateOutput,
  SOrganizationEnsurePersonalOutput,
} from '@cimi/contract'
import { eq } from 'drizzle-orm'
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
