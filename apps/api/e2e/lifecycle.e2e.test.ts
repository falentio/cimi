import { call } from '@orpc/server'
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
