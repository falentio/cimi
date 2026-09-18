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
