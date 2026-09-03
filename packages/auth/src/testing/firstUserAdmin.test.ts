import { eq } from 'drizzle-orm'
import { afterEach, expect, test } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { createAuth } from '../server.ts'

const databases: Db[] = []

afterEach(() => {
  for (const db of databases) closeDb(db)
  databases.length = 0
})

test('first signed-up user becomes admin, later users keep non-admin role', async () => {
  const db = createMigratedTestDb()
  databases.push(db)

  const auth = createAuth({
    db,
    schema: schema.betterAuthSchema,
    secret: 'test-secret-1234567890',
  })

  const firstRes = await auth.handler(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Admin',
        email: 'admin@example.com',
        password: 'password123',
      }),
    }),
  )

  expect(firstRes.status).toBe(200)
  expect(firstRes.headers.get('set-cookie')).toBeTruthy()

  const firstRows = await db
    .select()
    .from(schema.TUser)
    .where(eq(schema.TUser.email, 'admin@example.com'))
  const first = firstRows[0]
  expect(first?.role).toBe('admin')

  const secondRes = await auth.handler(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Member',
        email: 'member@example.com',
        password: 'password123',
      }),
    }),
  )

  expect(secondRes.status).toBe(200)

  const secondRows = await db
    .select()
    .from(schema.TUser)
    .where(eq(schema.TUser.email, 'member@example.com'))
  const second = secondRows[0]
  expect(second?.role).not.toBe('admin')
})
