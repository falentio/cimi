import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDb } from '../../migrate.ts'
import { createTestAnalyticsDb } from '../../testing/index.ts'

describe('readProjectionSnapshot', () => {
  it('returns a null checkpoint for an unprojected Site without inventing statistics', async () => {
    const analytics = await createTestAnalyticsDb()
    try {
      const snapshot = await analytics.readProjectionSnapshot({ siteId: 'ste-missing' })

      expect(snapshot.checkpoint).toBeNull()
      expect(snapshot.openGaps).toEqual([])
      expect(snapshot.factCardinality).toBe(0)
    } finally {
      await analytics.close()
    }
  })

  it('reads checkpoint, open gaps, and cardinality from one consistent view', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cimi-projection-read-'))
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()
    const now = Date.parse('2026-09-05T00:00:00.000Z')
    try {
      migrateControlDb(controlDb)
      seedControlDb(controlDb, now, { statisticsRefreshedAt: now })
      await analytics.rebuild({ controlDb })

      const snapshot = await analytics.readProjectionSnapshot({ siteId: 'ste-1' })

      expect(snapshot.checkpoint).toMatchObject({
        projectedAcceptanceSequence: 3,
        readiness: 'ready',
      })
      expect(snapshot.checkpoint?.occurrenceCoveredFrom?.getTime()).toBe(now)
      expect(snapshot.checkpoint?.occurrenceCoveredThrough?.getTime()).toBe(now + 2_000)
      expect(snapshot.checkpoint?.statisticsRefreshedAt?.getTime()).toBe(now)
      expect(snapshot.factCardinality).toBe(3)
      expect(snapshot.openGaps).toEqual([
        {
          id: 'gap-open-1',
          occurrenceFrom: new Date(now - 10_000),
          occurrenceTo: new Date(now - 5_000),
          unbounded: false,
        },
      ])
    } finally {
      await analytics.close()
      closeDb(controlDb)
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('carries a null statistics refresh through to the snapshot', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()
    const now = Date.parse('2026-09-05T00:00:00.000Z')
    try {
      migrateControlDb(controlDb)
      seedControlDb(controlDb, now, { statisticsRefreshedAt: null })
      await analytics.rebuild({ controlDb })

      const snapshot = await analytics.readProjectionSnapshot({ siteId: 'ste-1' })

      expect(snapshot.checkpoint?.statisticsRefreshedAt).toBeNull()
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})

function seedControlDb(
  controlDb: ReturnType<typeof createDb>,
  now: number,
  options: { readonly statisticsRefreshedAt: number | null },
): void {
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
    .run('ste-1', 'ins-1', 'rtn-1', 'UTC', '2026-09-05', now, now, now, now, now)
  const insertEvent = controlDb.$client.prepare(
    'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const [eventPk, offset] of [
    [1, 0],
    [2, 1_000],
    [3, 2_000],
  ] as const) {
    insertEvent.run(
      eventPk,
      'ste-1',
      `evt-${eventPk}`,
      'custom_event',
      now + offset,
      now + offset,
      'vis-1',
      'ses-1',
      'pol-1',
      eventPk,
      `fingerprint-${eventPk}`,
      'pending',
      now + offset,
    )
  }
  controlDb.$client
    .prepare(
      'INSERT INTO projection_checkpoint (site_id, projected_replay_sequence, occurrence_covered_from, occurrence_covered_through, statistics_refreshed_at, readiness, projection_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('ste-1', 3, now, now + 2_000, options.statisticsRefreshedAt, 'ready', 'v4', now)
  const insertGap = controlDb.$client.prepare(
    'INSERT INTO projection_gap (id, site_id, occurrence_from, occurrence_to, status, observed_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  insertGap.run('gap-open-1', 'ste-1', now - 10_000, now - 5_000, 'open', now, null)
  insertGap.run('gap-resolved-1', 'ste-1', now - 30_000, now - 20_000, 'resolved', now, now)
}
