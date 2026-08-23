import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { closeDb, createAnalyticsDb, createDb, migrateControlDb, schema } from '@cimi/db'
import { createAuth } from '@cimi/auth/server'
import { createApiApp } from '../index.ts'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true })
    }),
  )
  tempDirs.length = 0
})

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cimi-api-'))
  tempDirs.push(dir)
  return dir
}

test('system health reports live control and analytics stores', async () => {
  const dir = await makeTempDir()
  const db = createDb({ path: join(dir, 'control.sqlite') })
  migrateControlDb(db)
  const analytics = await createAnalyticsDb({ path: join(dir, 'analytics.duckdb') })
  const auth = createAuth({
    db,
    schema: {
      user: schema.TUser,
      session: schema.TSession,
      account: schema.TAccount,
      verification: schema.TVerification,
    },
    secret: 'test-secret-1234567890',
    baseURL: 'http://localhost',
  })

  const app = createApiApp({ db, auth, analytics, baseUrl: 'http://localhost' })

  const res = await app.fetch(new Request('http://localhost/api/system/health'))
  expect(res.status).toBe(200)

  const body = (await res.json()) as {
    status: string
    controlStore: string
    analyticsStore: string
    cleanupPending: boolean
    version: string
    checkedAt: string
  }
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

  await analytics.close()
  closeDb(db)
})

test('auth sign-up route is mounted and sets a session cookie', async () => {
  const dir = await makeTempDir()
  const db = createDb({ path: join(dir, 'control.sqlite') })
  migrateControlDb(db)
  const analytics = await createAnalyticsDb({ path: join(dir, 'analytics.duckdb') })
  const auth = createAuth({
    db,
    schema: {
      user: schema.TUser,
      session: schema.TSession,
      account: schema.TAccount,
      verification: schema.TVerification,
    },
    secret: 'test-secret-1234567890',
    baseURL: 'http://localhost',
  })

  const app = createApiApp({ db, auth, analytics, baseUrl: 'http://localhost' })

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

  await analytics.close()
  closeDb(db)
})

test('unknown api route returns 404', async () => {
  const dir = await makeTempDir()
  const db = createDb({ path: join(dir, 'control.sqlite') })
  migrateControlDb(db)
  const analytics = await createAnalyticsDb({ path: join(dir, 'analytics.duckdb') })
  const auth = createAuth({
    db,
    schema: {
      user: schema.TUser,
      session: schema.TSession,
      account: schema.TAccount,
      verification: schema.TVerification,
    },
    secret: 'test-secret-1234567890',
    baseURL: 'http://localhost',
  })

  const app = createApiApp({ db, auth, analytics, baseUrl: 'http://localhost' })

  const res = await app.fetch(new Request('http://localhost/api/does-not-exist'))
  expect(res.status).toBe(404)

  await analytics.close()
  closeDb(db)
})
