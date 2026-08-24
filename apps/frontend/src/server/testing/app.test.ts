import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { SSystemHealthOutput } from '@cimi/contract'
import { createFrontendServerApp } from '../app.ts'

const tempDir = await mkdtemp(join(tmpdir(), 'cimi-frontend-'))
process.env['CIMI_DATA_DIR'] = tempDir
process.env['BETTER_AUTH_SECRET'] = 'test-secret-1234567890-abcdefghijklmnop'
process.env['BETTER_AUTH_URL'] = 'http://localhost:4321'

const app = await createFrontendServerApp(process.env)

test('system health reports live control and analytics stores', async () => {
  const res = await app.fetch(new Request('http://localhost/api/system/health'))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toEqual(expect.schemaMatching(SSystemHealthOutput))
  expect(body.status).toBe('healthy')
  expect(body.controlStore).toBe('ready')
  expect(body.analyticsStore).toBe('ready')
  expect(body.cleanupPending).toBe(false)
  expect(body.version).toBe('0.0.1')
  expect(body.checkedAt).toMatch(/T/)
})

test('auth sign-up route is mounted and sets a session cookie', async () => {
  const signup = await app.fetch(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Ada',
        email: 'ada@example.com',
        password: 'password123',
      }),
    }),
  )
  expect(signup.status).toBe(200)
  expect(signup.headers.get('set-cookie')).toBeTruthy()
})

afterAll(async () => {
  await app.close()
  await rm(tempDir, { recursive: true, force: true })
})
