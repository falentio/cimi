import { access, mkdtemp, rm } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, createDb } from '../../client.ts'
import {
  ControlMigrationIncompatibilityError,
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
    expect(migrationRows).toHaveLength(11)
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
        'organization_governance_operation',
        'organization_repair_operation',
        'public_dashboard',
        'projection_checkpoint',
        'projection_gap',
        'retention_effective_cutoff',
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

  it('remaps cleanup checkpoints when migrating installation runs to Sites', () => {
    const path = join(dir, 'legacy.sqlite')
    const sqlite = new Database(path)
    const migrationsDirectory = new URL('../../migrations/', import.meta.url)
    try {
      sqlite.pragma('foreign_keys = OFF')
      for (const file of readdirSync(migrationsDirectory).filter(
        (name) => name.endsWith('.sql') && Number(name.slice(0, 4)) <= 8,
      )) {
        for (const statement of readFileSync(new URL(file, migrationsDirectory), 'utf8').split(
          '--> statement-breakpoint',
        )) {
          if (statement.trim()) sqlite.exec(statement)
        }
      }

      const now = Date.now()
      sqlite
        .prepare(
          'INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('user-1', 'User', 'user@example.com', 1, now, now)
      sqlite
        .prepare(
          'INSERT INTO organization (id, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('org-1', 'Organization', 'user-1', now, now)
      sqlite
        .prepare(
          'INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('ste-1', 'org-1', 'Site', 'example.com', 'ing-1', now, now)
      sqlite
        .prepare('INSERT INTO installation (id, created_at, updated_at) VALUES (?, ?, ?)')
        .run('installation-1', now, now)
      sqlite
        .prepare(
          'INSERT INTO retention_policy (id, installation_id, scope, event_months, profile_months, version, status, effective_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
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
      sqlite
        .prepare(
          'INSERT INTO retention_cleanup_run (id, installation_id, site_id, policy_id, cleanup_kind, status, cutoff_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'cleanup-run-1',
          'installation-1',
          null,
          'retention-policy-1',
          'derived',
          'queued',
          now,
          now,
          now,
        )
      sqlite
        .prepare(
          'INSERT INTO retention_cleanup_checkpoint (id, cleanup_run_id, data_class, stage, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('cleanup-checkpoint-1', 'cleanup-run-1', 'accepted-events', 'derived', 'pending', now)

      const migration = readFileSync(
        new URL('0009_retention_cleanup_shape.sql', migrationsDirectory),
        'utf8',
      )
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) sqlite.exec(statement)
      }
      sqlite.pragma('foreign_keys = ON')

      expect(
        sqlite.prepare('SELECT id, site_id AS siteId FROM retention_cleanup_run').all(),
      ).toEqual([{ id: 'cleanup-run-1:ste-1', siteId: 'ste-1' }])
      expect(
        sqlite
          .prepare(
            'SELECT id, cleanup_run_id AS cleanupRunId, stage FROM retention_cleanup_checkpoint',
          )
          .all(),
      ).toEqual([
        {
          id: 'cleanup-checkpoint-1:cleanup-run-1:ste-1',
          cleanupRunId: 'cleanup-run-1:ste-1',
          stage: 'derived',
        },
      ])
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
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
      .run('org-1', 'Organization', 'user-1', now, now)
    db.$client
      .prepare(
        `INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('ste-1', 'org-1', 'Site', 'example.com', 'ing-1', now, now)
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
        'ste-1',
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
        'ste-1',
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
      .run('profile-1', 'ste-1', 'identified-1', 'active', 1, now, now, now, now)
    db.$client
      .prepare(
        `INSERT INTO identity_profile_epoch
          (profile_id, site_id, identified_user_id, epoch, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('profile-1', 'ste-1', 'identified-1', 1, 'active', now)
    const insertIdentityLink = db.$client.prepare(
      `INSERT INTO identity_link
        (id, site_id, profile_id, profile_epoch, anonymous_identity_id, effective_from, linked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    expect(() =>
      insertIdentityLink.run(
        'identity-link-invalid',
        'ste-1',
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
          (id, installation_id, site_id, policy_id, cleanup_kind,
           event_occurrence_cutoff_at, raw_receipt_cutoff_at, profile_activity_cutoff_at,
           replay_receipt_cutoff_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cleanup-run-1',
        'installation-1',
        'ste-1',
        'retention-policy-1',
        'derived',
        now,
        now,
        now,
        null,
        now,
        now,
      )
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

  it('enforces Organization governance constraints at runtime', () => {
    const db = createMigratedTestDb()

    try {
      expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1)

      const now = Date.now()
      const insertUser = db.$client.prepare(
        `INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      insertUser.run('user-1', 'User 1', 'user-1@example.com', 1, now, now)
      insertUser.run('user-2', 'User 2', 'user-2@example.com', 1, now, now)
      insertUser.run('user-3', 'User 3', 'user-3@example.com', 1, now, now)

      const insertOrganization = db.$client.prepare(
        `INSERT INTO organization
          (id, name, authority_organization_id, owner_user_id, is_personal, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      insertOrganization.run('personal-1', 'Personal 1', null, 'user-1', 1, now, now)
      expect(() =>
        insertOrganization.run('personal-2', 'Personal 2', null, 'user-1', 1, now, now),
      ).toThrow()
      insertOrganization.run('personal-2', 'Personal 2', null, 'user-2', 1, now, now)
      insertOrganization.run('org-1', 'Organization 1', 'authority-1', 'user-1', 0, now, now)
      insertOrganization.run('org-2', 'Organization 2', 'authority-2', 'user-2', 0, now, now)
      insertOrganization.run(
        'organization-3',
        'Organization 3',
        'authority-3',
        'user-1',
        0,
        now,
        now,
      )
      expect(() =>
        insertOrganization.run(
          'organization-4',
          'Organization 4',
          'authority-2',
          'user-3',
          0,
          now,
          now,
        ),
      ).toThrow()

      const insertMembership = db.$client.prepare(
        `INSERT INTO membership (organization_id, user_id, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      insertMembership.run('org-1', 'user-1', 'owner', now, now)
      insertMembership.run('org-1', 'user-2', 'admin', now, now)
      expect(() => insertMembership.run('org-1', 'user-2', 'admin', now, now)).toThrow()
      expect(() => insertMembership.run('org-1', 'user-3', 'owner', now, now)).toThrow()
      expect(() => insertMembership.run('org-1', 'user-3', 'moderator', now, now)).toThrow()
      expect(() =>
        insertMembership.run('missing-organization', 'user-3', 'member', now, now),
      ).toThrow()
      expect(() => insertMembership.run('org-1', 'missing-user', 'member', now, now)).toThrow()
      expect(() => db.$client.prepare('DELETE FROM user WHERE id = ?').run('user-2')).toThrow()

      const insertGovernanceOperation = db.$client.prepare(
        `INSERT INTO organization_governance_operation
          (id, organization_id, operation_type, previous_owner_user_id, target_user_id,
           target_role, status, attempt_count, requested_at, last_attempt_at, completed_at,
           failure_code, failure_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      insertGovernanceOperation.run(
        'governance-1',
        'org-1',
        'transfer-ownership',
        'user-1',
        'user-2',
        null,
        'pending',
        0,
        now,
        null,
        null,
        null,
        null,
        now,
        now,
      )
      expect(() =>
        insertGovernanceOperation.run(
          'governance-2',
          'org-1',
          'remove-member',
          'user-1',
          'user-2',
          null,
          'pending',
          0,
          now,
          null,
          null,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      insertGovernanceOperation.run(
        'governance-3',
        'org-1',
        'remove-member',
        'user-1',
        'user-2',
        null,
        'completed',
        0,
        now,
        null,
        now,
        null,
        null,
        now,
        now,
      )
      insertGovernanceOperation.run(
        'governance-4',
        'org-2',
        'change-member-role',
        'user-2',
        'user-3',
        'admin',
        'completed',
        0,
        now,
        null,
        now,
        null,
        null,
        now,
        now,
      )
      insertGovernanceOperation.run(
        'governance-4-member',
        'org-2',
        'change-member-role',
        'user-2',
        'user-3',
        'member',
        'completed',
        1,
        now,
        now,
        now,
        null,
        null,
        now,
        now,
      )
      expect(() =>
        insertGovernanceOperation.run(
          'governance-5',
          'org-2',
          'change-member-role',
          'user-2',
          'user-3',
          'owner',
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertGovernanceOperation.run(
          'governance-6',
          'org-2',
          'change-member-role',
          'user-2',
          'user-3',
          null,
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertGovernanceOperation.run(
          'governance-7',
          'org-2',
          'transfer-ownership',
          'user-2',
          'user-3',
          'member',
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertGovernanceOperation.run(
          'governance-8',
          'org-2',
          'leave-organization',
          'user-2',
          'user-2',
          null,
          'completed',
          -1,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertGovernanceOperation.run(
          'governance-9',
          'missing-organization',
          'transfer-ownership',
          'user-1',
          'user-2',
          null,
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertGovernanceOperation.run(
          'governance-10',
          'org-2',
          'transfer-ownership',
          'missing-user',
          'user-2',
          null,
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertGovernanceOperation.run(
          'governance-11',
          'org-2',
          'transfer-ownership',
          'user-2',
          'missing-user',
          null,
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()

      const insertRepairOperation = db.$client.prepare(
        `INSERT INTO organization_repair_operation
          (id, organization_id, local_organization_id, operation_type, owner_user_id,
           authority_organization_id, authority_cleanup_required, authority_slug, previous_name,
           desired_name, status, attempt_count, requested_at, last_attempt_at, completed_at,
           failure_code, failure_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      insertRepairOperation.run(
        'repair-1',
        null,
        'local-create-1',
        'create-organization',
        'user-1',
        null,
        0,
        'create-slug-1',
        null,
        'Created Organization',
        'pending',
        0,
        now,
        null,
        null,
        null,
        null,
        now,
        now,
      )
      expect(() =>
        insertRepairOperation.run(
          'repair-2',
          null,
          'local-create-2',
          'create-organization',
          'user-1',
          null,
          0,
          'create-slug-2',
          null,
          'Created Organization 2',
          'pending',
          0,
          now,
          null,
          null,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      insertRepairOperation.run(
        'repair-3',
        null,
        'local-create-3',
        'create-organization',
        'user-1',
        null,
        0,
        'create-slug-3',
        null,
        'Created Organization 3',
        'completed',
        0,
        now,
        null,
        now,
        null,
        null,
        now,
        now,
      )
      expect(() =>
        insertRepairOperation.run(
          'repair-4',
          null,
          'local-create-4',
          'create-organization',
          'user-1',
          null,
          0,
          null,
          null,
          'Created Organization 4',
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertRepairOperation.run(
          'repair-5',
          null,
          'local-create-5',
          'create-organization',
          'user-1',
          null,
          0,
          'create-slug-5',
          'Previous Name',
          'Created Organization 5',
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      insertRepairOperation.run(
        'repair-6',
        'org-2',
        'local-update-1',
        'update-organization',
        'user-2',
        'authority-2',
        0,
        null,
        'Previous Name',
        'Updated Organization',
        'pending',
        0,
        now,
        null,
        null,
        null,
        null,
        now,
        now,
      )
      expect(() =>
        insertRepairOperation.run(
          'repair-7',
          'org-2',
          'local-update-2',
          'update-organization',
          'user-2',
          'authority-2',
          0,
          null,
          'Previous Name',
          'Updated Organization 2',
          'pending',
          0,
          now,
          null,
          null,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertRepairOperation.run(
          'repair-8',
          'org-2',
          'local-update-3',
          'update-organization',
          'user-2',
          'authority-2',
          0,
          null,
          'Previous Name',
          'Updated Organization 3',
          'completed',
          -1,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertRepairOperation.run(
          'repair-9',
          'org-2',
          'local-update-4',
          'update-organization',
          'user-2',
          'authority-2',
          0,
          'unexpected-slug',
          'Previous Name',
          'Updated Organization 4',
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertRepairOperation.run(
          'repair-10',
          null,
          'local-update-5',
          'update-organization',
          'user-2',
          'authority-2',
          0,
          null,
          'Previous Name',
          'Updated Organization 5',
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()
      expect(() =>
        insertRepairOperation.run(
          'repair-11',
          'org-2',
          'local-update-6',
          'update-organization',
          'missing-user',
          'authority-2',
          0,
          null,
          'Previous Name',
          'Updated Organization 6',
          'completed',
          0,
          now,
          null,
          now,
          null,
          null,
          now,
          now,
        ),
      ).toThrow()

      db.$client.prepare('DELETE FROM organization WHERE id = ?').run('org-1')
      expect(
        db.$client
          .prepare('SELECT COUNT(*) AS count FROM membership WHERE organization_id = ?')
          .get('org-1'),
      ).toEqual({ count: 0 })
      expect(
        db.$client
          .prepare(
            'SELECT COUNT(*) AS count FROM organization_governance_operation WHERE organization_id = ?',
          )
          .get('org-1'),
      ).toEqual({ count: 0 })
    } finally {
      closeDb(db)
    }
  })

  it('uses the configured control path and creates its missing parent directory', async () => {
    const configuredPath = join(dir, 'nested', 'control.sqlite')

    expect(resolveControlDbPath({ CIMI_CONTROL_DB_PATH: configuredPath }, '/ignored/cwd')).toBe(
      configuredPath,
    )

    migrateControlDbAtPath(configuredPath)

    await expect(access(configuredPath)).resolves.toBeUndefined()
  })

  it('rejects a future control migration before running the migrator', () => {
    const db = createMigratedTestDb()

    try {
      db.$client
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run('0'.repeat(64), 9_999_999_999_999)

      expect(() => migrateControlDb(db)).toThrow(ControlMigrationIncompatibilityError)
    } finally {
      closeDb(db)
    }
  })
})
