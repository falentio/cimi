import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRecord } from '@cimi/utils'
import Database from 'better-sqlite3'

const LEGACY_FIXTURE_FOLDER = fileURLToPath(new URL('./fixtures/legacy-471c10d', import.meta.url))

const LEGACY_MIGRATION_TAGS = [
  '0000_windy_deathbird',
  '0001_mute_darkhawk',
  '0002_milky_beyonder',
  '0003_nice_gabe_jones',
] as const

const SEED_TIMESTAMP = 1787626219132

export interface CreateLegacy471c10dTestDbOptions {
  path: string
}

export interface Legacy471c10dTestDb {
  client: Database.Database
  close(): void
}

export function createLegacy471c10dTestDb(
  options: CreateLegacy471c10dTestDbOptions,
): Legacy471c10dTestDb {
  const client = new Database(options.path)
  try {
    client.pragma('journal_mode = WAL')
    client.pragma('synchronous = FULL')
    client.pragma('foreign_keys = ON')
    client.pragma('busy_timeout = 5000')
    client.pragma('wal_autocheckpoint = 1000')
    applyLegacy471c10dSchema(client)
    applyLegacy471c10dLedger(client)
    seedLegacy471c10dDataset(client)
    return { client, close: () => client.close() }
  } catch (error) {
    client.close()
    throw error
  }
}

export function applyLegacy471c10dSchema(client: Database.Database): void {
  for (const tag of LEGACY_MIGRATION_TAGS) {
    const sql = readFileSync(join(LEGACY_FIXTURE_FOLDER, `${tag}.sql`), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) client.exec(statement)
    }
  }
}

export function seedLegacy471c10dDataset(client: Database.Database): void {
  const now = SEED_TIMESTAMP
  client
    .prepare(
      'INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('legacy-user-1', 'Legacy User', 'legacy-user@example.com', 1, now, now)
  client
    .prepare('INSERT INTO installation (id, created_at, updated_at) VALUES (?, ?, ?)')
    .run('legacy-installation-1', now, now)
  client
    .prepare(
      'INSERT INTO organization (id, name, owner_user_id, is_personal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('legacy-org-1', 'Legacy Organization', 'legacy-user-1', 0, now, now)
  client
    .prepare(
      'INSERT INTO membership (organization_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run('legacy-org-1', 'legacy-user-1', 'owner', now, now)
  const insertSite = client.prepare(
    'INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, reporting_timezone, week_starts_on, status, cleanup_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  insertSite.run(
    'legacy-site-1',
    'legacy-org-1',
    'Legacy Site One',
    'one.legacy.example.com',
    'legacy-ingestion-1',
    'UTC',
    'monday',
    'active',
    'not-required',
    now,
    now,
  )
  insertSite.run(
    'legacy-site-2',
    'legacy-org-1',
    'Legacy Site Two',
    'two.legacy.example.com',
    'legacy-ingestion-2',
    'UTC',
    'monday',
    'active',
    'not-required',
    now,
    now,
  )
  const insertDashboard = client.prepare(
    'INSERT INTO public_dashboard (site_id, enabled, public_identifier, public_identifier_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const dashboardOne = 'legacy-9f2c4e1a'
  const dashboardTwo = 'legacy-7b3d8f5c'
  insertDashboard.run('legacy-site-1', 1, dashboardOne, '9f2c4e1a', now, now)
  insertDashboard.run('legacy-site-2', 1, dashboardTwo, '7b3d8f5c', now, now)
  client
    .prepare(
      'INSERT INTO collection_policy_revision (id, installation_id, scope, site_id, version, policy_json, effective_from, committed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      'legacy-collection-policy-1',
      'legacy-installation-1',
      'installation',
      null,
      1,
      '{}',
      now,
      now,
      now,
    )
  client
    .prepare(
      'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, late, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, projected_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      1,
      'legacy-site-1',
      'legacy-event-1',
      'custom_event',
      now,
      now,
      0,
      'legacy-collection-policy-1',
      1,
      'legacy-fingerprint',
      'projected',
      now,
      now,
    )
  client
    .prepare('INSERT INTO event_payload (event_pk, canonical_payload_json) VALUES (?, ?)')
    .run(1, '{"name":"legacy_event"}')
  client
    .prepare(
      'INSERT INTO retention_policy (id, installation_id, site_id, scope, event_months, profile_months, replay_months, version, status, effective_from, changed_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      'legacy-retention-policy-1',
      'legacy-installation-1',
      null,
      'installation',
      12,
      12,
      null,
      1,
      'active',
      now,
      null,
      now,
      now,
    )
  client
    .prepare(
      'INSERT INTO retention_cleanup_run (id, installation_id, site_id, policy_id, cleanup_kind, status, cutoff_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      'legacy-cleanup-run-1',
      'legacy-installation-1',
      'legacy-site-1',
      'legacy-retention-policy-1',
      'derived',
      'queued',
      now,
      now,
      now,
    )
  client
    .prepare(
      'INSERT INTO account (id, account_id, provider_id, user_id, issuer, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      'legacy-account-1',
      'legacy-subject-1',
      'credential',
      'legacy-user-1',
      'https://legacy.example.com',
      now,
      now,
    )
  client
    .prepare(
      'INSERT INTO session (id, expires_at, token, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('legacy-session-1', now + 86_400_000, 'legacy-session-token', 'legacy-user-1', now, now)
  client
    .prepare(
      'INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      'legacy-verification-1',
      'legacy-user@example.com',
      'legacy-verification-value',
      now + 86_400_000,
      now,
      now,
    )
}

export function applyLegacy471c10dLedger(client: Database.Database): void {
  client.exec(
    'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "hash" TEXT NOT NULL, "created_at" NUMERIC)',
  )
  const entries = readLegacyJournal()
  const insert = client.prepare(
    'INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)',
  )
  for (const entry of entries) {
    const tag = LEGACY_MIGRATION_TAGS[entry.idx]
    if (tag === undefined) throw new Error('Legacy migration journal entry is invalid')
    const sql = readFileSync(join(LEGACY_FIXTURE_FOLDER, `${tag}.sql`))
    insert.run(entry.idx + 1, createHash('sha256').update(sql).digest('hex'), entry.when)
  }
}

interface LegacyJournalEntry {
  readonly idx: number
  readonly when: number
}

function readLegacyJournal(): readonly LegacyJournalEntry[] {
  const parsed: unknown = JSON.parse(
    readFileSync(join(LEGACY_FIXTURE_FOLDER, 'meta/_journal.json'), 'utf8'),
  )
  if (!isRecord(parsed) || !Array.isArray(parsed['entries'])) {
    throw new Error('Legacy migration journal is invalid')
  }
  return parsed['entries'].map((entry) => {
    if (!isRecord(entry) || typeof entry['idx'] !== 'number' || typeof entry['when'] !== 'number') {
      throw new Error('Legacy migration journal entry is invalid')
    }
    return { idx: entry['idx'], when: entry['when'] }
  })
}
