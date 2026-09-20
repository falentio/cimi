import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { call } from '@orpc/server'
import { schema } from '@cimi/contract'
import { closeDb, createAnalyticsDb, createDb } from '@cimi/db'
import { expect, test } from 'vitest'
import type { InferOutput } from 'valibot'
import {
  assertAvailableBackup,
  assertCheckpointMonotonic,
  assertCleanupSettled,
  assertProgressMonotonic,
  assertRestoreSafety,
  waitForBackupTrace,
  waitForInstallationTerminal,
} from './database-management.lifecycle.ts'
import { createApiE2eFixture, E2ePollingTimeoutError } from './fixture.ts'

type InstallationInitializeInput = InferOutput<typeof schema.SInstallationInitializeFields>
type BackupRestoreInput = InferOutput<typeof schema.SBackupRestoreInput>

test('initializes convergently and rejects strict or divergent inputs without mutation', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('database-admin@example.com', 'Database Admin')

  await expect(
    call(fixture.router.installation.getInstallationStatus, {}, { context: await admin.context() }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })

  const invalidInput = { unexpected: true } as unknown as InstallationInitializeInput
  await expect(
    call(fixture.router.installation.initializeInstallation, invalidInput, {
      context: await admin.context(),
    }),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

  const created = await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  expect(created.status).toBe(201)
  expect(created.body).toMatchObject({
    status: 'ready',
    defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    activeOperation: null,
  })

  const reused = await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  expect(reused.status).toBe(200)
  expect(reused.body).toEqual(created.body)

  const divergent: InstallationInitializeInput = {
    defaultRetention: { eventMonths: 24, profileMonths: 18, replayMonths: 6 },
  }
  await expect(
    call(fixture.router.installation.initializeInstallation, divergent, {
      context: await admin.context(),
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' })

  const afterRejectedInitialization = await call(
    fixture.router.installation.getInstallationStatus,
    {},
    { context: await admin.context() },
  )
  expect(afterRejectedInitialization).toEqual(created.body)
})

test('enforces admin authorization across lifecycle procedures without mutation', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('authorization-admin@example.com', 'Authorization Admin')
  const member = await fixture.createUser(
    'authorization-member@example.com',
    'Authorization Member',
  )

  const created = await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const before = await call(
    fixture.router.installation.getInstallationStatus,
    {},
    { context: await admin.context() },
  )

  await expect(
    call(
      fixture.router.installation.getInstallationStatus,
      {},
      { context: await member.context() },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(
    call(
      fixture.router.installation.upgradeInstallation,
      { confirmation: 'UPGRADE' },
      { context: await member.context() },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(
    call(
      fixture.router.backupRestore.createBackup,
      {},
      { context: fixture.unauthenticatedContext() },
    ),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  await expect(
    call(fixture.router.backupRestore.createBackup, {}, { context: await member.context() }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(
    call(
      fixture.router.backupRestore.restoreBackup,
      { backupId: 'bop_missing', confirmation: 'RESTORE' },
      { context: await member.context() },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })

  const after = await call(
    fixture.router.installation.getInstallationStatus,
    {},
    { context: await admin.context() },
  )
  expect(after).toEqual(before)
  expect(created.body).toEqual(before)
})

test('persists scoped retention and collection policy inheritance', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('policy-admin@example.com', 'Policy Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const organization = await call(
    fixture.router.organization.createOrganization,
    { name: 'Policy Organization' },
    { context: await admin.context() },
  )
  const site = await call(
    fixture.router.site.createSite,
    {
      organizationId: organization.id,
      name: 'Policy Site',
      hostname: 'policy.example.com',
    },
    { context: await admin.context() },
  )
  const installationRetention = { eventMonths: 18, profileMonths: 12, replayMonths: 6 }
  const siteRetention = { eventMonths: 24, profileMonths: 18, replayMonths: 12 }

  const savedInstallationRetention = await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'installation', policy: installationRetention },
    { context: await admin.context() },
  )
  expect(savedInstallationRetention.effectivePolicy).toEqual(installationRetention)
  const savedSiteRetention = await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'site', siteId: site.id, policy: siteRetention },
    { context: await admin.context() },
  )
  expect(savedSiteRetention.effectivePolicy).toEqual(siteRetention)
  await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'site', siteId: site.id, policy: null },
    { context: await admin.context() },
  )
  await expect(
    call(
      fixture.router.retentionPolicy.getRetentionPolicy,
      { scope: 'site', siteId: site.id },
      { context: await admin.context() },
    ),
  ).resolves.toMatchObject({ effectivePolicy: installationRetention })

  const installationCollection = {
    anonymousCollection: 'disabled' as const,
    honorGpcDnt: false,
    consentMode: 'none' as const,
    botPolicy: 'include' as const,
    captureQueryStrings: true,
    urlPolicy: {
      capturePath: true,
      captureReferrer: false,
      stripQueryStrings: false,
      stripSensitiveValues: true,
    },
    propertyPolicy: {
      allowScalarProperties: true,
      maxProperties: 10,
      maxValueLength: 128,
      reservedNames: [],
    },
    profileFilterKeys: [],
    exclusions: { hostnames: [], paths: [], countries: [], ipRanges: [] },
  }
  await call(
    fixture.router.collectionPolicy.updateCollectionPolicy,
    { scope: 'installation', policy: installationCollection },
    { context: await admin.context() },
  )
  const siteCollection = await call(
    fixture.router.collectionPolicy.updateCollectionPolicy,
    {
      scope: 'site',
      policy: { siteId: site.id, ...installationCollection, captureQueryStrings: false },
    },
    { context: await admin.context() },
  )
  expect(siteCollection).toMatchObject({
    scope: 'site',
    siteId: site.id,
    captureQueryStrings: false,
  })
  const effectiveCollection = await call(
    fixture.router.collectionPolicy.getCollectionPolicy,
    { siteId: site.id },
    { context: await admin.context() },
  )
  expect(effectiveCollection).toMatchObject({
    siteOverride: { scope: 'site', siteId: site.id, captureQueryStrings: false },
    effective: { scope: 'site', siteId: site.id, captureQueryStrings: false },
    source: { captureQueryStrings: 'site' },
  })
  await call(
    fixture.router.collectionPolicy.updateCollectionPolicy,
    { scope: 'site', policy: { siteId: site.id, clear: true } },
    { context: await admin.context() },
  )
  const clearedCollection = await call(
    fixture.router.collectionPolicy.getCollectionPolicy,
    { siteId: site.id },
    { context: await admin.context() },
  )
  expect(clearedCollection).toMatchObject({
    siteOverride: null,
    effective: { scope: 'site', siteId: site.id, captureQueryStrings: true },
    source: { captureQueryStrings: 'installation' },
  })
})

test('recovers retention cleanup across SQLite, DuckDB, and backup artifacts', async () => {
  await using fixture = await createApiE2eFixture({
    startRetentionCleanupWorker: true,
    retentionCleanupIntervalMs: 50,
  })
  const admin = await fixture.createUser(
    'retention-worker-admin@example.com',
    'Retention Worker Admin',
  )
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const organization = await call(
    fixture.router.organization.createOrganization,
    { name: 'Retention Worker Organization' },
    { context: await admin.context() },
  )
  const site = await call(
    fixture.router.site.createSite,
    {
      organizationId: organization.id,
      name: 'Retention Worker Site',
      hostname: 'retention.example.com',
    },
    { context: await admin.context() },
  )
  const eventId = 'evt_retention_worker'
  const expiredAt = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000)
  await call(
    fixture.router.eventIngestion.collectEvent,
    {
      eventId,
      ingestionIdentifier: site.ingestionIdentifier,
      kind: 'page_view',
      pagePath: '/retention',
      occurrenceTime: expiredAt.toISOString(),
      anonymousIdentityId: 'anonymous_retention_worker',
    },
    { context: fixture.unauthenticatedContext() },
  )
  fixture.state.backdateAcceptedEvent({ eventId, at: expiredAt })
  await fixture.analytics.rebuild()

  const started = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const backup = await waitForBackupTrace(fixture, admin, started.id)
  assertAvailableBackup(backup.terminal)

  const savePolicyDeadline = Date.now() + 10_000
  for (;;) {
    try {
      await call(
        fixture.router.retentionPolicy.updateRetentionPolicy,
        {
          scope: 'installation',
          policy: { eventMonths: 1, profileMonths: 1, replayMonths: null },
        },
        { context: await admin.context() },
      )
      break
    } catch (error) {
      if ((error as { code?: string }).code !== 'CONFLICT' || Date.now() > savePolicyDeadline) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  const derivedGate = fixture.faults.hold({ domain: 'retentionCleanup', stage: 'derived' })
  await derivedGate.entered

  await fixture.stop()
  await fixture.restart()

  const cleanup = await fixture.waitFor({
    read: async () =>
      call(
        fixture.router.retentionPolicy.getRetentionPolicy,
        { scope: 'installation' },
        { context: await admin.context() },
      ),
    done: (value) =>
      !value.cleanup.pending &&
      value.cleanup.derived.status === 'completed' &&
      value.cleanup.backup.status === 'completed',
    timeoutMs: 5_000,
    label: 'retention cleanup worker',
  })
  expect(cleanup.cleanup).toMatchObject({
    pending: false,
    derived: { status: 'completed' },
    backup: { status: 'completed' },
  })

  await fixture.stop()

  const controlDb = createDb({ path: fixture.controlDatabasePath })
  try {
    expect(
      controlDb.$client
        .prepare('SELECT event_id FROM accepted_event WHERE event_id = ?')
        .all(eventId),
    ).toEqual([])
  } finally {
    closeDb(controlDb)
  }

  const backupDb = createDb({
    path: join(fixture.dataDirectoryPath, 'backups', `${backup.terminal.id}.sqlite`),
  })
  try {
    expect(
      backupDb.$client
        .prepare('SELECT event_id FROM accepted_event WHERE event_id = ?')
        .all(eventId),
    ).toEqual([])
  } finally {
    closeDb(backupDb)
  }

  const analytics = await createAnalyticsDb({
    path: fixture.paths.analyticsDatabasePath,
    tempDirectory: fixture.paths.analyticsTempDirectoryPath,
  })
  try {
    await expect(
      analytics.readWindowed((reader) =>
        reader.read('SELECT event_id FROM events WHERE event_id = ?', [eventId]),
      ),
    ).resolves.toEqual([])
  } finally {
    await analytics.close()
  }
}, 30_000)

test('rejects wrong lifecycle confirmation before creating an operation', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('confirmation-admin@example.com', 'Confirmation Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const before = await call(
    fixture.router.installation.getInstallationStatus,
    {},
    { context: await admin.context() },
  )
  const wrongUpgrade = { confirmation: 'WRONG' } as unknown as { confirmation: 'UPGRADE' }
  const wrongRestore = {
    backupId: 'bop_missing',
    confirmation: 'WRONG',
  } as unknown as BackupRestoreInput

  await expect(
    call(fixture.router.installation.upgradeInstallation, wrongUpgrade, {
      context: await admin.context(),
    }),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  await expect(
    call(fixture.router.backupRestore.restoreBackup, wrongRestore, {
      context: await admin.context(),
    }),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

  const after = await call(
    fixture.router.installation.getInstallationStatus,
    {},
    { context: await admin.context() },
  )
  expect(after).toEqual(before)
})

test('holds a real upgrade, exposes accepted state, and preserves operation ownership on conflict', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('upgrade-admin@example.com', 'Upgrade Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )

  const gate = fixture.faults.hold({ domain: 'upgrade', stage: 'migrate' })
  const started = await call(
    fixture.router.installation.upgradeInstallation,
    { confirmation: 'UPGRADE' },
    { context: await admin.context() },
  )
  expect(started).toMatchObject({
    status: 'maintenance',
    activeOperation: {
      kind: 'upgrade',
      phase: 'pre_upgrade_safety',
      checkpoint: 'none',
      errorCode: null,
    },
  })
  await gate.entered

  const httpAdmission = await fixture.app.fetch(
    new Request('http://localhost/api/retention-policy/updateRetentionPolicy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: admin.cookie,
      },
      body: JSON.stringify({
        scope: 'installation',
        policy: { eventMonths: 18, profileMonths: 12, replayMonths: 6 },
      }),
    }),
  )
  expect(httpAdmission.status).toBe(503)
  await expect(httpAdmission.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  const held = await call(
    fixture.router.installation.getInstallationStatus,
    {},
    { context: await admin.context() },
  )
  expect(held).toMatchObject({ status: 'maintenance', activeOperation: { kind: 'upgrade' } })
  await expect(
    call(
      fixture.router.installation.upgradeInstallation,
      { confirmation: 'UPGRADE' },
      { context: await admin.context() },
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' })
  await expect(
    call(
      fixture.router.retentionPolicy.updateRetentionPolicy,
      {
        scope: 'installation',
        policy: { eventMonths: 18, profileMonths: 12, replayMonths: 6 },
      },
      { context: await admin.context() },
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' })

  gate.release()
  const completed = await waitForInstallationTerminal(fixture, admin, 'ready')
  expect(completed.activeOperation).toBeNull()
})

test('cancels a held operation before closing its databases', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('teardown-admin@example.com', 'Teardown Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const gate = fixture.faults.hold({ domain: 'upgrade', stage: 'migrate' })
  await call(
    fixture.router.installation.upgradeInstallation,
    { confirmation: 'UPGRADE' },
    { context: await admin.context() },
  )
  await gate.entered

  const root = fixture.rootDirectory
  await fixture.close()

  expect(existsSync(root)).toBe(false)
})

test('reaches degraded upgrade state through real migration-history validation and retries after repair', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('migration-admin@example.com', 'Migration Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  fixture.state.appendFutureMigrationHistory()

  const started = await call(
    fixture.router.installation.upgradeInstallation,
    { confirmation: 'UPGRADE' },
    { context: await admin.context() },
  )
  expect(started.status).toBe('maintenance')
  const degraded = await waitForInstallationTerminal(fixture, admin, 'degraded')
  expect(degraded).toMatchObject({
    status: 'degraded',
    activeOperation: { kind: 'upgrade', errorCode: 'INCOMPATIBLE_BACKUP' },
  })

  fixture.state.repairMigrationHistory()
  const retry = await call(
    fixture.router.installation.upgradeInstallation,
    { confirmation: 'UPGRADE' },
    { context: await admin.context() },
  )
  expect(retry.status).toBe('maintenance')
  await expect(waitForInstallationTerminal(fixture, admin, 'ready')).resolves.toMatchObject({
    status: 'ready',
    activeOperation: null,
  })
})

test('reports backup failure, retries, lists pages, and preserves the source across restart', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('backup-admin@example.com', 'Backup Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  fixture.faults.failNext(
    { domain: 'backup', stage: 'captureBackup' },
    { kind: 'throw', error: 'backupFailed' },
  )

  const failedStarted = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const failed = await waitForBackupTrace(fixture, admin, failedStarted.id)
  expect(failed.terminal).toMatchObject({ status: 'failed', errorCode: 'BACKUP_FAILED' })
  assertCheckpointMonotonic(failed)
  assertProgressMonotonic(failed)

  const firstStarted = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const firstTrace = await waitForBackupTrace(fixture, admin, firstStarted.id)
  assertCheckpointMonotonic(firstTrace)
  assertProgressMonotonic(firstTrace)
  assertAvailableBackup(firstTrace.terminal)
  assertCleanupSettled(firstTrace.terminal)

  const secondStarted = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const secondTrace = await waitForBackupTrace(fixture, admin, secondStarted.id)
  assertCheckpointMonotonic(secondTrace)
  assertProgressMonotonic(secondTrace)
  assertAvailableBackup(secondTrace.terminal)

  const firstPage = await call(
    fixture.router.backupRestore.listBackups,
    { offset: 0, limit: 1 },
    { context: await admin.context() },
  )
  expect(firstPage.items).toHaveLength(1)
  expect(firstPage.hasMore).toBe(true)
  expect(firstPage.nextOffset).toBe(1)
  const secondPage = await call(
    fixture.router.backupRestore.listBackups,
    { offset: firstPage.nextOffset ?? 1, limit: 1 },
    { context: await admin.context() },
  )
  expect(secondPage.items).toHaveLength(1)
  expect(secondPage.totalCount).toBe(3)

  const root = fixture.rootDirectory
  const paths = fixture.paths
  await fixture.stop()
  expect(existsSync(root)).toBe(true)
  expect(existsSync(paths.controlDatabasePath)).toBe(true)
  await fixture.restart()
  const afterRestart = await call(
    fixture.router.backupRestore.getBackupStatus,
    { backupId: firstTrace.terminal.id },
    { context: await admin.context() },
  )
  expect(afterRestart).toMatchObject({ id: firstTrace.terminal.id, status: 'available' })
})

test('detects a corrupted backup artifact after restart', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('corrupt-backup-admin@example.com', 'Corrupt Backup Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const started = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const backup = await waitForBackupTrace(fixture, admin, started.id)
  assertAvailableBackup(backup.terminal)

  const artifactPath = join(fixture.dataDirectoryPath, 'backups', `${backup.terminal.id}.sqlite`)
  await fixture.stop()
  await writeFile(artifactPath, 'corrupted backup artifact')
  await fixture.restart()

  await expect(
    call(
      fixture.router.backupRestore.getBackupStatus,
      { backupId: backup.terminal.id },
      { context: await admin.context() },
    ),
  ).resolves.toMatchObject({ id: backup.terminal.id, status: 'available' })
  await expect(
    call(
      fixture.router.backupRestore.restoreBackup,
      { backupId: backup.terminal.id, confirmation: 'RESTORE' },
      { context: await admin.context() },
    ),
  ).rejects.toMatchObject({ code: 'INCOMPATIBLE_BACKUP' })
})

test('rejects an incompatible restore manifest before creating a restore operation', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('restore-preflight@example.com', 'Restore Preflight')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const backupStarted = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const backup = await waitForBackupTrace(fixture, admin, backupStarted.id)
  assertCheckpointMonotonic(backup)
  assertProgressMonotonic(backup)
  assertAvailableBackup(backup.terminal)
  const incompatible = await fixture.state.createIncompatibleManifestVariant({
    sourceBackupId: backup.terminal.id,
  })
  const before = await call(
    fixture.router.installation.getInstallationStatus,
    {},
    { context: await admin.context() },
  )
  const beforeCount = (
    await call(
      fixture.router.backupRestore.listBackups,
      { offset: 0, limit: 20 },
      { context: await admin.context() },
    )
  ).totalCount

  const invalidRestore = {
    backupId: incompatible.backupId,
    confirmation: 'RESTORE',
  } satisfies BackupRestoreInput
  await expect(
    call(fixture.router.backupRestore.restoreBackup, invalidRestore, {
      context: await admin.context(),
    }),
  ).rejects.toMatchObject({ code: 'INCOMPATIBLE_BACKUP' })

  const after = await call(
    fixture.router.installation.getInstallationStatus,
    {},
    { context: await admin.context() },
  )
  const afterCount = (
    await call(
      fixture.router.backupRestore.listBackups,
      { offset: 0, limit: 20 },
      { context: await admin.context() },
    )
  ).totalCount
  expect(after).toEqual(before)
  expect(afterCount).toBe(beforeCount)
})

test('reports restore checkpoints, readiness, safety, cleanup, and policy rollback', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('restore-admin@example.com', 'Restore Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const originalPolicy = { eventMonths: 18, profileMonths: 12, replayMonths: 6 }
  const changedPolicy = { eventMonths: 24, profileMonths: 18, replayMonths: 6 }
  const savedOriginal = await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'installation', policy: originalPolicy },
    { context: await admin.context() },
  )
  expect(savedOriginal.effectivePolicy).toEqual(originalPolicy)
  const backupStarted = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const backup = await waitForBackupTrace(fixture, admin, backupStarted.id)
  assertCheckpointMonotonic(backup)
  assertProgressMonotonic(backup)
  assertAvailableBackup(backup.terminal)

  const savedChanged = await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'installation', policy: changedPolicy },
    { context: await admin.context() },
  )
  expect(savedChanged.effectivePolicy).toEqual(changedPolicy)
  const gate = fixture.faults.hold({ domain: 'restore', stage: 'restoreSqlite' })
  const restoreStarted = await call(
    fixture.router.backupRestore.restoreBackup,
    { backupId: backup.terminal.id, confirmation: 'RESTORE' },
    { context: await admin.context() },
  )
  expect(restoreStarted).toMatchObject({
    id: expect.any(String),
    status: 'creating',
    checkpoint: 'none',
    restoreSourceBackupId: backup.terminal.id,
    preRestoreSafetyArtifact: null,
  })
  await gate.entered
  const intermediate = await call(
    fixture.router.backupRestore.getBackupStatus,
    { backupId: restoreStarted.id },
    { context: await admin.context() },
  )
  expect(intermediate).toMatchObject({
    status: 'restoring',
    phase: 'restoring_sqlite',
    checkpoint: 'none',
    readiness: { structural: 'not_ready' },
    preRestoreSafetyArtifact: { status: 'ready', errorCode: null },
  })
  gate.release()

  const restored = await waitForBackupTrace(fixture, admin, restoreStarted.id)
  assertCheckpointMonotonic(restored)
  assertProgressMonotonic(restored)
  assertAvailableBackup(restored.terminal)
  assertCleanupSettled(restored.terminal)
  assertRestoreSafety(restored.terminal, backup.terminal.id)
  const policyAfterRestore = await call(
    fixture.router.retentionPolicy.getRetentionPolicy,
    { scope: 'installation' },
    { context: await admin.context() },
  )
  expect(policyAfterRestore.effectivePolicy).toEqual(originalPolicy)
  const backupsAfterRestore = await call(
    fixture.router.backupRestore.listBackups,
    { offset: 0, limit: 20 },
    { context: await admin.context() },
  )
  expect(backupsAfterRestore.items).toContainEqual(
    expect.objectContaining({ id: backup.terminal.id, status: 'available' }),
  )
})

test('rolls back a staged incompatible restore and retries from a valid source', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('restore-retry@example.com', 'Restore Retry')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const sourceStarted = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const source = await waitForBackupTrace(fixture, admin, sourceStarted.id)
  assertCheckpointMonotonic(source)
  assertProgressMonotonic(source)
  assertAvailableBackup(source.terminal)
  const incompatible = await fixture.state.createIncompatibleBackupVariant({
    sourceBackupId: source.terminal.id,
  })

  const failedStarted = await call(
    fixture.router.backupRestore.restoreBackup,
    { backupId: incompatible.backupId, confirmation: 'RESTORE' },
    { context: await admin.context() },
  )
  const failed = await waitForBackupTrace(fixture, admin, failedStarted.id)
  assertCheckpointMonotonic(failed)
  assertProgressMonotonic(failed)
  expect(failed.terminal).toMatchObject({
    status: 'failed',
    errorCode: 'INCOMPATIBLE_BACKUP',
  })

  const retryStarted = await call(
    fixture.router.backupRestore.restoreBackup,
    { backupId: source.terminal.id, confirmation: 'RESTORE' },
    { context: await admin.context() },
  )
  const retry = await waitForBackupTrace(fixture, admin, retryStarted.id)
  assertCheckpointMonotonic(retry)
  assertProgressMonotonic(retry)
  assertAvailableBackup(retry.terminal)
  assertRestoreSafety(retry.terminal, source.terminal.id)
})

test('retries cleanup failures in order and clears cleanupPending', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('cleanup-admin@example.com', 'Cleanup Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const backupStarted = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const backup = await waitForBackupTrace(fixture, admin, backupStarted.id)
  assertCheckpointMonotonic(backup)
  assertProgressMonotonic(backup)
  assertAvailableBackup(backup.terminal)
  fixture.faults.failNext(
    { domain: 'cleanup', stage: 'derivedCleanup' },
    { kind: 'throw', error: 'internal' },
  )
  fixture.faults.failNext(
    { domain: 'cleanup', stage: 'backupCleanup' },
    { kind: 'throw', error: 'internal' },
  )
  const restoreStarted = await call(
    fixture.router.backupRestore.restoreBackup,
    { backupId: backup.terminal.id, confirmation: 'RESTORE' },
    { context: await admin.context() },
  )
  const restored = await fixture.waitFor({
    read: async () =>
      call(
        fixture.router.backupRestore.getBackupStatus,
        { backupId: restoreStarted.id },
        { context: await admin.context() },
      ),
    done: (value) => value.status === 'available',
    operationId: restoreStarted.id,
    label: 'restore completion before cleanup',
  })
  expect(restored).toMatchObject({
    status: 'available',
    phase: 'cleanup_pending',
    cleanupPending: true,
  })
  const failedDerived = await fixture.waitFor({
    read: async () =>
      call(
        fixture.router.backupRestore.getBackupStatus,
        { backupId: restoreStarted.id },
        { context: await admin.context() },
      ),
    done: (value) => value.derivedCleanup.status === 'failed',
    operationId: restoreStarted.id,
    label: 'failed derived cleanup',
  })
  expect(failedDerived.cleanupPending).toBe(true)
  expect(failedDerived.backupCleanup.status).toBe('pending')
  const failedBackup = await fixture.waitFor({
    read: async () =>
      call(
        fixture.router.backupRestore.getBackupStatus,
        { backupId: restoreStarted.id },
        { context: await admin.context() },
      ),
    done: (value) => value.backupCleanup.status === 'failed',
    operationId: restoreStarted.id,
    label: 'failed backup cleanup',
  })
  expect(failedBackup.derivedCleanup.status).toBe('completed')
  const settled = await fixture.waitFor({
    read: async () =>
      call(
        fixture.router.backupRestore.getBackupStatus,
        { backupId: restoreStarted.id },
        { context: await admin.context() },
      ),
    done: (value) => !value.cleanupPending,
    operationId: restoreStarted.id,
    label: 'settled cleanup',
  })
  expect(settled.derivedCleanup.status).toBe('completed')
  expect(settled.backupCleanup.status).toBe('completed')
})

test('recovers an interrupted upgrade after reopening the same files', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('upgrade-recovery@example.com', 'Upgrade Recovery')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const firstGeneration = fixture.generation
  await fixture.stop()
  await fixture.state.seedInterrupted({ kind: 'upgrade', checkpoint: 'none' })
  const operationId = fixture.state.interruptedOperationId
  await fixture.restart()
  expect(fixture.generation).toBeGreaterThan(firstGeneration)
  await expect(waitForInstallationTerminal(fixture, admin, 'ready')).resolves.toMatchObject({
    status: 'ready',
    activeOperation: null,
  })
  expect(operationId).toMatch(/^bop_/)
})

test('recovers interrupted backup and restore operations after reopening files', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('recovery-admin@example.com', 'Recovery Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const sourceStarted = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: await admin.context() },
  )
  const source = await waitForBackupTrace(fixture, admin, sourceStarted.id)
  assertCheckpointMonotonic(source)
  assertProgressMonotonic(source)
  assertAvailableBackup(source.terminal)

  await fixture.stop()
  await fixture.state.seedInterrupted({ kind: 'backup', checkpoint: 'none' })
  const backupOperationId = fixture.state.interruptedOperationId
  await fixture.restart()
  const recoveredBackup = await waitForBackupTrace(fixture, admin, backupOperationId)
  assertCheckpointMonotonic(recoveredBackup)
  assertProgressMonotonic(recoveredBackup)
  assertAvailableBackup(recoveredBackup.terminal)

  await fixture.stop()
  await fixture.state.seedInterrupted({
    kind: 'restore',
    sourceBackupId: source.terminal.id,
    checkpoint: 'none',
  })
  const restoreOperationId = fixture.state.interruptedOperationId
  await fixture.restart()
  const recoveredRestore = await waitForBackupTrace(fixture, admin, restoreOperationId)
  assertCheckpointMonotonic(recoveredRestore)
  assertProgressMonotonic(recoveredRestore)
  assertAvailableBackup(recoveredRestore.terminal)
  assertRestoreSafety(recoveredRestore.terminal, source.terminal.id)
})

test('closes resources before removing the root and makes disposal idempotent', async () => {
  const fixture = await createApiE2eFixture()
  try {
    const root = fixture.rootDirectory
    expect(existsSync(fixture.controlDatabasePath)).toBe(true)
    expect(existsSync(fixture.paths.analyticsDatabasePath)).toBe(true)
    await fixture.close()
    await fixture.close()
    expect(existsSync(root)).toBe(false)
    await expect(fixture.restart()).rejects.toThrow('closed')
  } finally {
    await fixture.close()
  }
})

test('continues fixture cleanup after a composition close failure', async () => {
  let failed = false
  const fixture = await createApiE2eFixture({
    wrapCompositionClose(composition) {
      return {
        ...composition,
        async close() {
          await composition.close()
          if (failed) return
          failed = true
          throw new Error('composition close failed')
        },
      }
    },
  })
  const root = fixture.rootDirectory

  await expect(fixture.close()).rejects.toBeInstanceOf(AggregateError)
  expect(existsSync(root)).toBe(false)
  await expect(fixture.close()).resolves.toBeUndefined()
})

test('reports the last lifecycle state and operation identity on polling timeout', async () => {
  await using fixture = await createApiE2eFixture({ timeoutMs: 1 })
  await expect(
    fixture.waitFor({
      read: async () => ({ id: 'bop_timeout', status: 'creating' }),
      done: () => false,
      timeoutMs: 1,
      intervalMs: 1,
      label: 'diagnostic operation',
    }),
  ).rejects.toMatchObject({
    name: E2ePollingTimeoutError.name,
    operationId: 'bop_timeout',
    lastState: { id: 'bop_timeout', status: 'creating' },
  })
})
