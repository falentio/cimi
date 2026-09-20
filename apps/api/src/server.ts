import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createAuth } from '@cimi/auth/server'
import { loadConfig } from '@cimi/config'
import { reportLogEvent, type LoggingConfig } from '@cimi/logging'
import { configureNodeLogging } from '@cimi/logging/node'
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
import { createApiServerShutdown } from './lifecycle/api-server-shutdown.ts'

export type ApiServerApp = ApiApp & {
  close(): Promise<void>
}

export interface CreateApiServerAppOptions {
  env?: Record<string, string | undefined> | undefined
  migrationsFolder?: string | undefined
  logging?: LoggingConfig | undefined
}

export async function createApiServerApp(
  options: CreateApiServerAppOptions = {},
): Promise<ApiServerApp> {
  const env = options.env ?? process.env
  let cfg!: ReturnType<typeof loadConfig>
  let controlDbPath!: string
  let db!: ReturnType<typeof createDb>
  try {
    cfg = loadConfig(env)
    configureNodeLogging(options.logging ?? cfg.logging)
    if (!isDirectory(cfg.dataDir)) {
      throw new Error('Configured data directory is not ready')
    }

    controlDbPath = resolveControlDbPath(env, process.cwd())
    mkdirSync(dirname(controlDbPath), { recursive: true })
    db = createDb({ path: controlDbPath })
  } catch (error) {
    reportLogEvent({ kind: 'operation.failure', operation: 'api.startup', stage: 'startup', error })
    if (db !== undefined) closeDb(db)
    throw error
  }

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
        logging: options.logging ?? cfg.logging,
        baseUrl: cfg.baseUrl,
        dataDirectoryReady: () => isDirectory(cfg.dataDir),
        controlDatabasePath: controlDbPath,
        dataDirectoryPath: cfg.dataDir,
      })
      const closeApiApp = app.close.bind(app)
      const shutdown = createApiServerShutdown({
        closeComposition: closeApiApp,
        closeAnalytics: () => analytics.close(),
        closeControlDb: () => closeDb(db),
      })
      let closePromise: Promise<void> | undefined

      return Object.assign(app, {
        close(): Promise<void> {
          if (closePromise !== undefined) return closePromise
          closePromise = closeResources().catch((error: unknown) => {
            closePromise = undefined
            throw error
          })
          return closePromise
        },
      })

      async function closeResources(): Promise<void> {
        await shutdown.close()
      }
    } catch (error) {
      try {
        await analytics.close()
      } catch (cleanupError) {
        reportLogEvent({
          kind: 'operation.failure',
          operation: 'api.startup',
          stage: 'cleanup',
          error: cleanupError,
        })
      }
      throw error
    }
  } catch (error) {
    reportLogEvent({ kind: 'operation.failure', operation: 'api.startup', stage: 'startup', error })
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
