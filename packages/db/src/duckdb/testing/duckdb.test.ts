import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDb } from '../../migrate.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAnalyticsDb } from '../index.ts'
import { createTestAnalyticsDb } from '../../testing/index.ts'

describe('createAnalyticsDb', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-duckdb-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('becomes ready, reopens the same file, and closes', async () => {
    const path = join(dir, 'analytics.duckdb')
    const tempDirectory = join(dir, 'analytics-tmp')

    const first = await createAnalyticsDb({
      path,
      threads: 1,
      memoryLimit: '128MB',
      tempDirectory,
      maxTempDirectorySize: '256MB',
    })
    await expect(first.ready()).resolves.toBe(true)
    await expect(stat(tempDirectory)).resolves.toBeDefined()
    await first.close()
    await expect(first.close()).resolves.toBeUndefined()
    await expect(first.ready()).resolves.toBe(false)

    const inspectionInstance = await DuckDBInstance.create(path, {
      threads: '1',
      memory_limit: '128MB',
      temp_directory: tempDirectory,
      max_temp_directory_size: '256MB',
    })
    const inspectionConnection = await inspectionInstance.connect()
    const tableReader = await inspectionConnection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
    )
    await tableReader.readAll()
    expect(tableReader.getRowObjects().map((row) => String(row['table_name']))).toEqual(
      expect.arrayContaining([
        'analytics_sessions',
        'event_properties',
        'events',
        'projection_checkpoints',
        'projection_gaps',
        'schema_migrations',
        'visitors',
      ]),
    )
    inspectionConnection.closeSync()
    inspectionInstance.closeSync()

    const second = await createAnalyticsDb({
      path,
      threads: 1,
      memoryLimit: '128MB',
      tempDirectory,
      maxTempDirectorySize: '256MB',
    })
    await expect(second.ready()).resolves.toBe(true)
    await second.close()
  })

  it('creates a fresh migrated in-memory database and closes it idempotently', async () => {
    const analytics = await createTestAnalyticsDb()

    await expect(analytics.ready()).resolves.toBe(true)
    await expect(analytics.close()).resolves.toBeUndefined()
    await expect(analytics.close()).resolves.toBeUndefined()
    await expect(analytics.ready()).resolves.toBe(false)
  })

  it('rebuilds derived state from the SQLite acceptance data', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analyticsPath = join(dir, 'analytics.duckdb')
    const analytics = await createAnalyticsDb({
      path: analyticsPath,
      tempDirectory: join(dir, 'analytics-tmp'),
    })
    const now = Date.now()

    try {
      migrateControlDb(controlDb)
      controlDb.$client
        .prepare(
          'INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('user-1', 'User', 'user@example.com', 1, now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO organization (id, name, owner_user_id, is_personal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('org-1', 'Organization', 'user-1', 0, now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('ste-1', 'org-1', 'Site', 'example.com', 'ing-1', now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('ste-2', 'org-1', 'Site 2', 'example.org', 'ing-2', now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO installation (id, status, data_directory_ready, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('ins-1', 'ready', 1, now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO collection_policy_revision (id, installation_id, scope, version, policy_json, effective_from, committed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('pol-1', 'ins-1', 'installation', 1, '{}', now, now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO identity_profile (profile_id, site_id, identified_user_id, status, profile_epoch, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('profile-1', 'ste-1', 'identified-1', 'active', 1, now, now, now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO identity_profile_epoch (profile_id, site_id, identified_user_id, epoch, status, started_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('profile-1', 'ste-1', 'identified-1', 1, 'active', now - 1_000)
      controlDb.$client
        .prepare(
          'INSERT INTO identity_link (id, site_id, profile_id, profile_epoch, anonymous_identity_id, analytics_session_id, effective_from, linked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('link-1', 'ste-1', 'profile-1', 1, 'vis-1', 'ses-1', now - 1_000, now - 1_000)
      controlDb.$client
        .prepare(
          'INSERT INTO identity_redaction (id, site_id, profile_id, identified_user_id, profile_epoch, reason, status, requested_at, derived_cleanup_status, backup_cleanup_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'redaction-1',
          'ste-1',
          'profile-1',
          'identified-1',
          1,
          'explicit',
          'requested',
          now,
          'pending',
          'pending',
          now,
          now,
        )
      controlDb.$client
        .prepare(
          'INSERT INTO identity_profile (profile_id, site_id, identified_user_id, status, profile_epoch, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('profile-2', 'ste-1', 'identified-2', 'active', 1, now, now, now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO identity_profile_epoch (profile_id, site_id, identified_user_id, epoch, status, started_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('profile-2', 'ste-1', 'identified-2', 1, 'active', now - 1_000)
      controlDb.$client
        .prepare(
          'INSERT INTO identity_link (id, site_id, profile_id, profile_epoch, anonymous_identity_id, analytics_session_id, effective_from, linked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('link-2', 'ste-1', 'profile-2', 1, 'vis-2', 'ses-2', now - 1_000, now - 1_000)
      controlDb.$client
        .prepare(
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, identified_user_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          1,
          'ste-1',
          'evt-1',
          'custom_event',
          now,
          now,
          'vis-1',
          'identified-1',
          'ses-1',
          'pol-1',
          1,
          'fingerprint',
          'pending',
          now,
        )
      controlDb.$client
        .prepare('INSERT INTO event_custom (event_pk, name) VALUES (?, ?)')
        .run(1, 'signup')
      controlDb.$client
        .prepare(
          'INSERT INTO event_property (event_pk, property_key, value_type, string_value) VALUES (?, ?, ?, ?)',
        )
        .run(1, 'plan', 'string', 'pro')
      controlDb.$client
        .prepare(
          'INSERT INTO projection_checkpoint (site_id, projected_replay_sequence, occurrence_covered_from, occurrence_covered_through, effective_retention_from, statistics_refreshed_at, readiness, projection_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('ste-1', 9, now - 10_000, now, now - 100_000, now, 'rebuilding', 'v2', now)
      controlDb.$client
        .prepare(
          'INSERT INTO projection_gap (id, site_id, occurrence_from, occurrence_to, observed_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('gap-1', 'ste-1', now - 20_000, now - 10_000, now)

      await analytics.rebuild({ controlDb })
      controlDb.$client
        .prepare(
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          2,
          'ste-1',
          'evt-2',
          'page_view',
          now + 1_000,
          now + 1_000,
          'vis-1',
          'ses-1',
          'pol-1',
          2,
          'fingerprint-2',
          'pending',
          now + 1_000,
        )
      controlDb.$client
        .prepare(
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          3,
          'ste-1',
          'evt-3',
          'page_view',
          now + 2_000,
          now + 2_000,
          'vis-1',
          'ses-1',
          'pol-1',
          3,
          'fingerprint-3',
          'failed',
          now + 2_000,
        )
      controlDb.$client
        .prepare(
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          4,
          'ste-1',
          'evt-4',
          'custom_event',
          now + 3_000,
          now + 3_000,
          'vis-2',
          'ses-2',
          'pol-1',
          4,
          'fingerprint-4',
          'pending',
          now + 3_000,
        )
      await analytics.rebuild({ controlDb })
      await analytics.close()

      const inspectionInstance = await DuckDBInstance.create(analyticsPath)
      const inspectionConnection = await inspectionInstance.connect()
      try {
        const counts = await Promise.all(
          [
            'visitors',
            'analytics_sessions',
            'events',
            'event_properties',
            'projection_checkpoints',
            'projection_gaps',
          ].map(async (table) => {
            const reader = await inspectionConnection.runAndReadAll(
              `SELECT count(*) AS count FROM ${table}`,
            )
            return [table, Number(reader.getRowObjects()[0]?.['count'])] as const
          }),
        )
        expect(Object.fromEntries(counts)).toEqual({
          visitors: 2,
          analytics_sessions: 2,
          events: 3,
          event_properties: 1,
          projection_checkpoints: 2,
          projection_gaps: 1,
        })
        const redactedEvent = await inspectionConnection.runAndReadAll(
          "SELECT identified_user_id FROM events WHERE event_id = 'evt-1'",
        )
        expect(redactedEvent.getRowObjects()[0]?.['identified_user_id']).toBeNull()
        const visitor = await inspectionConnection.runAndReadAll(
          "SELECT identity_kind, profile_id FROM visitors WHERE visitor_id = 'vis-1'",
        )
        expect(visitor.getRowObjects()[0]).toEqual({ identity_kind: 'anonymous', profile_id: null })
        const relinkedEvent = await inspectionConnection.runAndReadAll(
          "SELECT identified_user_id FROM events WHERE event_id = 'evt-4'",
        )
        expect(relinkedEvent.getRowObjects()[0]?.['identified_user_id']).toBe('identified-2')
        const checkpoint = await inspectionConnection.runAndReadAll(
          "SELECT projected_replay_sequence, readiness, projection_version FROM projection_checkpoints WHERE site_id = 'ste-1'",
        )
        expect(checkpoint.getRowObjects()[0]).toMatchObject({
          projected_replay_sequence: 9n,
          readiness: 'rebuilding',
          projection_version: 'v2',
        })
        const emptySiteCheckpoint = await inspectionConnection.runAndReadAll(
          "SELECT projected_replay_sequence, readiness, projection_version, updated_at FROM projection_checkpoints WHERE site_id = 'ste-2'",
        )
        expect(emptySiteCheckpoint.getRowObjects()[0]).toMatchObject({
          projected_replay_sequence: 0n,
          readiness: 'ready',
          projection_version: 'v1',
        })
      } finally {
        inspectionConnection.closeSync()
        inspectionInstance.closeSync()
      }
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})
