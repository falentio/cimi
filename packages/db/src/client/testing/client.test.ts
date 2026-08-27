import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import {
  migrateControlDb,
  migrateControlDbAtPath,
  resolveControlDbPath,
  validateBaseSchema,
} from '../../migrate.ts'
import { TUser } from '../../schema/index.ts'
import { createMigratedTestDb } from '../../testing/index.ts'

describe('createDb + migrateControlDb', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-db-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('migrates idempotently and round-trips a user row', async () => {
    const path = join(dir, 'control.sqlite')
    const db = createDb({ path })

    expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.$client.pragma('synchronous', { simple: true })).toBe(2)
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.$client.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect(db.$client.pragma('wal_autocheckpoint', { simple: true })).toBe(1000)

    migrateControlDb(db)
    migrateControlDb(db)
    validateBaseSchema(db)

    const migrationRows = db.$client
      .prepare('SELECT hash, created_at FROM __drizzle_migrations')
      .all() as Array<{ hash: string; created_at: number }>
    expect(migrationRows).toHaveLength(1)
    expect(migrationRows.every((row) => /^[a-f0-9]{64}$/.test(row.hash))).toBe(true)

    const tableRows = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    expect(tableRows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'accepted_event',
        'account',
        'auth_invitation',
        'auth_member',
        'auth_organization',
        'backup_artifact',
        'backup_cleanup_stage',
        'backup_operation',
        'backup_restore_reference',
        'cohort',
        'cohort_version',
        'collection_policy_revision',
        'event_acceptance_journal',
        'event_custom',
        'event_error',
        'event_outbound',
        'event_page_view',
        'event_payload',
        'event_performance',
        'event_property',
        'funnel',
        'funnel_version',
        'goal',
        'goal_version',
        'hello',
        'identity_link',
        'identity_profile',
        'identity_profile_epoch',
        'identity_redaction',
        'installation',
        'invitation',
        'membership',
        'organization',
        'public_dashboard',
        'projection_checkpoint',
        'projection_gap',
        'retention_cleanup_checkpoint',
        'retention_cleanup_run',
        'retention_policy',
        'session',
        'site',
        'site_lifecycle_operation',
        'site_tombstone',
        'user',
        'verification',
      ]),
    )

    const now = new Date()
    const user = {
      id: 'user-1',
      name: 'Kevin',
      email: 'kevin@example.com',
      emailVerified: true,
      image: null,
      role: null,
      banned: null,
      banReason: null,
      banExpires: null,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(TUser).values(user)

    const rows = await db.select().from(TUser)
    const [row] = rows

    expect(rows).toHaveLength(1)
    expect(row).toEqual(user)
    expect(row?.emailVerified).toBe(true)
    expect(row?.createdAt.getTime()).toBe(now.getTime())
    expect(row?.updatedAt.getTime()).toBe(now.getTime())

    closeDb(db)
    expect(() => closeDb(db)).not.toThrow()
  })

  it('enforces first-party scope, version, epoch, restore, and cleanup invariants', async () => {
    const db = createMigratedTestDb()

    const now = Date.now()
    db.$client
      .prepare(
        `INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('user-1', 'User', 'user@example.com', 1, now, now)
    db.$client
      .prepare(
        `INSERT INTO organization (id, name, owner_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('organization-1', 'Organization', 'user-1', now, now)
    db.$client
      .prepare(
        `INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('site-1', 'organization-1', 'Site', 'example.com', 'ingestion-1', now, now)
    db.$client
      .prepare(
        `INSERT INTO installation (id, created_at, updated_at)
         VALUES (?, ?, ?)`,
      )
      .run('installation-1', now, now)

    const insertCollectionPolicy = db.$client.prepare(
      `INSERT INTO collection_policy_revision
        (id, installation_id, scope, site_id, version, policy_json, effective_from, committed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    expect(() =>
      insertCollectionPolicy.run(
        'collection-policy-invalid',
        'installation-1',
        'installation',
        'site-1',
        1,
        '{}',
        now,
        now,
        now,
      ),
    ).toThrow()
    insertCollectionPolicy.run(
      'collection-policy-1',
      'installation-1',
      'installation',
      null,
      1,
      '{}',
      now,
      now,
      now,
    )

    db.$client
      .prepare(
        `INSERT INTO accepted_event
          (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time,
           policy_revision_id, replay_sequence, payload_fingerprint, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        1,
        'site-1',
        'event-1',
        'custom_event',
        now,
        now,
        'collection-policy-1',
        1,
        'fingerprint',
        now,
      )
    expect(() =>
      db.$client
        .prepare(
          `INSERT INTO event_property
            (event_pk, property_key, value_type, string_value, number_value, boolean_value)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(1, 'invalid', 'number', 'not-a-number', null, null),
    ).toThrow()

    const insertRetentionPolicy = db.$client.prepare(
      `INSERT INTO retention_policy
        (id, installation_id, scope, event_months, profile_months, version, status, effective_from, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insertRetentionPolicy.run(
      'retention-policy-1',
      'installation-1',
      'installation',
      12,
      12,
      1,
      'active',
      now,
      now,
      now,
    )
    expect(() =>
      insertRetentionPolicy.run(
        'retention-policy-2',
        'installation-1',
        'installation',
        12,
        12,
        1,
        'superseded',
        now,
        now,
        now,
      ),
    ).toThrow()

    db.$client
      .prepare(
        `INSERT INTO identity_profile
          (profile_id, site_id, identified_user_id, status, profile_epoch, first_seen_at, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('profile-1', 'site-1', 'identified-1', 'active', 1, now, now, now, now)
    db.$client
      .prepare(
        `INSERT INTO identity_profile_epoch
          (profile_id, site_id, identified_user_id, epoch, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('profile-1', 'site-1', 'identified-1', 1, 'active', now)
    const insertIdentityLink = db.$client.prepare(
      `INSERT INTO identity_link
        (id, site_id, profile_id, profile_epoch, anonymous_identity_id, effective_from, linked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    expect(() =>
      insertIdentityLink.run(
        'identity-link-invalid',
        'site-1',
        'profile-1',
        2,
        'anonymous-1',
        now,
        now,
      ),
    ).toThrow()

    const insertBackupOperation = db.$client.prepare(
      `INSERT INTO backup_operation
        (id, operation_type, status, phase, checkpoint, control_readiness, analytics_readiness,
         structural_readiness, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insertBackupOperation.run(
      'backup-operation-1',
      'restore',
      'restoring',
      'restoring_sqlite',
      'none',
      'ready',
      'not_ready',
      'not_ready',
      now,
      now,
    )
    expect(() =>
      db.$client
        .prepare(
          `INSERT INTO backup_restore_reference
            (operation_id, restore_source_backup_id, pre_restore_safety_artifact_id, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run('backup-operation-1', 'missing-backup-operation', 'missing-safety-artifact', now),
    ).toThrow()

    db.$client
      .prepare(
        `INSERT INTO retention_cleanup_run
          (id, installation_id, policy_id, cleanup_kind, cutoff_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('cleanup-run-1', 'installation-1', 'retention-policy-1', 'derived', now, now, now)
    const insertCleanupCheckpoint = db.$client.prepare(
      `INSERT INTO retention_cleanup_checkpoint
        (id, cleanup_run_id, data_class, stage, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    expect(() =>
      insertCleanupCheckpoint.run(
        'cleanup-checkpoint-invalid',
        'cleanup-run-1',
        'events',
        'backup',
        'pending',
        now,
      ),
    ).toThrow()

    closeDb(db)
  })

  it('uses the configured control path and creates its missing parent directory', async () => {
    const configuredPath = join(dir, 'nested', 'control.sqlite')

    expect(resolveControlDbPath({ CIMI_CONTROL_DB_PATH: configuredPath }, '/ignored/cwd')).toBe(
      configuredPath,
    )

    migrateControlDbAtPath(configuredPath)

    await expect(access(configuredPath)).resolves.toBeUndefined()
  })
})
