import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createAuth } from '@cimi/auth/server'
import { loadConfig } from '@cimi/config'
import {
  ANALYTICS_DB_FILENAME,
  closeDb,
  createAnalyticsDb,
  createDb,
  migrateControlDb,
  resolveControlDbPath,
  schema,
} from '@cimi/db'
import type { ApiApp } from './index.ts'
import { createApiApp } from './index.ts'

export type ApiServerApp = ApiApp & {
  close(): Promise<void>
}

export interface CreateApiServerAppOptions {
  env?: Record<string, string | undefined> | undefined
  migrationsFolder?: string | undefined
}

export async function createApiServerApp(
  options: CreateApiServerAppOptions = {},
): Promise<ApiServerApp> {
  const env = options.env ?? process.env
  const cfg = loadConfig(env)
  if (!isDirectory(cfg.dataDir)) throw new Error('Configured data directory is not ready')

  const controlDbPath = resolveControlDbPath(env, process.cwd())
  mkdirSync(dirname(controlDbPath), { recursive: true })
  const db = createDb({ path: controlDbPath })

  try {
    migrateControlDb(db, { migrationsFolder: options.migrationsFolder })
    const analytics = await createAnalyticsDb({
      path: join(cfg.dataDir, ANALYTICS_DB_FILENAME),
    })

    try {
      const auth = createAuth({
        db,
        schema: schema.betterAuthSchema,
        baseURL: cfg.baseUrl,
        secret: cfg.authSecret,
        ...(cfg.isDev ? { trustedOrigins: ['http://localhost:*', 'http://*.localhost:*'] } : {}),
      })
      const app = createApiApp({
        db,
        auth,
        analytics,
        baseUrl: cfg.baseUrl,
        dataDirectoryReady: () => isDirectory(cfg.dataDir),
        controlDatabasePath: controlDbPath,
        dataDirectoryPath: cfg.dataDir,
      })
      const closeApiApp = app.close.bind(app)
      let closePromise: Promise<void> | undefined

      return Object.assign(app, {
        close(): Promise<void> {
          closePromise ??= closeResources()
          return closePromise
        },
      })

      async function closeResources(): Promise<void> {
        try {
          await closeApiApp()
        } finally {
          try {
            await analytics.close()
          } finally {
            closeDb(db)
          }
        }
      }
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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

let apiAppPromise: Promise<ApiServerApp> | undefined

export function getApiApp(): Promise<ApiServerApp> {
  apiAppPromise ??= createApiServerApp()
  return apiAppPromise
}

export function closeApiApp(): Promise<void> {
  if (apiAppPromise === undefined) return Promise.resolve()
  return apiAppPromise.then((app) => app.close())
}
