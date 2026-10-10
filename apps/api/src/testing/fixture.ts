import { expect } from 'vitest'
import { closeDb, schema } from '@cimi/db'
import type { AnalyticsDb } from '@cimi/db'
import { createMigratedTestDb, createTestAnalyticsDb } from '@cimi/db/testing'
import { createAuth } from '@cimi/auth/server'
import type { LoggingConfig } from '@cimi/logging'
import type { LifecycleLock } from '@cimi/kernel'
import type { JsonValue } from '@cimi/utils'
import { createApiApp } from '../index.ts'
import type { HealthLifecycle } from '../health.ts'
import { createFakeUpgradeExecutor } from '../resources/installation/fixture.ts'
import type { UpgradeExecutor } from '../resources/installation/service.ts'
import type { IngestionProtection } from '../resources/event-ingestion/index.ts'
import type { BackupRestoreExecutor } from '../resources/backup-restore/index.ts'
import { isFunctionValue } from '@cimi/utils'

/**
 * Wraps a live AnalyticsDb so only the readiness probe is overridden. The store stays usable for
 * fixture setup and for the ingestion path the test exercises, while the readiness probe reports
 * the store unavailable, which is what the admission gate reads.
 */
function withAnalyticsReady(analytics: AnalyticsDb, ready: () => boolean): AnalyticsDb {
  return new Proxy(analytics, {
    get(target, property, receiver) {
      if (property === 'ready') return async () => ready()
      // SAFETY: Proxy trap scopes dynamic keys to the wrapped database's own keys.
      const value: unknown = target[property as keyof AnalyticsDb]

      return isFunctionValue(value) ? value.bind(target) : value
    },
  })
}

export async function createApiTestFixture(
  options: {
    upgradeExecutor?: UpgradeExecutor
    backupRestoreExecutor?: BackupRestoreExecutor
    analyticsReady?: () => boolean
    eventIngestionProtection?: IngestionProtection
    eventIngestionTrustProxyHeaders?: boolean
    logging?: LoggingConfig
    lifecycle?: HealthLifecycle
    lock?: LifecycleLock
    migrationsFolder?: string | undefined
  } = {},
) {
  const db = createMigratedTestDb({ migrationsFolder: options.migrationsFolder })

  try {
    const analytics = await createTestAnalyticsDb()

    try {
      const auth = createAuth({
        db,
        schema: schema.betterAuthSchema,
        secret: 'test-secret-1234567890',
        baseURL: 'http://localhost',
      })

      const app = createApiApp({
        db,
        auth,
        analytics:
          options.analyticsReady === undefined
            ? analytics
            : withAnalyticsReady(analytics, options.analyticsReady),
        baseUrl: 'http://localhost',
        dataDirectoryReady: true,
        controlDatabasePath: ':memory:',
        dataDirectoryPath: '/tmp/cimi-test-data',
        ...(options.migrationsFolder !== undefined && {
          migrationsFolder: options.migrationsFolder,
        }),
        ...(options.logging !== undefined && { logging: options.logging }),
        upgradeExecutor: options.upgradeExecutor ?? createFakeUpgradeExecutor(),
        eventIngestionTrustProxyHeaders: options.eventIngestionTrustProxyHeaders,
        startRetentionCleanupWorker: false,
        ...(options.lifecycle !== undefined && { lifecycle: options.lifecycle }),
        ...(options.lock !== undefined && { lock: options.lock }),
        ...(options.eventIngestionProtection !== undefined && {
          eventIngestionProtection: options.eventIngestionProtection,
        }),
        ...(options.backupRestoreExecutor !== undefined && {
          backupRestoreExecutor: options.backupRestoreExecutor,
        }),
      })

      return {
        app,
        auth,
        db,
        analytics,
        async [Symbol.asyncDispose]() {
          try {
            await app.close()
          } finally {
            try {
              await analytics.close()
            } finally {
              closeDb(db)
            }
          }
        },
      }
    } catch (error) {
      await analytics.close()
      throw error
    }
  } catch (error) {
    closeDb(db)
    throw error
  }
}

export async function signUpTestUser(
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

export async function apiTestRequest(
  app: ReturnType<typeof createApiApp>,
  path: string,
  cookie: string,
  body?: JsonValue,
): Promise<Response> {
  const headers = body === undefined ? { cookie } : { 'content-type': 'application/json', cookie }

  return app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }),
  )
}
