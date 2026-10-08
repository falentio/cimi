import { afterEach, expect, test } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { createAuth, DEVELOPMENT_TRUSTED_ORIGINS } from '../server.ts'

const databases: Db[] = []

afterEach(() => {
  for (const db of databases) closeDb(db)
  databases.length = 0
})

function createDevAuth() {
  const db = createMigratedTestDb()
  databases.push(db)

  return createAuth({
    db,
    schema: schema.betterAuthSchema,
    secret: 'test-secret-1234567890',
    trustedOrigins: DEVELOPMENT_TRUSTED_ORIGINS,
  })
}

// The test environment sets `skipOriginCheck`, so the HTTP handler path does not
// exercise the matcher. Assert against `isTrustedOrigin`, the function
// `validateOrigin` calls, so the pattern list is actually under test.
test('trusts local and *.falentio development origins', async () => {
  const auth = createDevAuth()
  const ctx = await auth.$context

  const originSettings = { allowRelativePaths: false }
  expect(ctx.isTrustedOrigin('http://localhost:4371', originSettings)).toBe(true)
  expect(ctx.isTrustedOrigin('http://cimi.localhost:4371', originSettings)).toBe(true)
  expect(ctx.isTrustedOrigin('http://cimi.falentio:3001', originSettings)).toBe(true)
  expect(ctx.isTrustedOrigin('http://anything.falentio:5173', originSettings)).toBe(true)
})

test('rejects origins outside the development list', async () => {
  const auth = createDevAuth()
  const ctx = await auth.$context

  const originSettings = { allowRelativePaths: false }
  expect(ctx.isTrustedOrigin('http://evil.example.com', originSettings)).toBe(false)
  expect(ctx.isTrustedOrigin('http://falentio.evil.com', originSettings)).toBe(false)
})

test('the sign-up route accepts a *.falentio origin', async () => {
  const auth = createDevAuth()

  const response = await auth.handler(
    new Request('http://cimi.falentio:3001/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://cimi.falentio:3001',
      },
      body: JSON.stringify({
        name: 'Wildcard Developer',
        email: 'wildcard-developer@example.com',
        password: 'password123',
      }),
    }),
  )

  expect(response.status).toBe(200)
})
