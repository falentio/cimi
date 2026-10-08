import { call } from '@orpc/server'
import { expect, test } from 'vitest'
import { assertAvailableBackup, waitForBackupTrace } from './database-management.lifecycle.ts'
import { createApiE2eFixture } from './fixture.ts'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

test('takes a backup while continuous ingestion holds ingestion leases', async () => {
  await using fixture = await createApiE2eFixture({ backupLeaseAcquisitionTimeoutMs: 5_000 })
  const admin = await fixture.createUser('lease-admin@example.com', 'Lease Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )

  const organization = await call(
    fixture.router.organization.createOrganization,
    { name: 'Lease Organization' },
    { context: await admin.context() },
  )

  const site = await call(
    fixture.router.site.createSite,
    { organizationId: organization.id, name: 'Lease Site', hostname: 'lease.example.com' },
    { context: await admin.context() },
  )

  const anonymous = fixture.unauthenticatedContext()

  let stopped = false
  let batch = 0

  const ingestContinuously = async (): Promise<void> => {
    while (!stopped) {
      batch += 1

      const events = Array.from({ length: 50 }, (_, index) => ({
        eventId: `evt_lease_${batch}_${index}`,
        kind: 'custom_event' as const,
        name: 'lease_probe',
      }))

      await call(
        fixture.router.eventIngestion.collectEvents,
        { ingestionIdentifier: site.ingestionIdentifier, events },
        { context: anonymous },
      )
    }
  }

  const load = [
    ingestContinuously(),
    ingestContinuously(),
    ingestContinuously(),
    ingestContinuously(),
  ]

  let started: { readonly id: string }

  try {
    await sleep(250)
    started = await call(
      fixture.router.backupRestore.createBackup,
      {},
      { context: await admin.context() },
    )
  } finally {
    stopped = true
    await Promise.allSettled(load)
  }

  const trace = await waitForBackupTrace(fixture, admin, started.id)
  assertAvailableBackup(trace.terminal)
  expect(trace.terminal.id).toBe(started.id)
}, 20_000)
