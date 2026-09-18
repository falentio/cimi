import { call } from '@orpc/server'
import { expect, test } from 'vitest'
import { createApiE2eFixture } from './fixture.ts'

test('initializes the installation convergently and enforces admin access', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('database-admin@example.com', 'Database Admin')
  const member = await fixture.createUser('database-member@example.com', 'Database Member')

  const created = await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: admin.context },
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
    { context: admin.context },
  )
  expect(reused.status).toBe(200)
  expect(reused.body).toEqual(created.body)

  await expect(
    call(fixture.router.installation.getInstallationStatus, {}, { context: member.context }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(
    call(
      fixture.router.installation.getInstallationStatus,
      {},
      {
        context: { user: undefined, headers: new Headers() },
      },
    ),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})

test('persists installation and site retention and collection policy state', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('policy-admin@example.com', 'Policy Admin')

  await call(fixture.router.installation.initializeInstallation, {}, { context: admin.context })
  const organization = await call(
    fixture.router.organization.createOrganization,
    { name: 'Policy Organization' },
    { context: admin.context },
  )
  const site = await call(
    fixture.router.site.createSite,
    {
      organizationId: organization.id,
      name: 'Policy Site',
      hostname: 'policy.example.com',
    },
    { context: admin.context },
  )

  const installationRetention = { eventMonths: 18, profileMonths: 12, replayMonths: 6 }
  await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'installation', policy: installationRetention },
    { context: admin.context },
  )
  const siteRetention = { eventMonths: 24, profileMonths: 18, replayMonths: 12 }
  const siteRetentionResult = await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'site', siteId: site.id, policy: siteRetention },
    { context: admin.context },
  )
  expect(siteRetentionResult.effectivePolicy).toEqual(siteRetention)

  await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'site', siteId: site.id, policy: null },
    { context: admin.context },
  )
  const clearedRetention = await call(
    fixture.router.retentionPolicy.getRetentionPolicy,
    { scope: 'site', siteId: site.id },
    { context: admin.context },
  )
  expect(clearedRetention.effectivePolicy).toEqual(installationRetention)

  const collectionValues = {
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
    { scope: 'installation', policy: collectionValues },
    { context: admin.context },
  )
  const siteCollection = await call(
    fixture.router.collectionPolicy.updateCollectionPolicy,
    { scope: 'site', policy: { siteId: site.id, ...collectionValues, captureQueryStrings: false } },
    { context: admin.context },
  )
  expect(siteCollection).toMatchObject({
    scope: 'site',
    siteId: site.id,
    captureQueryStrings: false,
  })

  const effectiveCollection = await call(
    fixture.router.collectionPolicy.getCollectionPolicy,
    { siteId: site.id },
    { context: admin.context },
  )
  expect(effectiveCollection).toMatchObject({
    effective: { siteId: site.id, captureQueryStrings: false },
    source: { captureQueryStrings: 'site' },
  })
  await call(
    fixture.router.collectionPolicy.updateCollectionPolicy,
    { scope: 'site', policy: { siteId: site.id, clear: true } },
    { context: admin.context },
  )
  const clearedCollection = await call(
    fixture.router.collectionPolicy.getCollectionPolicy,
    { siteId: site.id },
    { context: admin.context },
  )
  expect(clearedCollection.source.captureQueryStrings).toBe('installation')
})

test('completes an installation upgrade through the implemented procedures', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('upgrade-admin@example.com', 'Upgrade Admin')

  await call(fixture.router.installation.initializeInstallation, {}, { context: admin.context })
  const started = await call(
    fixture.router.installation.upgradeInstallation,
    { confirmation: 'UPGRADE' },
    { context: admin.context },
  )
  expect(started.status).toBe('maintenance')

  const completed = await fixture.waitFor(
    () => call(fixture.router.installation.getInstallationStatus, {}, { context: admin.context }),
    (status) => status.activeOperation === null,
  )
  expect(completed.status).toBe('ready')
})

test('backs up and restores persisted policy state', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('backup-admin@example.com', 'Backup Admin')

  await call(fixture.router.installation.initializeInstallation, {}, { context: admin.context })
  const originalPolicy = { eventMonths: 12, profileMonths: 12, replayMonths: null }
  const changedPolicy = { eventMonths: 24, profileMonths: 18, replayMonths: 6 }

  await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'installation', policy: originalPolicy },
    { context: admin.context },
  )
  const started = await call(
    fixture.router.backupRestore.createBackup,
    {},
    { context: admin.context },
  )
  const available = await fixture.waitFor(
    () =>
      call(
        fixture.router.backupRestore.getBackupStatus,
        { backupId: started.id },
        { context: admin.context },
      ),
    (backup) => backup.status === 'available' || backup.status === 'failed',
  )
  expect(available).toMatchObject({
    status: 'available',
    checkpoint: 'structurally_ready',
    cleanupPending: false,
    readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
  })

  const listed = await call(
    fixture.router.backupRestore.listBackups,
    { offset: 0, limit: 20 },
    { context: admin.context },
  )
  expect(listed.items).toContainEqual(
    expect.objectContaining({ id: available.id, status: 'available' }),
  )

  await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    { scope: 'installation', policy: changedPolicy },
    { context: admin.context },
  )
  const restoreStarted = await call(
    fixture.router.backupRestore.restoreBackup,
    { backupId: available.id, confirmation: 'RESTORE' },
    { context: admin.context },
  )
  const restored = await fixture.waitFor(
    () =>
      call(
        fixture.router.backupRestore.getBackupStatus,
        { backupId: restoreStarted.id },
        { context: admin.context },
      ),
    (backup) =>
      backup.status === 'failed' || (backup.status === 'available' && !backup.cleanupPending),
  )
  expect(restored).toMatchObject({
    status: 'available',
    checkpoint: 'structurally_ready',
    cleanupPending: false,
    restoreSourceBackupId: available.id,
    readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
    preRestoreSafetyArtifact: { status: 'ready' },
  })

  const policyAfterRestore = await call(
    fixture.router.retentionPolicy.getRetentionPolicy,
    { scope: 'installation' },
    { context: admin.context },
  )
  expect(policyAfterRestore.effectivePolicy).toEqual(originalPolicy)
})
