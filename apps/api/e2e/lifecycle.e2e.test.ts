import { call } from '@orpc/server'
import { rm } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { waitForInstallationTerminal } from './database-management.lifecycle.ts'
import { createApiE2eFixture } from './fixture.ts'

test('resumes an upgrade from a completed analytics checkpoint without rerunning migration', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('checkpoint-admin@example.com', 'Checkpoint Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )

  await fixture.stop()
  await fixture.state.seedInterrupted({ kind: 'upgrade', checkpoint: 'duckdb_rebuilt' })
  fixture.faults.failNext(
    { domain: 'upgrade', stage: 'migrate' },
    { kind: 'throw', error: 'internal' },
  )
  await fixture.restart()

  await expect(waitForInstallationTerminal(fixture, admin, 'ready')).resolves.toMatchObject({
    status: 'ready',
    activeOperation: null,
  })
})

test('rebuilds analytics after reopening from a physical-store loss', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('physical-store-admin@example.com', 'Physical Store Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const organization = await call(
    fixture.router.organization.createOrganization,
    { name: 'Physical Store Organization' },
    { context: await admin.context() },
  )
  const site = await call(
    fixture.router.site.createSite,
    { organizationId: organization.id, name: 'Production', hostname: 'physical.example.com' },
    { context: await admin.context() },
  )
  await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    {
      scope: 'installation',
      policy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    },
    { context: await admin.context() },
  )
  const reportDate = new Date().toISOString().slice(0, 10)
  await call(
    fixture.router.eventIngestion.collectEvent,
    {
      eventId: 'evt_physical_store_page_view',
      ingestionIdentifier: site.ingestionIdentifier,
      kind: 'page_view',
      pagePath: '/pricing',
      occurrenceTime: `${reportDate}T00:00:00.000Z`,
      anonymousIdentityId: 'anonymous_physical_store',
    },
    { context: fixture.unauthenticatedContext() },
  )
  await fixture.analytics.rebuild()

  await expect(
    call(
      fixture.router.eventReport.getEventOverview,
      { siteId: site.id, eventKind: 'page_view', fromDate: reportDate, toDate: reportDate },
      { context: await admin.context() },
    ),
  ).resolves.toMatchObject({ total: 1 })

  await fixture.stop()
  await rm(fixture.paths.analyticsDatabasePath, { force: true })
  await rm(fixture.paths.analyticsTempDirectoryPath, { recursive: true, force: true })
  await fixture.state.seedInterrupted({ kind: 'upgrade', checkpoint: 'sqlite_captured' })
  await fixture.restart()

  await expect(waitForInstallationTerminal(fixture, admin, 'ready')).resolves.toMatchObject({
    status: 'ready',
    activeOperation: null,
  })
  await expect(
    call(
      fixture.router.eventReport.getEventOverview,
      { siteId: site.id, eventKind: 'page_view', fromDate: reportDate, toDate: reportDate },
      { context: await admin.context() },
    ),
  ).resolves.toMatchObject({ total: 1 })

  await fixture.stop()
  await rm(fixture.paths.analyticsDatabasePath, { force: true })
  await rm(fixture.paths.analyticsTempDirectoryPath, { recursive: true, force: true })
  await fixture.state.seedInterrupted({ kind: 'upgrade', checkpoint: 'duckdb_rebuilt' })
  await fixture.restart()

  await expect(waitForInstallationTerminal(fixture, admin, 'ready')).resolves.toMatchObject({
    status: 'ready',
    activeOperation: null,
  })
  await expect(
    call(
      fixture.router.eventReport.getEventOverview,
      { siteId: site.id, eventKind: 'page_view', fromDate: reportDate, toDate: reportDate },
      { context: await admin.context() },
    ),
  ).resolves.toMatchObject({ total: 1 })
})

test('serializes overlapping stop and restart transitions', async () => {
  await using fixture = await createApiE2eFixture()
  const firstGeneration = fixture.generation

  const stopping = fixture.stop()
  const restarting = fixture.restart()

  await expect(stopping).resolves.toBeUndefined()
  await expect(restarting).resolves.toBeUndefined()
  expect(fixture.generation).toBeGreaterThan(firstGeneration)
  await fixture.ready
})
