import * as v from 'valibot'
import { expect, test, vi } from 'vitest'
import { ERROR_CATALOG, SSystemHealthOutput, schema as contractSchema } from '@cimi/contract'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { createApiApp } from '../index.ts'
import { createApiTestFixture, signUpTestUser } from './fixture.ts'

test('system health reports live control and analytics stores', async () => {
  await using fixture = await createApiTestFixture()
  const { app, auth, db, analytics } = fixture

  const res = await app.fetch(new Request('http://localhost/api/system/health'))
  expect(res.status).toBe(200)

  const body = await res.json()
  expect(body).toEqual(expect.schemaMatching(SSystemHealthOutput))
  expect(body.status).toBe('recovering')
  expect(body.controlStore).toBe('ready')
  expect(body.analyticsStore).toBe('ready')
  expect(body.cleanupPending).toBe(false)
  expect(body.version).toBe('0.0.1')
  expect(() =>
    v.parse(contractSchema.SDateTime, (body as { checkedAt: string }).checkedAt),
  ).not.toThrow()

  const owner = await signUpTestUser(app, 'health-owner@example.com', 'Health Owner')
  const created = await app.fetch(
    new Request('http://localhost/api/installation/initializeInstallation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({}),
    }),
  )
  expect(created.status).toBe(201)

  const afterInit = await app.fetch(new Request('http://localhost/api/system/health'))
  expect(afterInit.status).toBe(200)
  await expect(afterInit.json()).resolves.toMatchObject({ status: 'healthy' })

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

test('system health maps installation and legacy states', async () => {
  await using fixture = await createApiTestFixture()
  const { auth, db, analytics } = fixture

  async function healthWith(snapshot: object) {
    const app = createApiApp({
      db,
      auth,
      analytics,
      lifecycle: {
        async getSnapshot() {
          return snapshot
        },
      },
    })
    const response = await app.fetch(new Request('http://localhost/api/system/health'))
    expect(response.status).toBe(200)
    return (await response.json()) as { status: string }
  }

  await expect(
    healthWith({
      installationStatus: 'degraded',
      controlStore: 'ready',
      analyticsStore: 'ready',
      cleanupPending: true,
    }),
  ).resolves.toMatchObject({ status: 'degraded' })
  await expect(
    healthWith({
      installationStatus: 'degraded',
      controlStore: 'ready',
      analyticsStore: 'ready',
      cleanupPending: false,
    }),
  ).resolves.toMatchObject({ status: 'healthy' })
  await expect(
    healthWith({
      installationStatus: 'maintenance',
      controlStore: 'ready',
      analyticsStore: 'ready',
      cleanupPending: false,
    }),
  ).resolves.toMatchObject({ status: 'maintenance' })
  await expect(
    healthWith({
      installationStatus: 'recovering',
      controlStore: 'ready',
      analyticsStore: 'ready',
      cleanupPending: false,
    }),
  ).resolves.toMatchObject({ status: 'recovering' })
  await expect(
    healthWith({
      installationStatus: 'uninitialized',
      controlStore: 'ready',
      analyticsStore: 'ready',
      cleanupPending: false,
    }),
  ).resolves.toMatchObject({ status: 'recovering' })
  await expect(
    healthWith({
      status: 'unavailable',
      controlStore: 'ready',
      analyticsStore: 'ready',
      cleanupPending: false,
    }),
  ).resolves.toMatchObject({ status: 'recovering' })
  await expect(
    healthWith({
      installationStatus: 'maintenance',
      status: 'healthy',
      controlStore: 'ready',
      analyticsStore: 'ready',
      cleanupPending: false,
    }),
  ).resolves.toMatchObject({ status: 'maintenance' })
  await expect(
    healthWith({
      installationStatus: 'ready',
      status: 'maintenance',
      controlStore: 'ready',
      analyticsStore: 'ready',
      cleanupPending: false,
    }),
  ).resolves.toMatchObject({ status: 'healthy' })

  const throwingApp = createApiApp({
    db,
    auth,
    analytics,
    lifecycle: {
      async getSnapshot() {
        throw new Error('lifecycle down')
      },
    },
  })
  const throwingResponse = await throwingApp.fetch(
    new Request('http://localhost/api/system/health'),
  )
  expect(throwingResponse.status).toBe(200)
  await expect(throwingResponse.json()).resolves.toMatchObject({ status: 'recovering' })
})

test('system health covers legacy installation states', async () => {
  await using fixture = await createApiTestFixture()
  const { auth, db, analytics } = fixture

  async function healthWith(snapshot: object) {
    const app = createApiApp({
      db,
      auth,
      analytics,
      lifecycle: {
        async getSnapshot() {
          return snapshot
        },
      },
    })
    const response = await app.fetch(new Request('http://localhost/api/system/health'))
    expect(response.status).toBe(200)
    return (await response.json()) as { status: string }
  }

  const cases: Array<{ snapshot: object; status: string }> = [
    {
      snapshot: {
        status: 'healthy',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
      },
      status: 'healthy',
    },
    {
      snapshot: {
        status: 'degraded',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
      },
      status: 'healthy',
    },
    {
      snapshot: {
        status: 'maintenance',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
      },
      status: 'maintenance',
    },
    {
      snapshot: {
        status: 'recovering',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
      },
      status: 'recovering',
    },
    {
      snapshot: {
        status: 'ready',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
      },
      status: 'healthy',
    },
    {
      snapshot: {
        status: 'uninitialized',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
      },
      status: 'recovering',
    },
    {
      snapshot: {
        status: 'nope',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
      },
      status: 'recovering',
    },
  ]
  for (const { snapshot, status } of cases) {
    await expect(healthWith(snapshot)).resolves.toMatchObject({ status })
  }
})

test('system health degrades on store failures', async () => {
  await using fixture = await createApiTestFixture()
  const { auth, db, analytics } = fixture
  const bootApp = appFrom(db, auth, analytics)
  const owner = await signUpTestUser(bootApp, 'store-owner@example.com', 'Store Owner')

  const initRes = await bootApp.fetch(
    new Request('http://localhost/api/installation/initializeInstallation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({}),
    }),
  )
  expect([200, 201]).toContain(initRes.status)

  async function healthWithStores(stores: { controlOk: boolean; analyticsOk: boolean | 'throw' }) {
    const analyticsForTest =
      stores.analyticsOk === 'throw'
        ? {
            ready: async () => {
              throw new Error('analytics down')
            },
          }
        : stores.analyticsOk
          ? analytics
          : { ready: async () => false, close: async () => undefined }
    let dbForTest = db
    if (!stores.controlOk) {
      dbForTest = createMigratedTestDb()
      closeDb(dbForTest)
    }
    const app = createApiApp({
      db: dbForTest,
      auth,
      analytics: analyticsForTest as typeof analytics,
    })
    const response = await app.fetch(new Request('http://localhost/api/system/health'))
    expect(response.status).toBe(200)
    return (await response.json()) as { status: string; controlStore: string }
  }

  await expect(healthWithStores({ controlOk: true, analyticsOk: false })).resolves.toMatchObject({
    status: 'degraded',
  })
  await expect(healthWithStores({ controlOk: true, analyticsOk: 'throw' })).resolves.toMatchObject({
    status: 'degraded',
  })
  await expect(healthWithStores({ controlOk: false, analyticsOk: true })).resolves.toMatchObject({
    status: 'unavailable',
  })
})

function appFrom(
  db: Parameters<typeof createApiApp>[0]['db'],
  auth: Parameters<typeof createApiApp>[0]['auth'],
  analytics: Parameters<typeof createApiApp>[0]['analytics'],
) {
  return createApiApp({ db, auth, analytics })
}

test('rejects an unauthenticated authenticated hello procedure before input handling', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture

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

test('returns a safe internal error when session lookup fails', async () => {
  await using fixture = await createApiTestFixture()
  const { app, auth } = fixture
  const providerError = new Error('provider connection secret')
  vi.spyOn(auth.api, 'getSession').mockRejectedValueOnce(providerError)

  const response = await app.fetch(
    new Request('http://localhost/api/hello/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', message: 'Hello, Ada!' }),
    }),
  )

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

test('normalizes provider errors before the public response', async () => {
  await using fixture = await createApiTestFixture()
  const { app, db } = fixture
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
  await using fixture = await createApiTestFixture()
  const { app } = fixture

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
  await using fixture = await createApiTestFixture()
  const { app, auth, db } = fixture
  const owner = await signUpTestUser(app, 'native-owner@example.com', 'Native Owner')
  const member = await signUpTestUser(app, 'native-member@example.com', 'Native Member')
  const invitee = await signUpTestUser(app, 'native-invitee@example.com', 'Native Invitee')

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
  await using fixture = await createApiTestFixture()
  const { app } = fixture

  const res = await app.fetch(new Request('http://localhost/api/does-not-exist'))
  expect(res.status).toBe(404)
})
