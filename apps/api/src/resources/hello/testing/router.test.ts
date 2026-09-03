import { expect, test } from 'vitest'
import { createAuth } from '@cimi/auth/server'
import { schema as contractSchema } from '@cimi/contract'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb, createTestAnalyticsDb } from '@cimi/db/testing'
import { createApiApp } from '../../../index.ts'

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
        async [Symbol.asyncDispose]() {
          try {
            await analytics.close()
          } finally {
            closeDb(db)
          }
        },
      }
    } catch (error) {
      try {
        await analytics.close()
      } finally {
        closeDb(db)
      }
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
): Promise<string> {
  const response = await app.fetch(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, password: 'password123' }),
    }),
  )
  expect(response.status).toBe(200)
  const setCookie = response.headers.get('set-cookie')
  expect(setCookie).toBeTruthy()
  return setCookie!.split(';', 1)[0]!
}

test('hello world is public and computes a greeting', async () => {
  await using fixture = await createFixture()
  const { app } = fixture

  const response = await app.fetch(new Request('http://localhost/api/hello/world?name=Ada'))

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({ message: 'Hello, Ada!' })
})

test('an authenticated owner can create, list, get, and remove a greeting', async () => {
  await using fixture = await createFixture()
  const { app } = fixture
  const cookie = await signUp(app, 'ada@example.com', 'Ada')

  const createResponse = await app.fetch(
    new Request('http://localhost/api/hello/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Ada', message: 'Hello, Ada!' }),
    }),
  )
  expect(createResponse.status).toBe(201)
  const created = await createResponse.json()
  expect(created).toEqual(expect.schemaMatching(contractSchema.SHelloCreateOutput))
  expect(created).toMatchObject({ name: 'Ada', message: 'Hello, Ada!' })

  const listResponse = await app.fetch(new Request('http://localhost/api/hello/list'))
  expect(listResponse.status).toBe(200)
  const listed = await listResponse.json()
  expect(listed).toEqual(expect.schemaMatching(contractSchema.SHelloListOutput))
  expect(listed).toMatchObject({
    items: [created],
    totalCount: 1,
    hasMore: false,
    nextOffset: null,
  })

  const getResponse = await app.fetch(
    new Request(`http://localhost/api/hello/get?id=${encodeURIComponent(created.id)}`),
  )
  expect(getResponse.status).toBe(200)
  const fetched = await getResponse.json()
  expect(fetched).toEqual(expect.schemaMatching(contractSchema.SHelloGetOutput))
  expect(fetched).toEqual(created)

  const removeResponse = await app.fetch(
    new Request('http://localhost/api/hello/remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ id: created.id }),
    }),
  )
  expect(removeResponse.status).toBe(200)
  await expect(removeResponse.json()).resolves.toEqual({ id: created.id })

  const missingResponse = await app.fetch(
    new Request(`http://localhost/api/hello/get?id=${encodeURIComponent(created.id)}`),
  )
  expect(missingResponse.status).toBe(404)
})

test('hello commands require authentication and removal is owner-scoped', async () => {
  await using fixture = await createFixture()
  const { app } = fixture
  const ownerCookie = await signUp(app, 'ada@example.com', 'Ada')
  const otherCookie = await signUp(app, 'grace@example.com', 'Grace')

  const unauthenticated = await app.fetch(
    new Request('http://localhost/api/hello/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', message: 'Hello, Ada!' }),
    }),
  )
  expect(unauthenticated.status).toBe(401)

  const createResponse = await app.fetch(
    new Request('http://localhost/api/hello/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: ownerCookie },
      body: JSON.stringify({ name: 'Ada', message: 'Hello, Ada!' }),
    }),
  )
  const created = await createResponse.json()

  const forbidden = await app.fetch(
    new Request('http://localhost/api/hello/remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: otherCookie },
      body: JSON.stringify({ id: created.id }),
    }),
  )
  expect(forbidden.status).toBe(404)
})
