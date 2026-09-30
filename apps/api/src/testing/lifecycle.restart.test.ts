import { expect, test } from 'vitest'
import { parse } from 'valibot'
import { SOrganizationCreateOutput, schema } from '@cimi/contract'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import { createApiApp } from '../index.ts'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'
import { createFakeUpgradeExecutor } from '../resources/installation/fixture.ts'
import type { BackupRestoreExecutor } from '../resources/backup-restore/index.ts'

async function initializeInstallation(
  app: ReturnType<typeof createApiApp>,
  email: string,
): Promise<{ cookie: string }> {
  const owner = await signUpTestUser(app, email, 'Restart Owner')
  const initialized = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(initialized.status, await initialized.clone().text()).toBe(201)
  return { cookie: owner.cookie }
}

function ingestionSite(eventIngestionInput: { organizationId: string; hostname: string }) {
  return {
    name: 'Production',
    hostname: eventIngestionInput.hostname,
    organizationId: eventIngestionInput.organizationId,
  }
}

test('a restart recovers a durable interrupted upgrade and resumes collection', async () => {
  let releaseFirstMigration: (() => void) | undefined
  const firstMigration = new Promise<void>((resolve) => {
    releaseFirstMigration = resolve
  })
  let resumedMigrationCalls = 0

  await using fixture = await createApiTestFixture({
    upgradeExecutor: createFakeUpgradeExecutor({ migrate: () => firstMigration }),
  })
  const { app, auth, db, analytics } = fixture
  const { cookie } = await initializeInstallation(app, 'restart-resume@example.com')

  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    cookie,
    {
      name: 'Restart Org',
    },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())
  const siteResponse = await apiTestRequest(
    app,
    '/site/createSite',
    cookie,
    ingestionSite({ organizationId: organization.id, hostname: 'restart.example.com' }),
  )
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = parse(schema.SSiteCreateOutput, await siteResponse.json())

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status, await upgrade.clone().text()).toBe(202)
  const started = (await upgrade.clone().json()) as {
    status: string
    activeOperation: { operationId: string }
  }
  const operationId = started.activeOperation.operationId
  expect(started.status).toBe('maintenance')
  expect(operationId).toBeTruthy()

  // Interrupt: the first app's migration never resolves, so its durable upgrade operation stays
  // non-terminal. A restarted process gets a fresh lifecycle lock and must claim and complete it.
  const restartedLock = new InMemoryLifecycleLock()
  const restarted = createApiApp({
    db,
    auth,
    analytics,
    lock: restartedLock,
    dataDirectoryReady: true,
    controlDatabasePath: ':memory:',
    dataDirectoryPath: '/tmp/cimi-test-data',
    startRetentionCleanupWorker: false,
    upgradeExecutor: createFakeUpgradeExecutor({
      migrate: async () => {
        resumedMigrationCalls += 1
      },
    }),
  })
  try {
    let restartedOperation: unknown = { kind: 'upgrade' }
    let restartedStatus: string | undefined
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const poll = await apiTestRequest(restarted, '/installation/getInstallationStatus', cookie)
      expect(poll.status, await poll.clone().text()).toBe(200)
      const body = (await poll.json()) as { status: string; activeOperation: unknown }
      restartedOperation = body.activeOperation
      restartedStatus = body.status
      if (restartedOperation === null) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(
      resumedMigrationCalls,
      'the restarted app resumes the durable migration',
    ).toBeGreaterThan(0)
    expect(restartedOperation, 'the resumed upgrade reaches a terminal state').toBeNull()
    expect(
      restartedStatus,
      'restart settles the installation out of recovering/maintenance',
    ).toMatch(/ready|degraded/)

    const accepted = await restarted.fetch(
      new Request('http://localhost/api/event-ingestion/collectEvent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: 'event_restart_accepted',
          ingestionIdentifier: site.ingestionIdentifier,
          kind: 'custom_event',
          name: 'checkout_completed',
        }),
      }),
    )
    expect(accepted.status, await accepted.clone().text()).toBe(200)
    await expect(accepted.json()).resolves.toMatchObject({ status: 'accepted' })
  } finally {
    await restarted.close()
    releaseFirstMigration?.()
    await app.close()
  }
}, 30_000)
test('quiesce drains a pre-admitted candidate and rejects a new write in the same window', async () => {
  let releaseCapture: (() => void) | undefined
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve
  })
  const executor: BackupRestoreExecutor = {
    async captureBackup({ operationId, artifactId, lastSafeSequence }) {
      await captureGate
      return {
        kind: 'source',
        id: artifactId,
        operationId,
        artifactType: 'authoritative_sqlite',
        generationId: operationId,
        storageKey: `backups/${operationId}.sqlite`,
        schemaVersion: '1',
        retentionBoundary: null,
        retentionManifest: null,
        acceptanceSequence: lastSafeSequence,
        sizeBytes: 8,
        checksumAlgorithm: 'sha256',
        checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        createdAt: new Date(),
      }
    },
    async createPreRestoreSafety() {
      throw new Error('unused')
    },
    async validateManifest() {},
    async restoreSqlite() {},
    async migrate() {},
    async rebuildAnalytics() {},
    async verifyStructuralReadiness() {},
    async rollback() {},
  }

  await using fixture = await createApiTestFixture({ backupRestoreExecutor: executor })
  const { app, db } = fixture
  const { cookie } = await initializeInstallation(app, 'drain-proof@example.com')

  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    cookie,
    {
      name: 'Drain Org',
    },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())
  const siteResponse = await apiTestRequest(
    app,
    '/site/createSite',
    cookie,
    ingestionSite({ organizationId: organization.id, hostname: 'drain.example.com' }),
  )
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = parse(schema.SSiteCreateOutput, await siteResponse.json())

  // A candidate admitted before quiescence is committed by the coalescer's own flush timer.
  const admitted = await app.fetch(
    new Request('http://localhost/api/event-ingestion/collectEvent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventId: 'event_drained',
        ingestionIdentifier: site.ingestionIdentifier,
        kind: 'custom_event',
        name: 'checkout_completed',
      }),
    }),
  )
  expect(admitted.status, await admitted.clone().text()).toBe(200)

  // Backup starts, stops admission, drains the queue, then blocks inside the executor.
  const backup = await apiTestRequest(app, '/backup-restore/createBackup', cookie, {})
  expect(backup.status, await backup.clone().text()).toBe(202)

  const duringQuiesce = await app.fetch(
    new Request('http://localhost/api/event-ingestion/collectEvent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventId: 'event_during_quiesce',
        ingestionIdentifier: site.ingestionIdentifier,
        kind: 'custom_event',
        name: 'checkout_completed',
      }),
    }),
  )
  expect(duringQuiesce.status, await duringQuiesce.clone().text()).toBe(503)

  const committed = db.$client
    .prepare('SELECT event_id FROM accepted_event WHERE event_id = ?')
    .all('event_drained') as Array<{ event_id: string }>
  expect(committed, 'the drained candidate stays durable across quiescence').toHaveLength(1)
  const rejected = db.$client
    .prepare('SELECT event_id FROM accepted_event WHERE event_id = ?')
    .all('event_during_quiesce') as Array<{ event_id: string }>
  expect(rejected, 'a write during quiescence must not be admitted').toHaveLength(0)

  // Release the executor so the backup finishes and admission resumes.
  releaseCapture?.()
  let resumed = false
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const retry = await app.fetch(
      new Request('http://localhost/api/event-ingestion/collectEvent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: 'event_after_backup',
          ingestionIdentifier: site.ingestionIdentifier,
          kind: 'custom_event',
          name: 'checkout_completed',
        }),
      }),
    )
    if (retry.status === 200) {
      resumed = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(resumed, 'admission resumes after the backup completes').toBe(true)
}, 30_000)
