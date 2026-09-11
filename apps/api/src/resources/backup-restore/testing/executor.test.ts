import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, createDb, migrateControlDb, schema } from '@cimi/db'
import { createTestAnalyticsDb } from '@cimi/db/testing'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { ConfiguredSqliteExecutor } from '../executor.ts'
import {
  createSiteOrganizationRow,
  createSiteRow,
  createSiteUserRow,
} from '../../site/fixture.drizzle.ts'

describe('ConfiguredSqliteExecutor', () => {
  it('preserves a current deleted Site when restoring an active backup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-deleted-site-restore-test-'))
    const controlDatabasePath = join(directory, 'control.sqlite')
    const db = createDb({ path: controlDatabasePath })
    migrateControlDb(db)
    const analytics = await createTestAnalyticsDb()
    try {
      db.insert(schema.TUser).values(createSiteUserRow()).run()
      db.insert(schema.TOrganization).values(createSiteOrganizationRow()).run()
      db.insert(schema.TSite).values(createSiteRow()).run()
      const executor = new ConfiguredSqliteExecutor({
        db,
        analytics,
        controlDatabasePath,
        dataDirectoryPath: directory,
      })
      const source = await executor.captureBackup({
        operationId: 'bop_deleted_site',
        artifactId: 'bar_deleted_site',
        lastSafeSequence: 1,
      })
      const deletedAt = new Date('2026-09-01T00:00:00.000Z')
      db.insert(schema.TSiteLifecycleOperation)
        .values({
          id: 'sop_delete',
          siteId: 'ste_1',
          operationType: 'delete',
          status: 'completed',
          requestedAt: deletedAt,
          startedAt: deletedAt,
          completedAt: deletedAt,
          errorSummary: null,
          createdAt: deletedAt,
          updatedAt: deletedAt,
        })
        .run()
      db.update(schema.TSite)
        .set({
          status: 'deleted',
          deleteRequestedAt: new Date('2026-08-31T00:00:00.000Z'),
          deletedAt,
          recoveryDeadline: new Date('2026-10-01T00:00:00.000Z'),
          purgeAt: new Date('2026-10-01T00:00:00.000Z'),
          currentOperationId: 'sop_delete',
          cleanupStatus: 'pending',
          cleanupUpdatedAt: deletedAt,
        })
        .where(eq(schema.TSite.id, 'ste_1'))
        .run()

      await executor.restoreSqlite({ operationId: 'bop_deleted_site', source })

      expect(
        db
          .select({
            status: schema.TSite.status,
            recoveryDeadline: schema.TSite.recoveryDeadline,
            purgeAt: schema.TSite.purgeAt,
            currentOperationId: schema.TSite.currentOperationId,
          })
          .from(schema.TSite)
          .where(eq(schema.TSite.id, 'ste_1'))
          .all(),
      ).toEqual([
        {
          status: 'deleted',
          recoveryDeadline: new Date('2026-10-01T00:00:00.000Z'),
          purgeAt: new Date('2026-10-01T00:00:00.000Z'),
          currentOperationId: 'sop_delete',
        },
      ])
    } finally {
      await analytics.close()
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('preserves completed identity redactions after restoring a cleaned older backup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-redacted-identity-restore-test-'))
    const controlDatabasePath = join(directory, 'control.sqlite')
    const db = createDb({ path: controlDatabasePath })
    migrateControlDb(db)
    const analytics = await createTestAnalyticsDb()
    const redactedAt = new Date('2026-09-05T00:00:00.000Z')
    try {
      db.insert(schema.TUser).values(createSiteUserRow()).run()
      db.insert(schema.TOrganization).values(createSiteOrganizationRow()).run()
      db.insert(schema.TSite).values(createSiteRow()).run()
      db.insert(schema.TInstallation)
        .values({
          id: 'ins_1',
          status: 'ready',
          eventRetentionMonths: 12,
          profileRetentionMonths: 12,
          replayRetentionMonths: null,
          dataDirectoryReady: true,
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        })
        .run()
      db.insert(schema.TCollectionPolicyRevision)
        .values({
          id: 'policy_1',
          installationId: 'ins_1',
          scope: 'site',
          siteId: 'ste_1',
          version: 1,
          policyJson: {},
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          effectiveTo: null,
          committedAt: new Date('2026-09-01T00:00:00.000Z'),
          createdBy: null,
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        })
        .run()
      db.insert(schema.TIdentityProfile)
        .values({
          profileId: 'profile_1',
          siteId: 'ste_1',
          identifiedUserId: 'user_1',
          status: 'active',
          profileEpoch: 1,
          traits: { plan: 'pro' },
          firstSeenAt: new Date('2026-09-01T00:00:00.000Z'),
          lastSeenAt: new Date('2026-09-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        })
        .run()
      db.insert(schema.TIdentityProfileEpoch)
        .values({
          profileId: 'profile_1',
          siteId: 'ste_1',
          identifiedUserId: 'user_1',
          epoch: 1,
          status: 'active',
          startedAt: new Date('2026-09-01T00:00:00.000Z'),
          endedAt: null,
          redactedAt: null,
        })
        .run()
      const acceptedEvent = db
        .insert(schema.TAcceptedEvent)
        .values({
          siteId: 'ste_1',
          eventId: 'event_1',
          eventKind: 'custom_event',
          anonymousIdentityId: null,
          pageViewId: null,
          occurrenceTime: new Date('2026-09-01T00:00:00.000Z'),
          receiptTime: new Date('2026-09-02T00:00:00.000Z'),
          late: false,
          visitorId: 'visitor_1',
          identifiedUserId: 'user_1',
          analyticsSessionId: 'session_1',
          botPolicyOutcome: 'included',
          policyRevisionId: 'policy_1',
          replaySequence: 1,
          payloadFingerprint: 'fingerprint_1',
          projectionState: 'projected',
          projectedAt: new Date('2026-09-02T00:00:00.000Z'),
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
        })
        .returning({ eventPk: schema.TAcceptedEvent.eventPk })
        .all()[0]
      if (acceptedEvent === undefined) throw new Error('Accepted Event insert returned no row')
      db.insert(schema.TEventPayload)
        .values({
          eventPk: acceptedEvent.eventPk,
          canonicalPayloadJson: JSON.stringify({
            eventId: 'event_1',
            kind: 'custom_event',
            identifiedUserId: 'user_1',
          }),
        })
        .run()
      const executor = new ConfiguredSqliteExecutor({
        db,
        analytics,
        controlDatabasePath,
        dataDirectoryPath: directory,
      })
      const source = await executor.captureBackup({
        operationId: 'bop_redacted_identity',
        artifactId: 'bar_redacted_identity',
        lastSafeSequence: 1,
      })
      db.update(schema.TIdentityProfile)
        .set({ status: 'deleted', traits: null, updatedAt: redactedAt })
        .where(eq(schema.TIdentityProfile.profileId, 'profile_1'))
        .run()
      db.update(schema.TIdentityProfileEpoch)
        .set({ status: 'redacted', endedAt: redactedAt, redactedAt })
        .where(eq(schema.TIdentityProfileEpoch.profileId, 'profile_1'))
        .run()
      db.insert(schema.TIdentityRedaction)
        .values({
          id: 'redaction_1',
          siteId: 'ste_1',
          profileId: 'profile_1',
          identifiedUserId: 'user_1',
          profileEpoch: 1,
          reason: 'explicit',
          status: 'applied',
          requestedAt: redactedAt,
          appliedAt: redactedAt,
          derivedCleanupStatus: 'complete',
          backupCleanupStatus: 'complete',
          derivedCleanupUpdatedAt: redactedAt,
          backupCleanupUpdatedAt: redactedAt,
          createdAt: redactedAt,
          updatedAt: redactedAt,
        })
        .run()

      const scrubbedSource = await executor.captureBackup({
        operationId: 'bop_scrubbed_identity',
        artifactId: 'bar_scrubbed_identity',
        lastSafeSequence: 2,
      })
      const scrubbedDb = createDb({ path: join(directory, scrubbedSource.storageKey) })
      try {
        expect(
          scrubbedDb.$client.prepare('SELECT identified_user_id FROM accepted_event').get(),
        ).toEqual({
          identified_user_id: null,
        })
        expect(
          JSON.parse(
            (
              scrubbedDb.$client
                .prepare('SELECT canonical_payload_json FROM event_payload')
                .get() as {
                canonical_payload_json: string
              }
            ).canonical_payload_json,
          ),
        ).toMatchObject({ identifiedUserId: null })
      } finally {
        closeDb(scrubbedDb)
      }

      const cleanedOlderDb = createDb({ path: join(directory, source.storageKey) })
      try {
        cleanedOlderDb.$client
          .prepare('DELETE FROM identity_profile WHERE profile_id = ?')
          .run('profile_1')
      } finally {
        closeDb(cleanedOlderDb)
      }

      await executor.restoreSqlite({ operationId: 'bop_redacted_identity', source })

      expect(
        db
          .select({
            status: schema.TIdentityProfile.status,
            traits: schema.TIdentityProfile.traits,
          })
          .from(schema.TIdentityProfile)
          .where(eq(schema.TIdentityProfile.profileId, 'profile_1'))
          .all(),
      ).toEqual([{ status: 'deleted', traits: null }])
      expect(db.$client.prepare('SELECT identified_user_id FROM accepted_event').get()).toEqual({
        identified_user_id: null,
      })
      expect(
        db.$client
          .prepare('SELECT epoch, status FROM identity_profile_epoch WHERE profile_id = ?')
          .get('profile_1'),
      ).toEqual({ epoch: 1, status: 'redacted' })
      expect(
        JSON.parse(
          (
            db.$client.prepare('SELECT canonical_payload_json FROM event_payload').get() as {
              canonical_payload_json: string
            }
          ).canonical_payload_json,
        ),
      ).toMatchObject({ identifiedUserId: null })
    } finally {
      await analytics.close()
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('captures, validates, and restores a configured SQLite generation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-backup-test-'))
    const controlDatabasePath = join(directory, 'control.sqlite')
    const db = createDb({ path: controlDatabasePath })
    migrateControlDb(db)
    const analytics = await createTestAnalyticsDb()
    try {
      db.$client.prepare('CREATE TABLE backup_executor_marker (value TEXT NOT NULL)').run()
      db.$client.prepare('INSERT INTO backup_executor_marker (value) VALUES (?)').run('source')
      db.$client
        .prepare(
          'INSERT INTO installation (id, singleton_key, status, event_retention_months, profile_retention_months, replay_retention_months, data_directory_ready, active_operation_id, active_operation_kind, active_operation_phase, active_operation_checkpoint, active_operation_progress, active_operation_owner_token, active_operation_last_safe_sequence, active_operation_error_code, cleanup_pending, derived_cleanup_status, derived_cleanup_started_at, derived_cleanup_completed_at, derived_cleanup_error_code, backup_cleanup_status, backup_cleanup_started_at, backup_cleanup_completed_at, backup_cleanup_error_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'ins_1',
          'default',
          'recovering',
          12,
          12,
          null,
          1,
          'bop_restore',
          'restore',
          'lifecycle_transition',
          'none',
          0,
          'owner_restore',
          9,
          null,
          1,
          'pending',
          null,
          null,
          null,
          'pending',
          null,
          null,
          null,
          1,
          2,
        )
      db.$client
        .prepare(
          'INSERT INTO backup_operation (id, operation_type, status, scope, phase, progress, checkpoint, last_safe_sequence, control_readiness, analytics_readiness, structural_readiness, cleanup_pending, error_code, recovery_key, created_at, started_at, completed_at, updated_at, owner_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'bop_1',
          'backup',
          'available',
          'installation',
          'ready',
          1,
          'structurally_ready',
          7,
          'ready',
          'ready',
          'ready',
          0,
          null,
          null,
          1,
          1,
          1,
          1,
          null,
        )
      db.$client
        .prepare(
          'INSERT INTO backup_operation (id, operation_type, status, scope, phase, progress, checkpoint, last_safe_sequence, control_readiness, analytics_readiness, structural_readiness, cleanup_pending, error_code, recovery_key, created_at, started_at, completed_at, updated_at, owner_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'bop_restore',
          'restore',
          'restoring',
          'installation',
          'restoring_sqlite',
          0.25,
          'none',
          9,
          'ready',
          'ready',
          'not_ready',
          1,
          null,
          null,
          1,
          2,
          null,
          2,
          'owner_restore',
        )
      db.$client
        .prepare(
          'INSERT INTO backup_restore_reference (operation_id, restore_source_backup_id, pre_restore_safety_artifact_id, created_at) VALUES (?, ?, ?, ?)',
        )
        .run('bop_restore', 'bop_1', null, 2)
      db.$client
        .prepare(
          'INSERT INTO backup_artifact (id, operation_id, artifact_type, generation_id, storage_key, schema_version, retention_boundary, acceptance_sequence, size_bytes, checksum_algorithm, checksum_value, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'bar_safety',
          'bop_restore',
          'pre_restore_sqlite',
          'gen_current',
          'safety/bop_restore.sqlite',
          '1',
          null,
          9,
          8,
          'sha256',
          'checksum',
          null,
          2,
        )
      db.$client
        .prepare(
          'UPDATE backup_restore_reference SET pre_restore_safety_artifact_id = ? WHERE operation_id = ?',
        )
        .run('bar_safety', 'bop_restore')
      db.$client
        .prepare(
          'INSERT INTO backup_cleanup_stage (operation_id, stage, status, started_at, completed_at, error_code) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('bop_restore', 'derived_cleanup', 'pending', null, null, null)
      db.$client
        .prepare(
          'INSERT INTO backup_cleanup_stage (operation_id, stage, status, started_at, completed_at, error_code) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('bop_restore', 'backup_cleanup', 'pending', null, null, null)
      const executor = new ConfiguredSqliteExecutor({
        db,
        analytics,
        controlDatabasePath,
        dataDirectoryPath: directory,
      })

      const source = await executor.captureBackup({
        operationId: 'bop_1',
        artifactId: 'bar_1',
        lastSafeSequence: 9,
      })
      expect(source.retentionBoundary).toBeNull()
      expect(source.retentionManifest).toEqual({ version: 1, boundaries: [] })
      await executor.validateManifest({ operationId: 'bop_1', source })
      await expect(
        executor.validateManifest({
          operationId: 'bop_1',
          source: { ...source, schemaVersion: '2' },
        }),
      ).rejects.toThrow('compatible')
      db.$client.prepare('UPDATE backup_executor_marker SET value = ?').run('changed')
      db.$client
        .prepare(
          'INSERT INTO site_tombstone (site_id, organization_id, hostname, purge_operation_id, purged_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('site_deleted', 'org_1', 'deleted.example.com', 'purge_1', 2, 1)

      await executor.restoreSqlite({ operationId: 'bop_restore', source })

      expect(db.$client.prepare('SELECT value FROM backup_executor_marker').get()).toMatchObject({
        value: 'source',
      })
      expect(
        db.$client
          .prepare('SELECT site_id AS siteId FROM site_tombstone WHERE site_id = ?')
          .get('site_deleted'),
      ).toMatchObject({ siteId: 'site_deleted' })
      expect(
        db.$client.prepare('SELECT status FROM backup_operation WHERE id = ?').get('bop_restore'),
      ).toMatchObject({ status: 'restoring' })
      expect(
        db.$client.prepare('SELECT active_operation_id AS operationId FROM installation').get(),
      ).toMatchObject({ operationId: 'bop_restore' })
    } finally {
      await analytics.close()
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('restores safety metadata when rolling back a generation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-rollback-metadata-test-'))
    const controlDatabasePath = join(directory, 'control.sqlite')
    const db = createDb({ path: controlDatabasePath })
    migrateControlDb(db)
    const analytics = await createTestAnalyticsDb()
    try {
      const createdAt = new Date('2026-09-01T00:00:00.000Z')
      db.$client.prepare('CREATE TABLE rollback_marker (value TEXT NOT NULL)').run()
      db.$client.prepare('INSERT INTO rollback_marker (value) VALUES (?)').run('before')
      db.insert(schema.TBackupOperation)
        .values({
          id: 'bop_source',
          operationType: 'backup',
          status: 'available',
          scope: 'installation',
          phase: 'ready',
          progress: 1,
          checkpoint: 'structurally_ready',
          lastSafeSequence: 8,
          controlReadiness: 'ready',
          analyticsReadiness: 'ready',
          structuralReadiness: 'ready',
          cleanupPending: false,
          errorCode: null,
          recoveryKey: null,
          createdAt,
          startedAt: createdAt,
          completedAt: createdAt,
          updatedAt: createdAt,
          ownerToken: null,
        })
        .run()
      db.insert(schema.TBackupOperation)
        .values({
          id: 'bop_restore',
          operationType: 'restore',
          status: 'restoring',
          scope: 'installation',
          phase: 'restoring_sqlite',
          progress: 0.25,
          checkpoint: 'none',
          lastSafeSequence: 9,
          controlReadiness: 'ready',
          analyticsReadiness: 'ready',
          structuralReadiness: 'not_ready',
          cleanupPending: true,
          errorCode: null,
          recoveryKey: null,
          createdAt,
          startedAt: createdAt,
          completedAt: null,
          updatedAt: createdAt,
          ownerToken: 'owner_restore',
        })
        .run()
      db.insert(schema.TBackupRestoreReference)
        .values({
          operationId: 'bop_restore',
          restoreSourceBackupId: 'bop_source',
          preRestoreSafetyArtifactId: null,
          createdAt,
        })
        .run()
      const executor = new ConfiguredSqliteExecutor({
        db,
        analytics,
        controlDatabasePath,
        dataDirectoryPath: directory,
      })
      const safety = await executor.createPreRestoreSafety({
        operationId: 'bop_restore',
        artifactId: 'bar_safety',
        lastSafeSequence: 9,
      })
      db.insert(schema.TBackupArtifact)
        .values({
          id: safety.id,
          operationId: safety.operationId,
          artifactType: 'pre_restore_sqlite',
          generationId: safety.generationId,
          storageKey: safety.storageKey,
          schemaVersion: safety.schemaVersion,
          retentionBoundary: null,
          acceptanceSequence: safety.lastSafeSequence,
          sizeBytes: safety.sizeBytes,
          checksumAlgorithm: safety.checksumAlgorithm,
          checksumValue: safety.checksumValue,
          metadata: null,
          createdAt: safety.createdAt,
        })
        .run()
      db.update(schema.TBackupRestoreReference)
        .set({ preRestoreSafetyArtifactId: safety.id })
        .where(eq(schema.TBackupRestoreReference.operationId, 'bop_restore'))
        .run()
      db.$client.prepare('UPDATE rollback_marker SET value = ?').run('after')

      await executor.rollback({ operationId: 'bop_restore', safety })

      expect(db.$client.prepare('SELECT value FROM rollback_marker').get()).toMatchObject({
        value: 'before',
      })
      expect(
        db.$client
          .prepare('SELECT id FROM backup_artifact WHERE operation_id = ? AND artifact_type = ?')
          .get('bop_restore', 'pre_restore_sqlite'),
      ).toMatchObject({ id: safety.id })
      expect(
        db.$client
          .prepare(
            'SELECT pre_restore_safety_artifact_id AS artifactId FROM backup_restore_reference WHERE operation_id = ?',
          )
          .get('bop_restore'),
      ).toMatchObject({ artifactId: safety.id })
    } finally {
      await analytics.close()
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('captures the effective retention manifest with the source generation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-retention-manifest-test-'))
    const controlDatabasePath = join(directory, 'control.sqlite')
    const db = createDb({ path: controlDatabasePath })
    migrateControlDb(db)
    const analytics = await createTestAnalyticsDb()
    try {
      db.$client.pragma('foreign_keys = OFF')
      db.$client
        .prepare(
          'INSERT INTO retention_effective_cutoff (site_id, installation_id, policy_id, reporting_timezone, local_day, event_occurrence_cutoff_at, raw_receipt_cutoff_at, profile_activity_cutoff_at, replay_receipt_cutoff_at, effective_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('site_a', 'installation_1', 'policy_a', 'UTC', '2026-09-01', 1, 2, 3, null, 4, 5)
      db.$client
        .prepare(
          'INSERT INTO retention_effective_cutoff (site_id, installation_id, policy_id, reporting_timezone, local_day, event_occurrence_cutoff_at, raw_receipt_cutoff_at, profile_activity_cutoff_at, replay_receipt_cutoff_at, effective_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'site_b',
          'installation_1',
          'policy_b',
          'America/Los_Angeles',
          '2026-09-02',
          6,
          7,
          8,
          9,
          10,
          11,
        )

      const executor = new ConfiguredSqliteExecutor({
        db,
        analytics,
        controlDatabasePath,
        dataDirectoryPath: directory,
      })

      const source = await executor.captureBackup({
        operationId: 'bop_retention_manifest',
        artifactId: 'bar_retention_manifest',
        lastSafeSequence: 12,
      })

      expect(source).toMatchObject({
        retentionManifest: {
          version: 1,
          boundaries: [
            {
              siteId: 'site_a',
              installationId: 'installation_1',
              policyId: 'policy_a',
              reportingTimezone: 'UTC',
              localDay: '2026-09-01',
              eventOccurrenceCutoffAt: new Date(1),
              rawReceiptCutoffAt: new Date(2),
              profileActivityCutoffAt: new Date(3),
              replayReceiptCutoffAt: null,
              effectiveAt: new Date(4),
              updatedAt: new Date(5),
            },
            {
              siteId: 'site_b',
              installationId: 'installation_1',
              policyId: 'policy_b',
              reportingTimezone: 'America/Los_Angeles',
              localDay: '2026-09-02',
              eventOccurrenceCutoffAt: new Date(6),
              rawReceiptCutoffAt: new Date(7),
              profileActivityCutoffAt: new Date(8),
              replayReceiptCutoffAt: new Date(9),
              effectiveAt: new Date(10),
              updatedAt: new Date(11),
            },
          ],
        },
      })
    } finally {
      await analytics.close()
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })
})
