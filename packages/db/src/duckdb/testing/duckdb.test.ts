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

  it('reports stale projection versions as unavailable', async () => {
    const path = join(dir, 'stale-analytics.duckdb')
    const tempDirectory = join(dir, 'stale-analytics-tmp')
    const analytics = await createAnalyticsDb({ path, tempDirectory })
    await analytics.close()

    const instance = await DuckDBInstance.create(path, {
      temp_directory: tempDirectory,
    })
    const connection = await instance.connect()
    await connection.run(
      `INSERT INTO projection_checkpoints (site_id, projection_version, updated_at)
       VALUES ('ste-stale', 'v3', current_timestamp)`,
    )
    connection.closeSync()
    instance.closeSync()

    const stale = await createAnalyticsDb({ path, tempDirectory })
    await expect(stale.ready()).resolves.toBe(false)
    await stale.close()
  })

  it('creates a fresh migrated in-memory database and closes it idempotently', async () => {
    const analytics = await createTestAnalyticsDb()

    await expect(analytics.ready()).resolves.toBe(true)
    await expect(analytics.close()).resolves.toBeUndefined()
    await expect(analytics.close()).resolves.toBeUndefined()
    await expect(analytics.ready()).resolves.toBe(false)
  })

  it('filters occurrence data at the current Site retention boundary', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analyticsPath = join(dir, 'retention-analytics.duckdb')
    const analytics = await createAnalyticsDb({
      path: analyticsPath,
      tempDirectory: join(dir, 'retention-analytics-tmp'),
    })
    const now = Date.parse('2026-09-05T14:30:00.000Z')
    const cutoff = now - 24 * 60 * 60 * 1000

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
          'INSERT INTO retention_policy (id, installation_id, scope, event_months, profile_months, version, status, effective_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('rtn-1', 'ins-1', 'installation', 1, 1, 1, 'active', now, now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO retention_effective_cutoff (site_id, installation_id, policy_id, reporting_timezone, local_day, event_occurrence_cutoff_at, raw_receipt_cutoff_at, profile_activity_cutoff_at, effective_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'ste-1',
          'ins-1',
          'rtn-1',
          'UTC',
          '2026-09-05',
          cutoff - 2,
          cutoff - 2,
          cutoff - 2,
          now,
          now,
        )
      for (const [eventPk, eventId, occurrenceTime] of [
        [1, 'expired', cutoff - 1] as const,
        [2, 'retained', cutoff + 1] as const,
      ]) {
        controlDb.$client
          .prepare(
            'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            eventPk,
            'ste-1',
            eventId,
            'custom_event',
            occurrenceTime,
            occurrenceTime,
            'vis-1',
            'ses-1',
            'pol-1',
            eventPk,
            `fingerprint-${eventPk}`,
            'pending',
            occurrenceTime,
          )
      }

      await analytics.rebuild({ controlDb })
      await expect(
        analytics.deleteExpired({ siteId: 'ste-1', occurrenceCutoff: new Date(cutoff) }),
      ).resolves.toBe(1)
      await analytics.close()

      const inspectionInstance = await DuckDBInstance.create(analyticsPath)
      const inspectionConnection = await inspectionInstance.connect()
      try {
        const events = await inspectionConnection.runAndReadAll(
          'SELECT event_id FROM events ORDER BY event_id',
        )
        expect(events.getRowObjects()).toEqual([{ event_id: 'retained' }])
        const session = await inspectionConnection.runAndReadAll(
          "SELECT started_at, ended_at FROM analytics_sessions WHERE session_id = 'ses-1'",
        )
        expect(String(session.getRowObjects()[0]?.['started_at'])).toContain('2026-09-04')
        expect(String(session.getRowObjects()[0]?.['ended_at'])).toContain('2026-09-04')
        const visitor = await inspectionConnection.runAndReadAll(
          "SELECT first_seen_at, last_seen_at FROM visitors WHERE visitor_id = 'vis-1'",
        )
        expect(String(visitor.getRowObjects()[0]?.['first_seen_at'])).toContain('2026-09-04')
        expect(String(visitor.getRowObjects()[0]?.['last_seen_at'])).toContain('2026-09-04')
        const checkpoint = await inspectionConnection.runAndReadAll(
          "SELECT effective_retention_from FROM projection_checkpoints WHERE site_id = 'ste-1'",
        )
        expect(String(checkpoint.getRowObjects()[0]?.['effective_retention_from'])).toContain(
          '2026-09-04',
        )
      } finally {
        inspectionConnection.closeSync()
        inspectionInstance.closeSync()
      }
    } finally {
      closeDb(controlDb)
      await analytics.close()
    }
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
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, anonymous_identity_id, visitor_id, identified_user_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          1,
          'ste-1',
          'evt-1',
          'custom_event',
          now,
          now,
          'vis-1',
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
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, anonymous_identity_id, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          5,
          'ste-1',
          'evt-5',
          'custom_event',
          now + 500,
          now - 2_000,
          'vis-2',
          'vis-2',
          'ses-2',
          'pol-1',
          5,
          'fingerprint-5',
          'pending',
          now - 2_000,
        )
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
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, anonymous_identity_id, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          2,
          'ste-1',
          'evt-2',
          'page_view',
          now + 1_000,
          now + 1_000,
          'vis-1',
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
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, anonymous_identity_id, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          3,
          'ste-1',
          'evt-3',
          'page_view',
          now + 2_000,
          now + 2_000,
          'vis-1',
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
          'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, anonymous_identity_id, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          4,
          'ste-1',
          'evt-4',
          'custom_event',
          now + 3_000,
          now + 3_000,
          'vis-2',
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
          events: 4,
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
        const receiptBoundEvent = await inspectionConnection.runAndReadAll(
          "SELECT identified_user_id FROM events WHERE event_id = 'evt-5'",
        )
        expect(receiptBoundEvent.getRowObjects()[0]?.['identified_user_id']).toBeNull()
        const checkpoint = await inspectionConnection.runAndReadAll(
          "SELECT projected_replay_sequence, projected_fact_cardinality, readiness, projection_version FROM projection_checkpoints WHERE site_id = 'ste-1'",
        )
        expect(checkpoint.getRowObjects()[0]).toMatchObject({
          projected_replay_sequence: 5n,
          projected_fact_cardinality: 4n,
          readiness: 'ready',
          projection_version: 'v5',
        })
        const emptySiteCheckpoint = await inspectionConnection.runAndReadAll(
          "SELECT projected_replay_sequence, projected_fact_cardinality, readiness, projection_version, updated_at FROM projection_checkpoints WHERE site_id = 'ste-2'",
        )
        expect(emptySiteCheckpoint.getRowObjects()[0]).toMatchObject({
          projected_replay_sequence: 0n,
          projected_fact_cardinality: 0n,
          readiness: 'ready',
          projection_version: 'v5',
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

  it('republishes the fact cardinality when retention deletes events', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()
    const now = Date.parse('2026-09-05T14:30:00.000Z')
    const cutoff = now - 24 * 60 * 60 * 1000

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
          'INSERT INTO installation (id, status, data_directory_ready, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('ins-1', 'ready', 1, now, now)
      controlDb.$client
        .prepare(
          'INSERT INTO collection_policy_revision (id, installation_id, scope, version, policy_json, effective_from, committed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('pol-1', 'ins-1', 'installation', 1, '{}', now, now, now)
      const insertEvent = controlDb.$client.prepare(
        'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      insertEvent.run(
        1,
        'ste-1',
        'expired',
        'custom_event',
        cutoff - 1_000,
        cutoff - 1_000,
        'vis-1',
        'ses-1',
        'pol-1',
        1,
        'fp-1',
        'pending',
        now,
      )
      insertEvent.run(
        2,
        'ste-1',
        'retained',
        'custom_event',
        cutoff + 1_000,
        cutoff + 1_000,
        'vis-1',
        'ses-1',
        'pol-1',
        2,
        'fp-2',
        'pending',
        now,
      )

      await analytics.rebuild({ controlDb })
      await analytics.deleteExpired({ siteId: 'ste-1', occurrenceCutoff: new Date(cutoff) })

      const snapshot = await analytics.readProjectionSnapshot({ siteId: 'ste-1' })

      expect(snapshot.factCardinality).toBe(1)
      expect(snapshot.checkpoint?.projectedFactCardinality).toBe(1)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('purges all derived rows for one Site and is idempotent', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analyticsPath = join(dir, 'purge-analytics.duckdb')
    const analytics = await createAnalyticsDb({
      path: analyticsPath,
      tempDirectory: join(dir, 'purge-analytics-tmp'),
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
      const insertSite = controlDb.$client.prepare(
        'INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      insertSite.run('ste-1', 'org-1', 'Site', 'example.com', 'ing-1', now, now)
      insertSite.run('ste-2', 'org-1', 'Site 2', 'example.org', 'ing-2', now, now)
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
      const insertEvent = controlDb.$client.prepare(
        'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      for (const [eventPk, siteId, eventId] of [
        [1, 'ste-1', 'evt-1'],
        [2, 'ste-2', 'evt-2'],
      ] as const) {
        insertEvent.run(
          eventPk,
          siteId,
          eventId,
          'custom_event',
          now,
          now,
          `vis-${siteId}`,
          `ses-${siteId}`,
          'pol-1',
          eventPk,
          `fingerprint-${eventPk}`,
          'pending',
          now,
        )
      }
      controlDb.$client
        .prepare(
          'INSERT INTO event_property (event_pk, property_key, value_type, string_value) VALUES (?, ?, ?, ?)',
        )
        .run(1, 'plan', 'string', 'pro')
      const insertCheckpoint = controlDb.$client.prepare(
        'INSERT INTO projection_checkpoint (site_id, projected_replay_sequence, readiness, projection_version, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      insertCheckpoint.run('ste-1', 1, 'ready', 'v4', now)
      insertCheckpoint.run('ste-2', 2, 'ready', 'v4', now)
      const insertGap = controlDb.$client.prepare(
        'INSERT INTO projection_gap (id, site_id, occurrence_from, occurrence_to, observed_at) VALUES (?, ?, ?, ?, ?)',
      )
      insertGap.run('gap-1', 'ste-1', now, now + 1_000, now)
      insertGap.run('gap-2', 'ste-2', now, now + 1_000, now)

      await analytics.rebuild({ controlDb })
      await analytics.purgeSite({ siteId: 'ste-1' })
      await expect(analytics.purgeSite({ siteId: 'ste-1' })).resolves.toBeUndefined()
      await analytics.close()

      const inspectionInstance = await DuckDBInstance.create(analyticsPath)
      const inspectionConnection = await inspectionInstance.connect()
      try {
        const countFor = async (siteId: string) => {
          const reader = await inspectionConnection.runAndReadAll(
            `SELECT
               (SELECT count(*) FROM events WHERE site_id = '${siteId}') AS events,
               (SELECT count(*) FROM visitors WHERE site_id = '${siteId}') AS visitors,
               (SELECT count(*) FROM analytics_sessions WHERE site_id = '${siteId}') AS sessions,
               (SELECT count(*) FROM projection_checkpoints WHERE site_id = '${siteId}') AS checkpoints,
               (SELECT count(*) FROM projection_gaps WHERE site_id = '${siteId}') AS gaps,
               (SELECT count(*) FROM event_properties WHERE site_id = '${siteId}') AS properties`,
          )
          const row = reader.getRowObjects()[0]!
          return {
            events: Number(row['events']),
            visitors: Number(row['visitors']),
            sessions: Number(row['sessions']),
            checkpoints: Number(row['checkpoints']),
            gaps: Number(row['gaps']),
            properties: Number(row['properties']),
          }
        }

        await expect(countFor('ste-1')).resolves.toEqual({
          events: 0,
          visitors: 0,
          sessions: 0,
          checkpoints: 0,
          gaps: 0,
          properties: 0,
        })
        await expect(countFor('ste-2')).resolves.toEqual({
          events: 1,
          visitors: 1,
          sessions: 1,
          checkpoints: 1,
          gaps: 1,
          properties: 0,
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
