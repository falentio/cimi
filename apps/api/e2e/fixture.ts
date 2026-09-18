import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuth, type Auth, type AuthUser } from '@cimi/auth/server'
import {
  closeDb,
  createAnalyticsDb,
  createDb,
  migrateControlDb,
  schema,
  type AnalyticsDb,
  type Db,
} from '@cimi/db'
import { createApiComposition, type ApiRouter } from '../src/composition.ts'
import { createApiHttpApp, type ApiApp } from '../src/http-app.ts'
import type { ApiContext } from '../src/orpc.ts'
import { signUpTestUser } from '../src/testing/fixture.ts'

export type DatabaseManagementRouter = Pick<
  ApiRouter,
  | 'installation'
  | 'backupRestore'
  | 'retentionPolicy'
  | 'collectionPolicy'
  | 'organization'
  | 'site'
>

export interface E2eUser {
  cookie: string
  userId: string
  context: ApiContext
}

export interface ApiE2eFixture {
  app: ApiApp
  auth: Auth
  db: Db
  analytics: AnalyticsDb
  router: DatabaseManagementRouter
  rootDirectory: string
  createUser(email: string, name: string): Promise<E2eUser>
  waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T>
  [Symbol.asyncDispose](): Promise<void>
}

export async function createApiE2eFixture(): Promise<ApiE2eFixture> {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'cimi-api-e2e-'))
  const dataDirectoryPath = join(rootDirectory, 'data')
  const controlDatabasePath = join(rootDirectory, 'control.sqlite')
  const analyticsPath = join(dataDirectoryPath, 'analytics.duckdb')
  await mkdir(dataDirectoryPath)

  let db: Db | undefined
  let analytics: AnalyticsDb | undefined
  let composition: ReturnType<typeof createApiComposition> | undefined
  try {
    db = createDb({ path: controlDatabasePath })
    migrateControlDb(db)
    analytics = await createAnalyticsDb({
      path: analyticsPath,
      tempDirectory: join(dataDirectoryPath, 'analytics-temp'),
    })
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
      baseURL: 'http://localhost',
    })
    const deps = {
      db,
      auth,
      analytics,
      baseUrl: 'http://localhost',
      dataDirectoryReady: () => existsSync(dataDirectoryPath),
      controlDatabasePath,
      dataDirectoryPath,
      startRetentionCleanupWorker: false,
    }
    composition = createApiComposition(deps)
    const app = createApiHttpApp(deps, composition)
    await composition.ready

    let closePromise: Promise<void> | undefined
    const close = (): Promise<void> => {
      closePromise ??= closeResources()
      return closePromise
    }

    return {
      app,
      auth,
      db,
      analytics,
      router: composition.router,
      rootDirectory,
      async createUser(email, name) {
        const signedUp = await signUpTestUser(app, email, name)
        const headers = new Headers({ cookie: signedUp.cookie })
        const session = await auth.api.getSession({ headers })
        if (session?.user === undefined) throw new Error('Expected the created user session')
        const sessionUser: AuthUser = session.user
        const user: AuthUser = {
          ...sessionUser,
          installationGrant: sessionUser.installationGrant ?? sessionUser.role === 'admin',
        }
        return { ...signedUp, context: { user, headers } }
      },
      waitFor,
      [Symbol.asyncDispose]: close,
    }

    async function closeResources(): Promise<void> {
      try {
        await composition?.close()
      } finally {
        try {
          await analytics?.close()
        } finally {
          try {
            if (db !== undefined) closeDb(db)
          } finally {
            await rm(rootDirectory, { recursive: true, force: true })
          }
        }
      }
    }
  } catch (error) {
    try {
      await composition?.close()
    } finally {
      try {
        await analytics?.close()
      } finally {
        try {
          if (db !== undefined) closeDb(db)
        } finally {
          await rm(rootDirectory, { recursive: true, force: true })
        }
      }
    }
    throw error
  }
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 30_000
  let value = await read()
  while (!done(value)) {
    if (Date.now() >= deadline) throw new Error('Timed out while waiting for an E2E operation')
    await new Promise((resolve) => setTimeout(resolve, 50))
    value = await read()
  }
  return value
}
