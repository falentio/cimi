import { afterEach, expect, test, vi } from 'vitest'
import { ERROR_CATALOG, SSystemHealthOutput } from '@cimi/contract'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb, createTestAnalyticsDb } from '@cimi/db/testing'
import { createAuth } from '@cimi/auth/server'
import { createApiApp } from '../index.ts'

const fixtures: Array<{
  db: Db
  analytics: Awaited<ReturnType<typeof createTestAnalyticsDb>>
}> = []

afterEach(async () => {
  try {
    await Promise.all(
      fixtures.map(async ({ db, analytics }) => {
        try {
          await analytics.close()
        } finally {
          closeDb(db)
        }
      }),
    )
  } finally {
    fixtures.length = 0
  }
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
      return { app, auth, db, analytics }
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, password: 'password123' }),
    }),
  )
  expect(response.status).toBe(200)
  const body = await response.json()
  const setCookie = response.headers.get('set-cookie')
  expect(setCookie).toBeTruthy()
  return { cookie: setCookie!.split(';', 1)[0]!, userId: body.user.id }
}

test('system health reports live control and analytics stores', async () => {
  const { app, auth, db, analytics } = await createFixture()

  const res = await app.fetch(new Request('http://localhost/api/system/health'))
  expect(res.status).toBe(200)

  const body = await res.json()
  expect(body).toEqual(expect.schemaMatching(SSystemHealthOutput))
  expect(body.status).toBe('healthy')
  expect(body.controlStore).toBe('ready')
  expect(body.analyticsStore).toBe('ready')
  expect(body.cleanupPending).toBe(false)
  expect(body.version).toBe('0.0.1')
  expect(body.checkedAt).toMatch(/T/)

  const lifecycleApp = createApiApp({
    db,
    auth,
    analytics,
    lifecycle: {
      async getSnapshot() {
        return {
          status: 'maintenance' as const,
          controlStore: 'ready' as const,
          analyticsStore: 'ready' as const,
          cleanupPending: true,
        }
      },
    },
  })
  const lifecycleResponse = await lifecycleApp.fetch(
    new Request('http://localhost/api/system/health'),
  )
  expect(lifecycleResponse.status).toBe(200)
  await expect(lifecycleResponse.json()).resolves.toMatchObject({
    status: 'maintenance',
    cleanupPending: true,
  })
})

test('rejects an unauthenticated authenticated hello procedure before input handling', async () => {
  const { app } = await createFixture()

  const response = await app.fetch(
    new Request('http://localhost/api/hello/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
  )

  expect(response.status).toBe(401)
  await expect(response.json()).resolves.toMatchObject({
    code: 'UNAUTHORIZED',
    status: 401,
    message: ERROR_CATALOG.UNAUTHORIZED.message,
  })
})

test('normalizes provider errors before the public response', async () => {
  const { app, db } = await createFixture()
  vi.spyOn(db, 'select').mockImplementation(() => {
    throw new Error('provider connection secret')
  })

  const response = await app.fetch(new Request('http://localhost/api/hello/get?id=hello-1'))

  expect(response.status).toBe(500)
  const body = await response.json()
  expect(body).toEqual({
    defined: false,
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
    message: ERROR_CATALOG.INTERNAL_SERVER_ERROR.message,
  })
  expect(JSON.stringify(body)).not.toContain('provider connection secret')
})

test('auth sign-up route is mounted and sets a session cookie', async () => {
  const { app } = await createFixture()

  const signup = await app.fetch(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'A',
        email: 'a@example.com',
        password: 'password123',
      }),
    }),
  )

  expect(signup.status).toBe(200)
  expect(signup.headers.get('set-cookie')).toBeTruthy()
})

test('blocks every native Better Auth governance mutation without changing authority state', async () => {
  const { app, auth, db } = await createFixture()
  const owner = await signUp(app, 'native-owner@example.com', 'Native Owner')
  const member = await signUp(app, 'native-member@example.com', 'Native Member')
  const invitee = await signUp(app, 'native-invitee@example.com', 'Native Invitee')

  const createdAuthorityOrganization = await auth.api.createOrganization({
    body: { name: 'Native Governance', slug: 'native-governance', userId: owner.userId },
  })
  const authorityOrganizationId = createdAuthorityOrganization.id
  const addedMember = await auth.api.addMember({
    headers: new Headers({ cookie: owner.cookie }),
    body: {
      organizationId: authorityOrganizationId,
      userId: member.userId,
      role: 'member',
    },
  })
  const invitation = await auth.api.createInvitation({
    headers: new Headers({ cookie: owner.cookie }),
    body: {
      organizationId: authorityOrganizationId,
      email: 'native-invitee@example.com',
      role: 'member',
    },
  })
  const before = await readNativeGovernanceState(db)

  const nativeMutations = [
    {
      path: '/organization/create',
      cookie: owner.cookie,
      body: { name: 'Blocked Organization', slug: 'blocked-organization' },
    },
    {
      path: '/organization/update',
      cookie: owner.cookie,
      body: { organizationId: authorityOrganizationId, data: { name: 'Blocked Rename' } },
    },
    {
      path: '/organization/delete',
      cookie: owner.cookie,
      body: { organizationId: authorityOrganizationId },
    },
    {
      path: '/organization/invite-member',
      cookie: owner.cookie,
      body: {
        organizationId: authorityOrganizationId,
        email: 'blocked@example.com',
        role: 'member',
      },
    },
    {
      path: '/organization/add-member',
      cookie: owner.cookie,
      body: { organizationId: authorityOrganizationId, userId: invitee.userId, role: 'member' },
    },
    {
      path: '/organization/remove-member',
      cookie: owner.cookie,
      body: { organizationId: authorityOrganizationId, memberIdOrEmail: addedMember.id },
    },
    {
      path: '/organization/update-member-role',
      cookie: owner.cookie,
      body: { organizationId: authorityOrganizationId, memberId: addedMember.id, role: 'admin' },
    },
    {
      path: '/organization/leave',
      cookie: member.cookie,
      body: { organizationId: authorityOrganizationId },
    },
    {
      path: '/organization/accept-invitation',
      cookie: invitee.cookie,
      body: { invitationId: invitation.id },
    },
    {
      path: '/organization/reject-invitation',
      cookie: invitee.cookie,
      body: { invitationId: invitation.id },
    },
    {
      path: '/organization/cancel-invitation',
      cookie: owner.cookie,
      body: { invitationId: invitation.id },
    },
  ]

  for (const mutation of nativeMutations) {
    const response = await app.fetch(
      new Request(`http://localhost/api/auth${mutation.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: mutation.cookie },
        body: JSON.stringify(mutation.body),
      }),
    )
    expect(response.status, mutation.path).toBe(404)
  }

  await expect(readNativeGovernanceState(db)).resolves.toEqual(before)

  const harmlessResponse = await app.fetch(
    new Request('http://localhost/api/auth/organization/set-active', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  expect(harmlessResponse.status).not.toBe(404)
})

async function readNativeGovernanceState(db: Db) {
  const [organizations, members, invitations] = await Promise.all([
    db.select().from(schema.TAuthOrganization),
    db.select().from(schema.TAuthMember),
    db.select().from(schema.TAuthInvitation),
  ])
  return { organizations, members, invitations }
}

test('unknown api route returns 404', async () => {
  const { app } = await createFixture()

  const res = await app.fetch(new Request('http://localhost/api/does-not-exist'))
  expect(res.status).toBe(404)
})
