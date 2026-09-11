import { expect, test } from 'vitest'
import { parse } from 'valibot'
import { SOrganizationCreateOutput, schema } from '@cimi/contract'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'
import type { ApiApp } from '../index.ts'
import type { BackupRestoreExecutor } from '../resources/backup-restore/index.ts'
import type { SafetyManifest, SourceManifest } from '../resources/backup-restore/index.ts'
import { createFakeUpgradeExecutor } from '../resources/installation/fixture.ts'

const CHECKSUM = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

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

async function createInstallationSite(app: ApiApp, email: string) {
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
    hostname: 'lifecycle-quiesce.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  return { owner, site: parse(schema.SSiteCreateOutput, await siteResponse.json()) }
}

function eventFor(ingestionIdentifier: string, eventId: string) {
  return { eventId, ingestionIdentifier, kind: 'custom_event', name: 'checkout_completed' }
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
  const { owner, site } = await createInstallationSite(app, 'backup-quiesce@example.com')

  const created = await apiTestRequest(app, '/backup-restore/createBackup', owner.cookie, {})
  expect(created.status, await created.clone().text()).toBe(202)
  const createdBody = await created.json()
  const backupId = createdBody.id as string
  expect(typeof backupId).toBe('string')

  const collect = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, 'event_backup_quiesced'),
  )
  expect(collect.status, await collect.clone().text()).toBe(503)
  await expect(collect.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  // Backup takes a write-quiesced admission mode (backup-write-quiesced) plus a maintenance
  // installation status; neither pauses analytics reads, so the gate passes and the route
  // proceeds to normal scope resolution. The owner is authorized and the site is active, so
  // an empty page is the justified non-503 outcome.
  const reads = await apiTestRequest(
    app,
    `/identity-profile/listProfiles?siteId=${encodeURIComponent(site.id)}&limit=10&offset=0`,
    owner.cookie,
  )
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
  const { owner, site } = await createInstallationSite(app, 'restore-quiesce@example.com')

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

  const reads = await apiTestRequest(
    app,
    `/identity-profile/listProfiles?siteId=${encodeURIComponent(site.id)}&limit=10&offset=0`,
    owner.cookie,
  )
  expect(reads.status, await reads.clone().text()).toBe(503)
  await expect(reads.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  const collect = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, 'event_restore_quiesced'),
  )
  expect(collect.status, await collect.clone().text()).toBe(503)
  await expect(collect.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  const health = await apiTestRequest(app, '/system/health', '')
  expect(health.status, await health.clone().text()).toBe(200)

  releaseRestore?.()
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
  const { owner, site } = await createInstallationSite(app, 'upgrade-quiesce@example.com')

  const upgrade = await apiTestRequest(app, '/installation/upgradeInstallation', owner.cookie, {
    confirmation: 'UPGRADE',
  })
  expect(upgrade.status, await upgrade.clone().text()).toBe(202)
  await expect(upgrade.json()).resolves.toMatchObject({
    status: 'maintenance',
    activeOperation: { kind: 'upgrade' },
  })

  const collect = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, 'event_upgrade_quiesced'),
  )
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

  let finalActive: unknown = { kind: 'upgrade' }
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

  const collectedAgain = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, 'event_after_upgrade'),
  )
  expect(collectedAgain.status, await collectedAgain.clone().text()).toBe(200)
  await expect(collectedAgain.json()).resolves.toMatchObject({
    status: 'accepted',
    eventId: 'event_after_upgrade',
  })
})
