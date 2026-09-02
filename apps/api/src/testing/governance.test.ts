import { afterEach, expect, test } from 'vitest'
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
