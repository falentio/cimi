import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createSingleton } from '@cimi/utils'
import { loadConfig } from '@cimi/utils'
import {
  createDb,
  migrateControlDb,
  createAnalyticsDb,
  schema,
  CONTROL_DB_FILENAME,
  ANALYTICS_DB_FILENAME,
} from '@cimi/db'
import { createAuth } from '@cimi/auth/server'
import { createApiApp } from '@cimi/api'

export async function createFrontendServerApp(
  env: Record<string, string | undefined> = process.env,
): Promise<ReturnType<typeof createApiApp>> {
  const cfg = loadConfig(env)
  mkdirSync(cfg.dataDir, { recursive: true })
  const db = createDb({ path: join(cfg.dataDir, CONTROL_DB_FILENAME) })
  migrateControlDb(db)
  const analytics = await createAnalyticsDb({
    path: join(cfg.dataDir, ANALYTICS_DB_FILENAME),
  })
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
  return createApiApp({ db, auth, analytics, baseUrl: cfg.baseUrl })
}

const getApp = createSingleton(() => createFrontendServerApp(process.env))

export function getApiApp(): Promise<ReturnType<typeof createApiApp>> {
  return getApp()
}
