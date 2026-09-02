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

test('blocks native Better Auth governance mutations but keeps non-mutating auth routes mounted', async () => {
  const { app } = await createFixture()

  for (const path of [
    '/organization/create',
    '/organization/update',
    '/organization/delete',
    '/organization/add-member',
    '/organization/remove-member',
    '/organization/update-member-role',
    '/organization/leave',
  ]) {
    const response = await app.fetch(
      new Request(`http://localhost/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(response.status, path).toBe(404)
  }

  const harmlessResponse = await app.fetch(
    new Request('http://localhost/api/auth/organization/set-active', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  expect(harmlessResponse.status).not.toBe(404)
})

test('unknown api route returns 404', async () => {
  const { app } = await createFixture()

  const res = await app.fetch(new Request('http://localhost/api/does-not-exist'))
  expect(res.status).toBe(404)
})
