import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { eq } from 'drizzle-orm'
import {
  createBackupDrizzleFixture,
  createBackupInsertInput,
  createSourceManifest,
} from './fixture.ts'

describe('BackupRestoreRepositoryDrizzle.claimCleanupStage', () => {
  it('requires derived cleanup before backup cleanup', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const operation = await fixture.repository.beginBackup(createBackupInsertInput())
    if (operation === undefined) throw new Error('expected backup operation')
    await fixture.repository.recordBackupArtifact({
      operationId: operation.id,
      ownerToken: 'owner_1',
      artifact: createSourceManifest(),
      now: new Date('2026-09-01T00:00:01.000Z'),
    })
    await fixture.repository.complete({
      operationId: operation.id,
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:00:02.000Z'),
    })

    await expect(
      fixture.repository.claimCleanupStage({
        operationId: operation.id,
        stage: 'backup_cleanup',
        ownerToken: 'cleanup_owner',
        now: new Date('2026-09-01T00:00:03.000Z'),
      }),
    ).resolves.toBeUndefined()
  })

  it('reclaims a cleanup stage after its owner lease expires', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const operation = await fixture.repository.beginBackup(createBackupInsertInput())
    if (operation === undefined) throw new Error('expected backup operation')
    await fixture.repository.recordBackupArtifact({
      operationId: operation.id,
      ownerToken: 'owner_1',
      artifact: createSourceManifest(),
      now: new Date('2026-09-01T00:00:01.000Z'),
    })
    await fixture.repository.complete({
      operationId: operation.id,
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:00:02.000Z'),
    })
    fixture.db
      .update(schema.TBackupCleanupStage)
      .set({ status: 'pending' })
      .where(eq(schema.TBackupCleanupStage.operationId, operation.id))
      .run()
    await expect(
      fixture.repository.claimCleanupStage({
        operationId: operation.id,
        stage: 'derived_cleanup',
        ownerToken: 'cleanup_owner_1',
        now: new Date('2026-09-01T00:00:03.000Z'),
      }),
    ).resolves.toEqual({ operationId: operation.id, stage: 'derived_cleanup' })

    await expect(
      fixture.repository.claimCleanupStage({
        operationId: operation.id,
        stage: 'derived_cleanup',
        ownerToken: 'cleanup_owner_2',
        now: new Date('2026-09-01T00:16:03.000Z'),
      }),
    ).resolves.toEqual({ operationId: operation.id, stage: 'derived_cleanup' })
  })
})
