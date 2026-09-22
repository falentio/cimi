import { rm } from 'node:fs/promises'
import { call } from '@orpc/server'
import { closeDb, createDb } from '@cimi/db'
import { createProbeMigrationsFolder, PROBE_MIGRATION_TABLE } from '@cimi/db/testing'
import { expect, test } from 'vitest'
import {
  assertAvailableBackup,
  assertCheckpointMonotonic,
  assertCleanupSettled,
  assertRestoreSafety,
  waitForBackupTrace,
  waitForInstallationTerminal,
} from './database-management.lifecycle.ts'
import { createApiE2eFixture } from './fixture.ts'

function expectProbeTable(controlDatabasePath: string, present: boolean): void {
  const db = createDb({ path: controlDatabasePath })
  try {
    const row = db.$client
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(PROBE_MIGRATION_TABLE)
    expect(row !== undefined).toBe(present)
  } finally {
    closeDb(db)
  }
}

test('upgrade and restore migrate through a materialized migrations folder', async () => {
  const migrationsFolder = await createProbeMigrationsFolder()
  try {
    await using fixture = await createApiE2eFixture({ migrationsFolder })
    const admin = await fixture.createUser(
      'migrations-folder-admin@example.com',
      'Migrations Folder Admin',
    )
    await call(
      fixture.router.installation.initializeInstallation,
      {},
      { context: await admin.context() },
    )

    const upgradeStarted = await call(
      fixture.router.installation.upgradeInstallation,
      { confirmation: 'UPGRADE' },
      { context: await admin.context() },
    )
    expect(upgradeStarted.status).toBe('maintenance')
    await expect(waitForInstallationTerminal(fixture, admin, 'ready')).resolves.toMatchObject({
      status: 'ready',
      activeOperation: null,
    })
    expectProbeTable(fixture.controlDatabasePath, true)

    const backupStarted = await call(
      fixture.router.backupRestore.createBackup,
      {},
      { context: await admin.context() },
    )
    const backup = await waitForBackupTrace(fixture, admin, backupStarted.id)
    assertCheckpointMonotonic(backup)
    assertAvailableBackup(backup.terminal)
    assertCleanupSettled(backup.terminal)

    const restoreStarted = await call(
      fixture.router.backupRestore.restoreBackup,
      { backupId: backup.terminal.id, confirmation: 'RESTORE' },
      { context: await admin.context() },
    )
    expect(restoreStarted.status).toBe('creating')
    const restored = await waitForBackupTrace(fixture, admin, restoreStarted.id)
    assertAvailableBackup(restored.terminal)
    assertCleanupSettled(restored.terminal)
    assertRestoreSafety(restored.terminal, backup.terminal.id)
    expectProbeTable(fixture.controlDatabasePath, true)
  } finally {
    await rm(migrationsFolder, { recursive: true, force: true })
  }
})
