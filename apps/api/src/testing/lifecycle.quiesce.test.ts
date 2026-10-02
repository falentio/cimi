import { expect, test } from 'vitest'
import { parse } from 'valibot'
import { SOrganizationCreateOutput, schema } from '@cimi/contract'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'
import type { ApiApp } from '../index.ts'
import type { BackupRestoreExecutor } from '../resources/backup-restore/index.ts'
import type { SafetyManifest, SourceManifest } from '../resources/backup-restore/index.ts'
import { createFakeUpgradeExecutor } from '../resources/installation/fixture.ts'
import { readyLifecycle } from './reporting-fixture.ts'

const CHECKSUM = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const DAY_ONE = '2026-09-05'

const DAY_TWO = '2026-09-06'

function sourceManifest(input: {
  operationId: string
  artifactId: string
  lastSafeSequence: number
}): SourceManifest {
  return {
    kind: 'source',
    id: input.artifactId,
    operationId: input.operationId,
    artifactType: 'authoritative_sqlite',
    generationId: input.operationId,
    storageKey: `backups/${input.operationId}.sqlite`,
    schemaVersion: '1',
    retentionBoundary: null,
    retentionManifest: null,
    acceptanceSequence: input.lastSafeSequence,
    sizeBytes: 8,
    checksumAlgorithm: 'sha256',
    checksumValue: CHECKSUM,
    createdAt: new Date(),
  }
}

function safetyManifest(input: {
  operationId: string
  artifactId: string
  lastSafeSequence: number
}): SafetyManifest {
  return {
    kind: 'safety',
    id: input.artifactId,
    operationId: input.operationId,
    artifactType: 'pre_restore_sqlite',
    generationId: input.operationId,
    storageKey: `safety/${input.operationId}.sqlite`,
    schemaVersion: '1',
    sizeBytes: 8,
    checksumAlgorithm: 'sha256',
    checksumValue: CHECKSUM,
    createdAt: new Date(),
    lastSafeSequence: input.lastSafeSequence,
    status: 'ready',
    errorCode: null,
  }
}

function createFakeBackupRestoreExecutor(overrides: Partial<BackupRestoreExecutor>) {
  const executor: BackupRestoreExecutor = {
    async captureBackup({ operationId, artifactId, lastSafeSequence }) {
      return sourceManifest({ operationId, artifactId, lastSafeSequence })
    },
    async createPreRestoreSafety({ operationId, artifactId, lastSafeSequence }) {
      return safetyManifest({ operationId, artifactId, lastSafeSequence })
    },
    async validateManifest() {},
    async restoreSqlite() {},
    async migrate() {},
    async rebuildAnalytics() {},
    async verifyStructuralReadiness() {},
    async rollback() {},
    ...overrides,
  }

  return executor
}

async function createInstallationSite(app: ApiApp, email: string, hostname: string) {
  const owner = await signUpTestUser(app, email, 'Lifecycle Owner')

  const initialized = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )

  expect(initialized.status, await initialized.clone().text()).toBe(201)

  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    owner.cookie,
    { name: 'Lifecycle Org' },
  )

  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())

  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname,
  })

  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)

  return { owner, site: parse(schema.SSiteCreateOutput, await siteResponse.json()) }
}

function eventFor(ingestionIdentifier: string, eventId: string) {
  return { eventId, ingestionIdentifier, kind: 'custom_event', name: 'checkout_completed' }
}

function overviewPath(siteId: string): string {
  return `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&granularity=day`
}

function listProfilesPath(siteId: string): string {
  return `/identity-profile/listProfiles?siteId=${encodeURIComponent(siteId)}&limit=10&offset=0`
}

async function collectEvent(
  app: ApiApp,
  site: { readonly ingestionIdentifier: string },
  eventId: string,
): Promise<Response> {
  return apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, eventId),
  )
}

async function collectEventUntilAccepted(
  app: ApiApp,
  site: { readonly ingestionIdentifier: string },
  prefix: string,
): Promise<Response> {
  let response = await collectEvent(app, site, `${prefix}_0`)

  for (let attempt = 1; attempt < 200 && response.status !== 200; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    response = await collectEvent(app, site, `${prefix}_${attempt}`)
  }

  return response
}

function seedSiteRetentionCutoff(
  db: Awaited<ReturnType<typeof createApiTestFixture>>['db'],
  siteId: string,
): void {
  const installation = db.$client
    .prepare('SELECT id FROM installation ORDER BY created_at LIMIT 1')
    .get() as { id: string } | undefined

  const policy = db.$client
    .prepare(
      `SELECT id FROM retention_policy
       WHERE installation_id = ? AND scope = 'installation' AND status = 'active'
       LIMIT 1`,
    )
    .get(installation?.id) as { id: string } | undefined

  if (installation === undefined || policy === undefined)
    throw new Error('Initialize the installation before seeding a retention cutoff')
  const now = Date.now()
  db.$client
    .prepare(
      `INSERT INTO retention_effective_cutoff (
         site_id, installation_id, policy_id, reporting_timezone, local_day,
         event_occurrence_cutoff_at, raw_receipt_cutoff_at, profile_activity_cutoff_at,
         effective_at, updated_at
       ) VALUES (?, ?, ?, 'UTC', ?, ?, ?, ?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET
         event_occurrence_cutoff_at = excluded.event_occurrence_cutoff_at,
         raw_receipt_cutoff_at = excluded.raw_receipt_cutoff_at,
         profile_activity_cutoff_at = excluded.profile_activity_cutoff_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      siteId,
      installation.id,
      policy.id,
      DAY_ONE,
      Date.parse('2026-01-01T00:00:00.000Z'),
      Date.parse('2026-01-01T00:00:00.000Z'),
      Date.parse('2026-01-01T00:00:00.000Z'),
      now,
      now,
    )
}

test('backup quiesces ingestion writes while analytics reads stay available', async () => {
  let releaseCapture: (() => void) | undefined

  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve
  })

  const executor = createFakeBackupRestoreExecutor({
    async captureBackup(input) {
      await captureGate

      return sourceManifest(input)
    },
  })

  await using fixture = await createApiTestFixture({ backupRestoreExecutor: executor })
  const { app } = fixture

  const { owner, site } = await createInstallationSite(
    app,
    'backup-quiesce@example.com',
    'backup-quiesce.example.com',
  )

  const created = await apiTestRequest(app, '/backup-restore/createBackup', owner.cookie, {})
  expect(created.status, await created.clone().text()).toBe(202)
  const createdBody = await created.json()
  const backupId = createdBody.id as string
  expect(typeof backupId).toBe('string')

  // Lock ownership is observable through safe operation status: the kind is named, the id is an
  // opaque operation id, and no path, storage key, credential, or Site identifier appears.
  const status = await apiTestRequest(app, '/installation/getInstallationStatus', owner.cookie)
  expect(status.status, await status.clone().text()).toBe(200)
  const statusBody = await status.json()
  expect(statusBody).toMatchObject({
    status: 'maintenance',
    activeOperation: { kind: 'backup', phase: 'lifecycle_transition' },
  })
  const statusText = JSON.stringify(statusBody)

  for (const leaked of [
    'controlDatabasePath',
    'dataDirectoryPath',
    'storageKey',
    'backups/',
    site.ingestionIdentifier,
    site.hostname,
  ]) {
    expect(statusText, statusText).not.toContain(leaked)
  }

  const collect = await collectEvent(app, site, 'event_backup_quiesced')
  expect(collect.status, await collect.clone().text()).toBe(503)
  await expect(collect.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  // Backup takes a write-quiesced admission mode (backup-write-quiesced) plus a maintenance
  // installation status; neither pauses analytics reads, so the gate passes and the route
  // proceeds to normal scope resolution. The owner is authorized and the site is active, so
  // an empty page is the justified non-503 outcome.
  const reads = await apiTestRequest(app, listProfilesPath(site.id), owner.cookie)
  expect(reads.status, await reads.clone().text()).toBe(200)
  await expect(reads.json()).resolves.toMatchObject({ items: [], totalCount: 0 })

  const health = await apiTestRequest(app, '/system/health', '')
  expect(health.status, await health.clone().text()).toBe(200)

  releaseCapture?.()

  let observedStatus: string | undefined
  let observedCompletedAt: string | null = null

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const poll = await apiTestRequest(
      app,
      `/backup-restore/getBackupStatus?backupId=${encodeURIComponent(backupId)}`,
      owner.cookie,
    )

    expect(poll.status, await poll.clone().text()).toBe(200)
    const body = await poll.json()
    observedStatus = body.status
    observedCompletedAt = body.completedAt

    if (body.status === 'available' || body.status === 'failed') break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  expect(observedCompletedAt, 'completedAt must be populated once terminal').not.toBeNull()
  expect(observedStatus, 'backup must complete as available').toBe('available')
})

test('restore quiesces analytics reads and writes', async () => {
  let releaseRestore: (() => void) | undefined

  const restoreGate = new Promise<void>((resolve) => {
    releaseRestore = resolve
  })

  const executor = createFakeBackupRestoreExecutor({
    async restoreSqlite() {
      await restoreGate
    },
  })

  await using fixture = await createApiTestFixture({ backupRestoreExecutor: executor })
  const { app } = fixture

  const { owner, site } = await createInstallationSite(
    app,
    'restore-quiesce@example.com',
    'restore-quiesce.example.com',
  )

  const created = await apiTestRequest(app, '/backup-restore/createBackup', owner.cookie, {})
  expect(created.status, await created.clone().text()).toBe(202)
  const backupId = ((await created.json()) as { id: string }).id

  let backupStatus: string | undefined

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const poll = await apiTestRequest(
      app,
      `/backup-restore/getBackupStatus?backupId=${encodeURIComponent(backupId)}`,
      owner.cookie,
    )

    expect(poll.status, await poll.clone().text()).toBe(200)
    backupStatus = ((await poll.json()) as { status: string }).status

    if (backupStatus === 'available' || backupStatus === 'failed') break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  expect(backupStatus, 'seeded backup must be available before restore').toBe('available')

  const restored = await apiTestRequest(app, '/backup-restore/restoreBackup', owner.cookie, {
    backupId,
    confirmation: 'RESTORE',
  })

  expect(restored.status, await restored.clone().text()).toBe(202)

  const reads = await apiTestRequest(app, listProfilesPath(site.id), owner.cookie)
  expect(reads.status, await reads.clone().text()).toBe(503)
  await expect(reads.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  const collect = await collectEvent(app, site, 'event_restore_quiesced')
  expect(collect.status, await collect.clone().text()).toBe(503)
  await expect(collect.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  const health = await apiTestRequest(app, '/system/health', '')
  expect(health.status, await health.clone().text()).toBe(200)

  releaseRestore?.()
})

test('cleanup quiesces ingestion writes and report reads while health stays available', async () => {
  const lock = new InMemoryLifecycleLock()
  await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle(), lock })
  const { app, db, analytics } = fixture

  const { owner, site } = await createInstallationSite(
    app,
    'retention-quiesce@example.com',
    'retention-quiesce.example.com',
  )

  const baseline = await collectEvent(app, site, 'event_before_retention')
  expect(baseline.status, await baseline.clone().text()).toBe(200)
  seedSiteRetentionCutoff(db, site.id)
  await analytics.rebuild({ controlDb: db })

  const projectedRead = await apiTestRequest(app, overviewPath(site.id), owner.cookie)
  expect(projectedRead.status, await projectedRead.clone().text()).toBe(200)

  // The fixture disables the retention worker, so hold the lease the worker would take.
  const lease = lock.acquire('retention')
  expect(lease).toBeDefined()

  const collect = await collectEvent(app, site, 'event_during_retention')
  expect(collect.status, await collect.clone().text()).toBe(503)
  await expect(collect.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  const rejectedRows = db.$client
    .prepare('SELECT event_id FROM accepted_event WHERE event_id = ?')
    .all('event_during_retention')

  expect(rejectedRows, 'a write during cleanup must not be admitted').toHaveLength(0)

  const health = await apiTestRequest(app, '/system/health', '')
  expect(health.status, await health.clone().text()).toBe(200)

  // Cleanup mutates the derived analytics store, so a report read is refused before execution;
  // a control-store read that resolves through SQLite keeps serving.
  const reportDuringCleanup = await apiTestRequest(app, overviewPath(site.id), owner.cookie)
  expect(reportDuringCleanup.status, await reportDuringCleanup.clone().text()).toBe(503)
  await expect(reportDuringCleanup.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  const readDuringCleanup = await apiTestRequest(app, listProfilesPath(site.id), owner.cookie)
  expect(readDuringCleanup.status, await readDuringCleanup.clone().text()).toBe(200)
  await expect(readDuringCleanup.json()).resolves.toMatchObject({ items: [], totalCount: 0 })

  await lease?.release()

  const resumed = await collectEventUntilAccepted(app, site, 'event_after_retention')
  expect(resumed.status, await resumed.clone().text()).toBe(200)
  await expect(resumed.json()).resolves.toMatchObject({ status: 'accepted' })

  const readAfterCleanup = await apiTestRequest(app, overviewPath(site.id), owner.cookie)
  expect(readAfterCleanup.status, await readAfterCleanup.clone().text()).toBe(200)
})

test('upgrade quiesces ingestion and blocks other lifecycle mutations', async () => {
  let releaseMigration: (() => void) | undefined

  const migrationGate = new Promise<void>((resolve) => {
    releaseMigration = resolve
  })

  await using fixture = await createApiTestFixture({
    upgradeExecutor: createFakeUpgradeExecutor({ migrate: () => migrationGate }),
  })

  const { app } = fixture

  const { owner, site } = await createInstallationSite(
    app,
    'upgrade-quiesce@example.com',
    'upgrade-quiesce.example.com',
  )

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', owner.cookie, {
    confirmation: 'UPGRADE',
  })

  expect(upgrade.status, await upgrade.clone().text()).toBe(202)
  await expect(upgrade.json()).resolves.toMatchObject({
    status: 'maintenance',
    activeOperation: { kind: 'upgrade' },
  })

  const collect = await collectEvent(app, site, 'event_upgrade_quiesced')
  expect(collect.status, await collect.clone().text()).toBe(503)

  const secondUpgrade = await apiTestRequest(
    app,
    '/installation/upgradeInstallation',
    owner.cookie,
    { confirmation: 'UPGRADE' },
  )

  expect(secondUpgrade.status, await secondUpgrade.clone().text()).toBe(409)
  await expect(secondUpgrade.json()).resolves.toMatchObject({
    code: 'CONFLICT',
    status: 409,
  })

  const status = await apiTestRequest(app, '/installation/getInstallationStatus', owner.cookie)
  expect(status.status, await status.clone().text()).toBe(200)
  const statusBody = await status.json()
  expect(statusBody).toMatchObject({
    status: 'maintenance',
    activeOperation: { kind: 'upgrade' },
  })
  const serialized = JSON.stringify(statusBody)

  for (const leaked of [
    'controlDatabasePath',
    'dataDirectoryPath',
    'storageKey',
    site.ingestionIdentifier,
  ]) {
    expect(serialized, serialized).not.toContain(leaked)
  }

  releaseMigration?.()

  let finalActive = { kind: 'upgrade' }
  let finalStatus: string | undefined

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const poll = await apiTestRequest(app, '/installation/getInstallationStatus', owner.cookie)
    expect(poll.status, await poll.clone().text()).toBe(200)
    const body = await poll.json()
    finalActive = body.activeOperation
    finalStatus = body.status

    if (body.activeOperation === null && (body.status === 'ready' || body.status === 'degraded')) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  expect(finalActive).toBeNull()
  expect(finalStatus, 'installation must settle out of maintenance').toMatch(/ready|degraded/)

  const collectedAgain = await collectEvent(app, site, 'event_after_upgrade')
  expect(collectedAgain.status, await collectedAgain.clone().text()).toBe(200)
  await expect(collectedAgain.json()).resolves.toMatchObject({
    status: 'accepted',
    eventId: 'event_after_upgrade',
  })
})
