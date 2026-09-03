import * as v from 'valibot'
import { expect, test } from 'vitest'
import { schema } from '@cimi/contract'
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
  await expect(initialize.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })

  const upgrade = await app.fetch(
    new Request('http://localhost/api/installation/upgradeInstallation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'UPGRADE' }),
    }),
  )
  expect(upgrade.status).toBe(401)
  await expect(upgrade.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
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
  await expect(status.json()).resolves.toMatchObject({ code: 'FORBIDDEN', status: 403 })

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', member.cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status).toBe(403)
  await expect(upgrade.json()).resolves.toMatchObject({ code: 'FORBIDDEN', status: 403 })
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
  expect(v.parse(schema.SInstallation, installation)).toBeDefined()
  expect(installation).toMatchObject({
    status: 'ready',
    defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    activeOperation: null,
  })

  const reused = await apiTestRequest(app, '/installation/initializeInstallation', owner.cookie, {})
  expect(reused.status, await reused.clone().text()).toBe(200)
  const reusedBody = await reused.json()
  expect(v.parse(schema.SInstallation, reusedBody)).toBeDefined()
  expect(reusedBody).toMatchObject({
    status: 'ready',
    defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  })

  const status = await apiTestRequest(app, '/installation/getInstallationStatus', owner.cookie)
  expect(status.status, await status.clone().text()).toBe(200)
  const statusBody = await status.json()
  expect(v.parse(schema.SInstallation, statusBody)).toBeDefined()
  expect(statusBody).toMatchObject({ status: 'ready', activeOperation: null })

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', owner.cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status, await upgrade.clone().text()).toBe(202)
  const upgraded = await upgrade.json()
  expect(v.parse(schema.SInstallation, upgraded)).toBeDefined()
  expect(upgraded.status).toBe('maintenance')
  expect(upgraded.activeOperation).toMatchObject({ kind: 'upgrade' })
  expect(typeof upgraded.activeOperation.operationId).toBe('string')

  const poll = await apiTestRequest(app, '/installation/getInstallationStatus', owner.cookie)
  expect(poll.status).toBe(200)
  const polled = await poll.json()
  expect(v.parse(schema.SInstallation, polled)).toBeDefined()
  expect(polled).toMatchObject({
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
  await expect(secondUpgrade.json()).resolves.toMatchObject({ code: 'CONFLICT', status: 409 })
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

test('getStatus before init returns not found', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'status-owner@example.com', 'Status Owner')

  const status = await apiTestRequest(app, '/installation/getInstallationStatus', owner.cookie)
  expect(status.status).toBe(404)
  await expect(status.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })
})

test('upgrade rejects a wrong confirmation', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'confirm-owner@example.com', 'Confirm Owner')
  const created = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(created.status).toBe(201)

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', owner.cookie, {
    confirmation: 'WRONG',
  })
  expect(upgrade.status).toBe(400)
  await expect(upgrade.json()).resolves.toMatchObject({ status: 400 })
})

test('upgrade with an incompatible artifact maps to 422', async () => {
  await using fixture = await createApiTestFixture()
  const { app, auth, db, analytics } = fixture
  const owner = await signUpTestUser(app, 'incompat-owner@example.com', 'Incompat Owner')

  const created = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(created.status).toBe(201)

  const incompatibleApp = createApiApp({
    db,
    auth,
    analytics,
    upgradeArtifact: { isCompatible: () => false },
  })
  const upgrade = await apiTestRequest(
    incompatibleApp,
    '/installation/upgradeInstallation',
    owner.cookie,
    { confirmation: 'UPGRADE' },
  )
  expect(upgrade.status).toBe(422)
  await expect(upgrade.json()).resolves.toMatchObject({
    code: 'INCOMPATIBLE_BACKUP',
    status: 422,
  })
})

test('initialize rejects invalid retention shapes', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'shape-owner@example.com', 'Shape Owner')

  const bad = await apiTestRequest(app, '/installation/initializeInstallation', owner.cookie, {
    defaultRetention: { eventMonths: -1, profileMonths: 12, replayMonths: null },
  })
  expect(bad.status).toBe(400)
  await expect(bad.json()).resolves.toMatchObject({ status: 400 })
})

test('second init with differing retention conflicts', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'retention-owner@example.com', 'Retention Owner')

  const created = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(created.status).toBe(201)

  const divergent = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {
      defaultRetention: { eventMonths: 24, profileMonths: 24, replayMonths: null },
    },
  )
  expect(divergent.status).toBe(409)
})

test('init after upgrade conflicts', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'after-upgrade@example.com', 'After Upgrade')

  const created = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(created.status).toBe(201)

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', owner.cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status).toBe(202)

  const again = await apiTestRequest(app, '/installation/initializeInstallation', owner.cookie, {})
  expect(again.status).toBe(409)
  await expect(again.json()).resolves.toMatchObject({ code: 'CONFLICT', status: 409 })
})

test('parallel inits converge to one created and four reused', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'parallel-owner@example.com', 'Parallel Owner')

  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      apiTestRequest(app, '/installation/initializeInstallation', owner.cookie, {}),
    ),
  )
  const statuses = responses.map((response) => response.status)
  expect(statuses.filter((status) => status === 201)).toHaveLength(1)
  expect(statuses.filter((status) => status === 200)).toHaveLength(4)
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
  const upgraded = (await upgrade.clone().json()) as { activeOperation: { operationId: string } }
  const operationId = upgraded.activeOperation.operationId

  const restarted = createApiApp({ db, auth, analytics, baseUrl: 'http://localhost' })
  let status = ''
  let preserved = ''
  for (let attempt = 0; attempt < 50 && status !== 'recovering'; attempt += 1) {
    const poll = await restarted.fetch(
      new Request('http://localhost/api/installation/getInstallationStatus', {
        method: 'GET',
        headers: { cookie: owner.cookie },
      }),
    )
    expect(poll.status).toBe(200)
    const body = (await poll.json()) as { status: string; activeOperation: { operationId: string } }
    status = body.status
    preserved = body.activeOperation.operationId
    if (status !== 'recovering') await new Promise((resolve) => setTimeout(resolve, 20))
  }
  expect(status).toBe('recovering')
  expect(preserved).toBe(operationId)

  const health = await restarted.fetch(new Request('http://localhost/api/system/health'))
  expect(health.status).toBe(200)
  await expect(health.json()).resolves.toMatchObject({ status: 'recovering' })
})

test('startup leaves an idle installation alone', async () => {
  await using fixture = await createApiTestFixture()
  const { app, auth, db, analytics } = fixture
  const owner = await signUpTestUser(app, 'idle-owner@example.com', 'Idle Owner')

  const created = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(created.status).toBe(201)

  const restarted = createApiApp({ db, auth, analytics, baseUrl: 'http://localhost' })
  const poll = await restarted.fetch(
    new Request('http://localhost/api/installation/getInstallationStatus', {
      method: 'GET',
      headers: { cookie: owner.cookie },
    }),
  )
  expect(poll.status).toBe(200)
  await expect(poll.json()).resolves.toMatchObject({ status: 'ready', activeOperation: null })
})
