import { expect, test } from 'vitest'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb, createTestAnalyticsDb } from '@cimi/db/testing'
import { createAuth } from '@cimi/auth/server'
import { createApiApp } from '../index.ts'

const jsonHeaders = { 'content-type': 'application/json' }

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

async function signUp(
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

async function request(
  app: ReturnType<typeof createApiApp>,
  path: string,
  cookie: string,
  body?: object,
): Promise<Response> {
  const headers = body === undefined ? { cookie } : { ...jsonHeaders, cookie }
  return app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}

test('deletes and recovers a site through 202 lifecycle routes', async () => {
  await using fixture = await createFixture()
  const { app } = fixture
  const owner = await signUp(app, 'site-lifecycle-owner@example.com', 'Site Owner')

  const organizationResponse = await request(
    app,
    '/organization/createOrganization',
    owner.cookie,
    {
      name: 'Lifecycle Org',
    },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = await organizationResponse.json()

  const siteResponse = await request(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'lifecycle.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()

  const deleteResponse = await request(app, '/site/deleteSite', owner.cookie, {
    siteId: site.id,
  })
  expect(deleteResponse.status, await deleteResponse.clone().text()).toBe(202)
  const deletion = await deleteResponse.json()
  expect(deletion).toMatchObject({ accepted: true, status: 'deleting' })
  expect(typeof deletion.operationId).toBe('string')

  const recoverResponse = await request(app, '/site/recoverSite', owner.cookie, {
    siteId: site.id,
  })
  expect(recoverResponse.status, await recoverResponse.clone().text()).toBe(202)
  const recovery = await recoverResponse.json()
  expect(recovery).toMatchObject({ accepted: true, status: 'recovering' })
  expect(typeof recovery.operationId).toBe('string')

  const getResponse = await request(
    app,
    `/site/getSite?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )
  expect(getResponse.status).toBe(404)
  await expect(getResponse.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })
})
