import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, expect, test } from 'vitest'
import { createDb, migrateControlDb, schema } from '@cimi/db'
import { createAuth } from '../server.ts'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true }))
    }),
  )
  tempDirs.length = 0
})

test('first signed-up user becomes admin, later users keep non-admin role', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cimi-auth-'))
  tempDirs.push(dir)
  const db = createDb({ path: join(dir, 'control.sqlite') })
  migrateControlDb(db)

  const auth = createAuth({
    db,
    schema: {
      user: schema.TUser,
      session: schema.TSession,
      account: schema.TAccount,
      verification: schema.TVerification,
    },
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
