import { describe, expect, it } from 'vitest'
import {
  createBackupDrizzleFixture,
  createBackupInsertInput,
  createSafetyManifest,
  createSourceManifest,
} from './fixture.ts'

describe('BackupRestoreRepositoryDrizzle.restoreLifecycle', () => {
  it('persists restore intent and exposes ordered cleanup after readiness', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const source = await fixture.repository.beginBackup(createBackupInsertInput())
    if (source === undefined) throw new Error('expected source operation')
    await fixture.repository.recordBackupArtifact({
      operationId: source.id,
      ownerToken: 'owner_1',
      artifact: createSourceManifest(),
      now: new Date('2026-09-01T00:00:01.000Z'),
    })
    await fixture.repository.complete({
      operationId: source.id,
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:00:02.000Z'),
    })

    const restore = await fixture.repository.beginRestore({
      operationId: 'bop_restore',
      ownerToken: 'owner_restore',
      sourceBackupId: source.id,
      now: new Date('2026-09-01T00:00:03.000Z'),
    })
    if (restore === undefined) throw new Error('expected restore operation')
    expect(restore.restoreSourceBackupId).toBe(source.id)
    expect(restore.preRestoreSafetyArtifact).toBeNull()

    await fixture.repository.recordSafetyArtifact({
      operationId: restore.id,
      ownerToken: 'owner_restore',
      artifact: createSafetyManifest({ operationId: restore.id }),
      now: new Date('2026-09-01T00:00:04.000Z'),
    })
    await fixture.repository.advance({
      operationId: restore.id,
      ownerToken: 'owner_restore',
      phase: 'rebuilding_duckdb',
      checkpoint: 'sqlite_restored',
      progress: 0.6,
      lastSafeSequence: 42,
      now: new Date('2026-09-01T00:00:05.000Z'),
    })
    await fixture.repository.advance({
      operationId: restore.id,
      ownerToken: 'owner_restore',
      phase: 'rebuilding_duckdb',
      checkpoint: 'duckdb_rebuilt',
      progress: 0.9,
      lastSafeSequence: 42,
      now: new Date('2026-09-01T00:00:06.000Z'),
    })
    await fixture.repository.advance({
      operationId: restore.id,
      ownerToken: 'owner_restore',
      phase: 'ready',
      checkpoint: 'structurally_ready',
      progress: 1,
      lastSafeSequence: 42,
      now: new Date('2026-09-01T00:00:07.000Z'),
    })
    const completed = await fixture.repository.complete({
      operationId: restore.id,
      ownerToken: 'owner_restore',
      now: new Date('2026-09-01T00:00:08.000Z'),
    })

    expect(completed).toMatchObject({
      status: 'available',
      phase: 'cleanup_pending',
      cleanupPending: true,
      derivedCleanup: { status: 'pending' },
      backupCleanup: { status: 'pending' },
    })
    await expect(
      fixture.repository.claimCleanupStage({
        operationId: restore.id,
        stage: 'backup_cleanup',
        ownerToken: 'cleanup_owner',
        now: new Date('2026-09-01T00:00:09.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(
      fixture.repository.claimCleanupStage({
        operationId: restore.id,
        stage: 'derived_cleanup',
        ownerToken: 'cleanup_owner',
        now: new Date('2026-09-01T00:00:09.000Z'),
      }),
    ).resolves.toEqual({ operationId: restore.id, stage: 'derived_cleanup' })
  })
})
