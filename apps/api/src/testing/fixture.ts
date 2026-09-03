import { expect } from 'vitest'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb, createTestAnalyticsDb } from '@cimi/db/testing'
import { createAuth } from '@cimi/auth/server'
import { createApiApp } from '../index.ts'

export async function createApiTestFixture() {
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
      return {
        app,
        auth,
        db,
        analytics,
        async [Symbol.asyncDispose]() {
          try {
            await analytics.close()
          } finally {
            closeDb(db)
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
  const body = (await response.json()) as { user: { id: string } }
  const setCookie = response.headers.get('set-cookie')
  expect(setCookie).toBeTruthy()
  return { cookie: setCookie!.split(';', 1)[0]!, userId: body.user.id }
}

export async function apiTestRequest(
  app: ReturnType<typeof createApiApp>,
  path: string,
  cookie: string,
  body?: object,
): Promise<Response> {
  const headers = body === undefined ? { cookie } : { 'content-type': 'application/json', cookie }
  return app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}
