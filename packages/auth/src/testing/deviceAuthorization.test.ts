import { afterEach, expect, test } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { CLI_AUTH_CLIENT_ID } from '../device.ts'
import { createAuth } from '../server.ts'

const databases: Db[] = []

afterEach(() => {
  for (const db of databases) closeDb(db)
  databases.length = 0
})

test('completes device authorization and authenticates with the returned bearer session', async () => {
  const db = createMigratedTestDb()
  databases.push(db)
  const auth = createAuth({
    db,
    schema: schema.betterAuthSchema,
    secret: 'test-secret-1234567890',
    baseURL: 'http://localhost',
  })

  const signUp = await auth.handler(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'password123',
      }),
    }),
  )
  expect(signUp.status).toBe(200)
  const cookie = signUp.headers.get('set-cookie')?.split(';', 1)[0]
  expect(cookie).toBeTruthy()

  const codeResponse = await auth.handler(
    new Request('http://localhost/api/auth/device/code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: CLI_AUTH_CLIENT_ID, scope: 'openid profile email' }),
    }),
  )
  expect(codeResponse.status).toBe(200)
  const code = (await codeResponse.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
  }
  expect(code.verification_uri).toBe('http://localhost/device')

  const claimResponse = await auth.handler(
    new Request(`http://localhost/api/auth/device?user_code=${code.user_code}`, {
      headers: { cookie: cookie! },
    }),
  )
  expect(claimResponse.status).toBe(200)

  const approveResponse = await auth.handler(
    new Request('http://localhost/api/auth/device/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ userCode: code.user_code }),
    }),
  )
  expect(approveResponse.status).toBe(200)

  const tokenResponse = await auth.handler(
    new Request('http://localhost/api/auth/device/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: code.device_code,
        client_id: CLI_AUTH_CLIENT_ID,
      }),
    }),
  )
  expect(tokenResponse.status).toBe(200)
  const tokens = (await tokenResponse.json()) as { access_token: string; token_type: string }
  expect(tokens.token_type).toBe('Bearer')

  const sessionResponse = await auth.handler(
    new Request('http://localhost/api/auth/get-session', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    }),
  )
  expect(sessionResponse.status).toBe(200)
  await expect(sessionResponse.json()).resolves.toMatchObject({
    user: { email: 'ada@example.com' },
  })
})

test('rejects an unknown device client', async () => {
  const db = createMigratedTestDb()
  databases.push(db)
  const auth = createAuth({ db, schema: schema.betterAuthSchema, secret: 'test-secret-1234567890' })

  const response = await auth.handler(
    new Request('http://localhost/api/auth/device/code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: 'unknown-client' }),
    }),
  )

  expect(response.status).toBe(400)
})
