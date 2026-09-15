import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createBackupDrizzleFixture, createBackupInsertInput } from './fixture.ts'

describe('BackupRestoreRepositoryDrizzle.beginBackup', () => {
  it('creates one active backup and projects its state to the installation', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()

    const operation = await fixture.repository.beginBackup(createBackupInsertInput())

    expect(operation).toMatchObject({
      id: 'bop_1',
      operationType: 'backup',
      status: 'creating',
      phase: 'capturing_sqlite',
      checkpoint: 'none',
      progress: 0,
    })
    expect(
      fixture.db
        .select({
          status: schema.TInstallation.status,
          operationId: schema.TInstallation.activeOperationId,
        })
        .from(schema.TInstallation)
        .all(),
    ).toEqual([{ status: 'maintenance', operationId: 'bop_1' }])
  })
})
