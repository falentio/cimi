import { expect, test } from 'vitest'
import { ERROR_CATALOG } from '@cimi/contract'
import { createApiApp } from '../index.ts'
import { createApiTestFixture } from './fixture.ts'

async function pausedApp(fixture: Awaited<ReturnType<typeof createApiTestFixture>>) {
  return createApiApp({
    db: fixture.db,
    auth: fixture.auth,
    analytics: fixture.analytics,
    dataDirectoryReady: true,
    controlDatabasePath: ':memory:',
    dataDirectoryPath: '/tmp/cimi-test-data',
    lifecycle: {
      async getSnapshot() {
        return {
          installationStatus: 'maintenance' as const,
          controlStore: 'ready' as const,
          analyticsStore: 'ready' as const,
          cleanupPending: false,
        }
      },
    },
  })
}

async function degradedApp(fixture: Awaited<ReturnType<typeof createApiTestFixture>>) {
  return createApiApp({
    db: fixture.db,
    auth: fixture.auth,
    analytics: fixture.analytics,
    dataDirectoryReady: true,
    controlDatabasePath: ':memory:',
    dataDirectoryPath: '/tmp/cimi-test-data',
    lifecycle: {
      async getSnapshot() {
        return {
          installationStatus: 'ready' as const,
          controlStore: 'ready' as const,
          analyticsStore: 'degraded' as const,
          cleanupPending: false,
        }
      },
    },
  })
}

test('paused admission rejects a standard route with SERVICE_UNAVAILABLE', async () => {
  await using fixture = await createApiTestFixture()
  const app = await pausedApp(fixture)

  const response = await app.fetch(new Request('http://localhost/api/hello/list'))
  expect(response.status).toBe(503)
  await expect(response.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
    message: ERROR_CATALOG.SERVICE_UNAVAILABLE.message,
  })
  await app.close()
})

test('paused admission keeps health and installation exempt', async () => {
  await using fixture = await createApiTestFixture()
  const app = await pausedApp(fixture)

  const health = await app.fetch(new Request('http://localhost/api/system/health'))
  expect(health.status).toBe(200)
  await expect(health.json()).resolves.toMatchObject({ status: 'maintenance' })

  const installation = await app.fetch(
    new Request('http://localhost/api/installation/getInstallationStatus'),
  )
  expect(installation.status).toBe(401)
  await expect(installation.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' })
  await app.close()
})

test('accept-only admission passes a standard route through', async () => {
  await using fixture = await createApiTestFixture()
  const app = await degradedApp(fixture)

  const response = await app.fetch(new Request('http://localhost/api/hello/list'))
  expect(response.status).toBe(200)
  await app.close()
})
