import { afterEach, expect, test } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { createAuth } from '../server.ts'

const databases: Db[] = []

afterEach(() => {
  for (const db of databases) closeDb(db)
  databases.length = 0
})

test('accepts local frontend origins on arbitrary development ports', async () => {
  const db = createMigratedTestDb()
  databases.push(db)

  const auth = createAuth({
    db,
    schema: schema.betterAuthSchema,
    secret: 'test-secret-1234567890',
    trustedOrigins: ['http://localhost:*', 'http://*.localhost:*'],
  })

  const response = await auth.handler(
    new Request('http://localhost:4371/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://cimi.localhost:4371',
      },
      body: JSON.stringify({
        name: 'Local Developer',
        email: 'local-developer@example.com',
        password: 'password123',
      }),
    }),
  )

  expect(response.status).toBe(200)
})
