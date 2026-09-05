import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, createDb, migrateControlDb } from '@cimi/db'
import { createTestAnalyticsDb } from '@cimi/db/testing'
import { describe, expect, it } from 'vitest'
import { ConfiguredSqliteExecutor } from '../executor.ts'

describe('ConfiguredSqliteExecutor', () => {
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
      await executor.validateManifest({ operationId: 'bop_1', source })
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
})
