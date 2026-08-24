import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '@cimi/config'
import { createSingleton } from '@cimi/utils'
import {
  createDb,
  closeDb,
  migrateControlDb,
  createAnalyticsDb,
  schema,
  CONTROL_DB_FILENAME,
  ANALYTICS_DB_FILENAME,
} from '@cimi/db'
import { createAuth } from '@cimi/auth/server'
import { createApiApp } from '@cimi/api'

export type FrontendServerApp = ReturnType<typeof createApiApp> & {
  close(): Promise<void>
}

export async function createFrontendServerApp(
  env: Record<string, string | undefined> = process.env,
): Promise<FrontendServerApp> {
  const cfg = loadConfig(env)
  mkdirSync(cfg.dataDir, { recursive: true })
  const db = createDb({ path: join(cfg.dataDir, CONTROL_DB_FILENAME) })
  try {
    migrateControlDb(db)
    const analytics = await createAnalyticsDb({
      path: join(cfg.dataDir, ANALYTICS_DB_FILENAME),
    })

    try {
      const auth = createAuth({
        db,
        schema: {
          user: schema.TUser,
          session: schema.TSession,
          account: schema.TAccount,
          verification: schema.TVerification,
        },
        baseURL: cfg.baseUrl,
        secret: cfg.authSecret,
      })
      const app = createApiApp({ db, auth, analytics, baseUrl: cfg.baseUrl })
      return Object.assign(app, {
        async close(): Promise<void> {
          try {
            await analytics.close()
          } finally {
            closeDb(db)
          }
        },
      })
    } catch (error) {
      try {
        await analytics.close()
      } catch {}
      throw error
    }
  } catch (error) {
    closeDb(db)
    throw error
  }
}

const getApp = createSingleton(() => createFrontendServerApp(process.env))
let shutdownHooksInstalled = false
let shutdownPromise: Promise<void> | undefined

export function getApiApp(): Promise<FrontendServerApp> {
  installShutdownHooks()
  return getApp()
}

function installShutdownHooks(): void {
  if (shutdownHooksInstalled) return
  shutdownHooksInstalled = true

  const handleShutdown = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (shutdownPromise) return

    shutdownPromise = getApp()
      .then((app) => app.close())
      .catch((error: unknown) => {
        console.error(`Failed to close Cimi resources during ${signal}:`, error)
        process.exitCode = 1
      })
      .finally(() => {
        process.removeListener('SIGINT', onSigint)
        process.removeListener('SIGTERM', onSigterm)
        if (process.exitCode === undefined) process.exitCode = signal === 'SIGINT' ? 130 : 143
        process.kill(process.pid, signal)
      })
  }
  const onSigint = () => handleShutdown('SIGINT')
  const onSigterm = () => handleShutdown('SIGTERM')

  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
}
