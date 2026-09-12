import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { eq } from 'drizzle-orm'
import {
  createBackupDrizzleFixture,
  createBackupInsertInput,
  createSafetyManifest,
  createSourceManifest,
} from './fixture.ts'
import type { RetentionManifest } from '../retention-manifest.ts'

describe('BackupRestoreRepositoryDrizzle', () => {
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

  it('fences stale workers and keeps checkpoint and progress monotonic', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const started = await fixture.repository.beginBackup(createBackupInsertInput())
    if (started === undefined) throw new Error('expected backup operation')

    const advanced = await fixture.repository.advance({
      operationId: started.id,
      ownerToken: 'owner_1',
      phase: 'capturing_sqlite',
      checkpoint: 'none',
      progress: 0.2,
      lastSafeSequence: 7,
      now: new Date('2026-09-01T00:00:01.000Z'),
    })
    expect(advanced).toMatchObject({ progress: 0.2, lastSafeSequence: 7 })

    await expect(
      fixture.repository.advance({
        operationId: started.id,
        ownerToken: 'stale_owner',
        phase: 'capturing_sqlite',
        checkpoint: 'none',
        progress: 0.1,
        lastSafeSequence: 3,
        now: new Date('2026-09-01T00:00:02.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(
      fixture.repository.advance({
        operationId: started.id,
        ownerToken: 'owner_1',
        phase: 'capturing_sqlite',
        checkpoint: 'none',
        progress: 0.1,
        lastSafeSequence: 3,
        now: new Date('2026-09-01T00:00:02.000Z'),
      }),
    ).resolves.toBeUndefined()
  })

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

  it('lists only backup operations with stable offset pagination', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const first = await fixture.repository.beginBackup(createBackupInsertInput())
    if (first === undefined) throw new Error('expected backup operation')
    await fixture.repository.recordBackupArtifact({
      operationId: first.id,
      ownerToken: 'owner_1',
      artifact: createSourceManifest(),
      now: new Date('2026-09-01T00:00:01.000Z'),
    })
    await fixture.repository.complete({
      operationId: first.id,
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:00:02.000Z'),
    })

    const page = await fixture.repository.list({ offset: 0, limit: 1 })

    expect(page).toMatchObject({ totalCount: 1, hasMore: false, nextOffset: null })
    expect(page.items).toHaveLength(1)
  })

  it('round trips the retention manifest through artifact metadata', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const operation = await fixture.repository.beginBackup(createBackupInsertInput())
    if (operation === undefined) throw new Error('expected backup operation')
    const retentionManifest: RetentionManifest = {
      version: 1,
      boundaries: [
        {
          siteId: 'site_1',
          installationId: 'ins_1',
          policyId: 'policy_1',
          reportingTimezone: 'UTC',
          localDay: '2026-09-01',
          eventOccurrenceCutoffAt: new Date('2026-08-01T00:00:00.000Z'),
          rawReceiptCutoffAt: new Date('2026-08-02T00:00:00.000Z'),
          profileActivityCutoffAt: new Date('2026-08-03T00:00:00.000Z'),
          replayReceiptCutoffAt: null,
          effectiveAt: new Date('2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:00:01.000Z'),
        },
      ],
    }
    await fixture.repository.recordBackupArtifact({
      operationId: operation.id,
      ownerToken: 'owner_1',
      artifact: createSourceManifest({ retentionManifest }),
      now: new Date('2026-09-01T00:00:01.000Z'),
    })

    const storedMetadata = fixture.db
      .select({ metadata: schema.TBackupArtifact.metadata })
      .from(schema.TBackupArtifact)
      .all()
    expect(storedMetadata).toEqual([
      {
        metadata: {
          retentionManifest: {
            version: 1,
            boundaries: [
              {
                siteId: 'site_1',
                installationId: 'ins_1',
                policyId: 'policy_1',
                reportingTimezone: 'UTC',
                localDay: '2026-09-01',
                eventOccurrenceCutoffAt: '2026-08-01T00:00:00.000Z',
                rawReceiptCutoffAt: '2026-08-02T00:00:00.000Z',
                profileActivityCutoffAt: '2026-08-03T00:00:00.000Z',
                replayReceiptCutoffAt: null,
                effectiveAt: '2026-09-01T00:00:00.000Z',
                updatedAt: '2026-09-01T00:00:01.000Z',
              },
            ],
          },
        },
      },
    ])

    await fixture.repository.complete({
      operationId: operation.id,
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:00:02.000Z'),
    })
    await expect(fixture.repository.findSourceManifest(operation.id)).resolves.toMatchObject({
      retentionManifest,
    })
  })
})
