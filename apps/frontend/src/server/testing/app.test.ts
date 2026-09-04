import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
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
  expect(body.status).toBe('recovering')
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

test('uses the configured control database path', async () => {
  const customRoot = await mkdtemp(join(tmpdir(), 'cimi-control-path-'))
  const controlPath = join(customRoot, 'nested', 'control.sqlite')
  const analyticsPath = join(customRoot, 'analytics')
  await mkdir(analyticsPath)
  const customApp = await createFrontendServerApp({
    ...process.env,
    CIMI_DATA_DIR: analyticsPath,
    CIMI_CONTROL_DB_PATH: controlPath,
  })

  try {
    await expect(access(controlPath)).resolves.toBeUndefined()
  } finally {
    await customApp.close()
    await rm(customRoot, { recursive: true, force: true })
  }
})

test('does not create a missing configured data directory', async () => {
  const missingDataDirectory = join(tempDir, 'missing-data')
  await expect(
    createFrontendServerApp({
      ...process.env,
      CIMI_DATA_DIR: missingDataDirectory,
      CIMI_CONTROL_DB_PATH: join(tempDir, 'missing-control.sqlite'),
    }),
  ).rejects.toThrow('Configured data directory is not ready')
  await expect(access(missingDataDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
})

afterAll(async () => {
  await app.close()
  await rm(tempDir, { recursive: true, force: true })
})
