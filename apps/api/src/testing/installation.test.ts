import { expect, test } from 'vitest'
import { createApiApp } from '../index.ts'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'

test('installation routes reject unauthenticated callers', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture

  const status = await app.fetch(
    new Request('http://localhost/api/installation/getInstallationStatus', { method: 'GET' }),
  )
  expect(status.status).toBe(401)
  await expect(status.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })

  const initialize = await app.fetch(
    new Request('http://localhost/api/installation/initializeInstallation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
  )
  expect(initialize.status).toBe(401)

  const upgrade = await app.fetch(
    new Request('http://localhost/api/installation/upgradeInstallation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'UPGRADE' }),
    }),
  )
  expect(upgrade.status).toBe(401)
})

test('installation routes reject non-admin callers', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  await signUpTestUser(app, 'install-owner@example.com', 'Install Owner')
  const member = await signUpTestUser(app, 'install-member@example.com', 'Install Member')

  const initialize = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    member.cookie,
    {},
  )
  expect(initialize.status).toBe(403)
  await expect(initialize.json()).resolves.toMatchObject({ code: 'FORBIDDEN', status: 403 })

  const status = await apiTestRequest(app, '/installation/getInstallationStatus', member.cookie)
  expect(status.status).toBe(403)

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', member.cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status).toBe(403)
})

test('installation initializes convergently, upgrades, and polls the operation', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'lifecycle-owner@example.com', 'Lifecycle Owner')

  const created = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(created.status, await created.clone().text()).toBe(201)
  const installation = await created.json()
  expect(installation).toMatchObject({
    status: 'ready',
    defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    activeOperation: null,
  })

  const reused = await apiTestRequest(app, '/installation/initializeInstallation', owner.cookie, {})
  expect(reused.status, await reused.clone().text()).toBe(200)
  await expect(reused.json()).resolves.toMatchObject({
    status: 'ready',
    defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  })

  const status = await apiTestRequest(app, '/installation/getInstallationStatus', owner.cookie)
  expect(status.status, await status.clone().text()).toBe(200)
  await expect(status.json()).resolves.toMatchObject({ status: 'ready', activeOperation: null })

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', owner.cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status, await upgrade.clone().text()).toBe(202)
  const upgraded = await upgrade.json()
  expect(upgraded.status).toBe('maintenance')
  expect(upgraded.activeOperation).toMatchObject({ kind: 'upgrade' })
  expect(typeof upgraded.activeOperation.operationId).toBe('string')

  const poll = await apiTestRequest(app, '/installation/getInstallationStatus', owner.cookie)
  expect(poll.status).toBe(200)
  await expect(poll.json()).resolves.toMatchObject({
    status: 'maintenance',
    activeOperation: { operationId: upgraded.activeOperation.operationId, kind: 'upgrade' },
  })

  const secondUpgrade = await apiTestRequest(
    app,
    '/installation/upgradeInstallation',
    owner.cookie,
    { confirmation: 'UPGRADE' },
  )
  expect(secondUpgrade.status).toBe(409)
})

test('upgrade without initialization conflicts', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'upgrade-owner@example.com', 'Upgrade Owner')

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', owner.cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status).toBe(409)
  await expect(upgrade.json()).resolves.toMatchObject({ code: 'CONFLICT', status: 409 })
})

test('startup resumes an interrupted upgrade as recovering', async () => {
  await using fixture = await createApiTestFixture()
  const { app, auth, db, analytics } = fixture
  const owner = await signUpTestUser(app, 'resume-owner@example.com', 'Resume Owner')

  const created = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(created.status, await created.clone().text()).toBe(201)

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', owner.cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status, await upgrade.clone().text()).toBe(202)

  const restarted = createApiApp({ db, auth, analytics, baseUrl: 'http://localhost' })
  let status = ''
  for (let attempt = 0; attempt < 50 && status !== 'recovering'; attempt += 1) {
    const poll = await restarted.fetch(
      new Request('http://localhost/api/installation/getInstallationStatus', {
        method: 'GET',
        headers: { cookie: owner.cookie },
      }),
    )
    expect(poll.status).toBe(200)
    status = ((await poll.json()) as { status: string }).status
    if (status !== 'recovering') await new Promise((resolve) => setTimeout(resolve, 20))
  }
  expect(status).toBe('recovering')

  const health = await restarted.fetch(new Request('http://localhost/api/system/health'))
  expect(health.status).toBe(200)
  await expect(health.json()).resolves.toMatchObject({ status: 'recovering' })
})
